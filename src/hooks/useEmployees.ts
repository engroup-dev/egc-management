import { Dispatch, SetStateAction, useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { permissionsDb } from "../lib/permissionsDb";
import { Employees, Projects } from "../types/global.type";
import {
  EmployeeTeamMembership,
  FullEmployee,
} from "../types/extended.type";
import { PostgrestError } from "@supabase/supabase-js";
import { hrEmployeesListKey } from "./hr/useEmployeesList";

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

async function fetchEmployeesBySpecialization(
  specializationId: string,
): Promise<EmployeeSummary[]> {
  const { data, error } = await supabase
    .from("employee_specialities")
    .select("employee:employees(id, first_name, last_name, email)")
    .eq("speciality_id", specializationId);
  if (error) throw error;
  return (data ?? [])
    .map((d: { employee: unknown }) => d.employee as EmployeeSummary)
    .filter(Boolean);
}

export const employeesBySpecializationQueryOptions = (
  specializationId: string | undefined,
) =>
  queryOptions({
    queryKey: ["hr", "employees-by-specialization", specializationId],
    queryFn: () => fetchEmployeesBySpecialization(specializationId as string),
    enabled: !!specializationId,
  });

/** Employees having a given specialization, for the specialization detail page. */
export function useEmployeesBySpecialization(
  specializationId: string | undefined,
) {
  const query = useQuery(
    employeesBySpecializationQueryOptions(specializationId),
  );
  return {
    employees: query.data ?? [],
    // Was false while there was no id to fetch; isPending would be true.
    loading: !!specializationId && query.isPending,
    error: query.error as PostgrestError | null,
  };
}

async function fetchEmployeeCountsBySpecialization(): Promise<
  Record<string, number>
> {
  const { data, error } = await supabase
    .from("employee_specialities")
    .select("speciality_id");
  if (error) throw error;
  return (data ?? []).reduce<Record<string, number>>(
    (acc, row: { speciality_id: string }) => {
      if (row.speciality_id)
        acc[row.speciality_id] = (acc[row.speciality_id] ?? 0) + 1;
      return acc;
    },
    {},
  );
}

// Exported so the background prefetcher can warm this screen.
export const employeeCountsBySpecializationQueryOptions = () =>
  queryOptions({
    queryKey: ["hr", "employee-counts-by-specialization"],
    queryFn: fetchEmployeeCountsBySpecialization,
  });

/** Employee count per specialization, for the specializations settings page. */
export function useEmployeeCountsBySpecialization() {
  const query = useQuery(employeeCountsBySpecializationQueryOptions());
  return {
    countsBySpecialization: query.data ?? {},
    loading: query.isPending,
    error: query.error as PostgrestError | null,
  };
}

export const hrEmployeeKey = (id: string) => ["hr", "employee", id] as const;

async function fetchEmployee(id: string): Promise<FullEmployee> {
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

  if (employeeError) throw employeeError;
  if (!employeeData) throw new Error("Employee not found");

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

  const normalizedProjectData: EmployeeTeamMembership[] = teamAssignments.map(
    (row) => ({
      id: row.id,
      project_id: row.project_id,
      project_role_id: row.project_role_id,
      assigned_at: row.assigned_at,
      projects: projectById.get(row.project_id) ?? null,
      project_roles: projectRoleById.get(row.project_role_id) ?? null,
    }),
  );

  // 4) payroll
  const { data: payrollData } = await supabase
    .from("payroll")
    .select("*")
    .eq("employee_id", id);

  // 5) leaves

  return {
    ...employeeData,
    user_role: roleData ?? null,
    projects: normalizedProjectData,
    payroll: payrollData ?? [],
  };
}

export const employeeQueryOptions = (id: string) =>
  queryOptions({
    queryKey: hrEmployeeKey(id),
    queryFn: () => fetchEmployee(id),
    enabled: !!id,
  });

export function useEmployee(id: string) {
  const queryClient = useQueryClient();
  const query = useQuery(employeeQueryOptions(id));
  const { refetch: refetchQuery } = query;

  // Callers refetch after editing the employee (role, details), which the
  // cached employee lists also show.
  const refetch = useCallback(async () => {
    if (!id) return;
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ queryKey: hrEmployeesListKey });
    await refetchQuery();
  }, [id, queryClient, refetchQuery]);

  const setEmployee: Dispatch<SetStateAction<FullEmployee | null>> =
    useCallback(
      (action) => {
        queryClient.setQueryData<FullEmployee | null>(
          hrEmployeeKey(id),
          (prev) =>
            typeof action === "function" ? action(prev ?? null) : action,
        );
      },
      [queryClient, id],
    );

  return {
    employee: query.data ?? null,
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    refetch,
    setEmployee,
  };
}
