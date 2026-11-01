import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { permissionsDb } from "../lib/permissionsDb";
import { Employees, Projects } from "../types/global.type";
import {
  EmployeeTeamMembership,
  FullEmployee,
} from "../types/extended.type";
import { PostgrestError } from "@supabase/supabase-js";

export function useEmployees() {
  const {
    data = [],
    isPending: loading,
    error,
  } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*");
      if (error) throw error;
      return (data ?? []) as Employees[];
    },
  });

  return {
    employees: data,
    loading,
    error: (error as PostgrestError | null) ?? null,
  };
}

export interface EmployeeSummary {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string;
}

/** Employees having a given specialization, for the specialization detail page. */
export function useEmployeesBySpecialization(
  specializationId: string | undefined,
) {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  useEffect(() => {
    if (!specializationId) return;
    async function fetchEmployees() {
      setLoading(true);
      const { data, error } = await supabase
        .from("employee_specialities")
        .select("employee:employees(id, first_name, last_name, email)")
        .eq("speciality_id", specializationId);

      if (error) {
        console.error("error fetching employees by specialization", error);
        setError(error);
      } else {
        const list = (data ?? [])
          .map((d: { employee: unknown }) => d.employee as EmployeeSummary)
          .filter(Boolean);
        setEmployees(list);
      }
      setLoading(false);
    }
    fetchEmployees();
  }, [specializationId]);

  return { employees, loading, error };
}

/** Employee count per specialization, for the specializations settings page. */
export function useEmployeeCountsBySpecialization() {
  const [countsBySpecialization, setCountsBySpecialization] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PostgrestError | null>(null);

  useEffect(() => {
    async function fetchCounts() {
      setLoading(true);
      const { data, error } = await supabase
        .from("employee_specialities")
        .select("speciality_id");

      if (error) {
        console.error("error fetching employee specialization counts", error);
        setError(error);
      } else {
        const counts = (data ?? []).reduce<Record<string, number>>(
          (acc, row: { speciality_id: string }) => {
            if (row.speciality_id)
              acc[row.speciality_id] =
                (acc[row.speciality_id] ?? 0) + 1;
            return acc;
          },
          {},
        );
        setCountsBySpecialization(counts);
      }
      setLoading(false);
    }
    fetchCounts();
  }, []);

  return { countsBySpecialization, loading, error };
}

export function useEmployee(id: string) {
  const [employee, setEmployee] = useState<FullEmployee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PostgrestError | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      // 1) employee base + certifications + documents
      const { data: employeeData, error: employeeError } = await supabase
        .from("employees")
        .select(
          `
          *,
          employee_certifications(*),
          employee_documents(*),
          payroll(*)
        `,
        )
        .eq("id", id)
        .single();

      if (employeeError || !employeeData) {
        setError(employeeError ?? ({} as PostgrestError));
        setEmployee(null);
        return;
      }

      // 2) role (NOTE: if user_roles.user_id is actually auth user id, this might not be employee id)
      const { data: roleData } = await supabase
        .from("user_roles")
        .select(`*, roles(*)`)
        .eq("user_id", id)
        .maybeSingle();

      // 3) project team memberships
      //    PHASE 4: repointed from project_assignments to
      //    team_assignments. This list feeds ProjectsCard on the employee
      //    profile, which shows project name, code, project role and the
      //    assignment date — team data, no percentage — so it belongs on
      //    the new table.
      //
      //    A person holding two project roles on one project correctly
      //    produces two entries here; nothing downstream assumes
      //    uniqueness per project.
      const { data: teamRows } = await permissionsDb
        .from("team_assignments")
        .select("id, project_id, project_role_id, assigned_at")
        .eq("person_id", id);

      const teamAssignments = teamRows ?? [];
      const assignmentProjectIds = Array.from(
        new Set(teamAssignments.map((r) => r.project_id)),
      );
      const assignmentRoleIds = Array.from(
        new Set(teamAssignments.map((r) => r.project_role_id)),
      );

      const [{ data: assignedProjects }, { data: assignedRoles }] =
        await Promise.all([
          assignmentProjectIds.length
            ? supabase.from("projects").select("*").in("id", assignmentProjectIds)
            : Promise.resolve({ data: [] as Projects[] }),
          assignmentRoleIds.length
            ? permissionsDb
                .from("project_roles")
                .select("id, name")
                .in("id", assignmentRoleIds)
            : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        ]);

      const projectById = new Map(
        ((assignedProjects ?? []) as Projects[]).map((p) => [p.id, p]),
      );
      const projectRoleById = new Map(
        (assignedRoles ?? []).map((r) => [r.id, r]),
      );

      const normalizedProjectData: EmployeeTeamMembership[] =
        teamAssignments.map((row) => ({
          id: row.id,
          project_id: row.project_id,
          project_role_id: row.project_role_id,
          assigned_at: row.assigned_at,
          projects: projectById.get(row.project_id) ?? null,
          project_roles: projectRoleById.get(row.project_role_id) ?? null,
        }));

      // 4) payroll
      const { data: payrollData } = await supabase
        .from("payroll")
        .select("*")
        .eq("employee_id", id);

      // 5) leaves

      const fullEmployeeData: FullEmployee = {
        ...employeeData,
        user_role: roleData ?? null,
        projects: normalizedProjectData,
        payroll: payrollData ?? [],
      };

      setEmployee(fullEmployeeData);
    } catch (err) {
      setError(err as PostgrestError);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { employee, loading, error, refetch, setEmployee };
}
