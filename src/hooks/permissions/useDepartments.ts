import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { permissionsDb } from "../../lib/permissionsDb";
import { supabase } from "../../lib/supabaseClient";
import type { DepartmentRow } from "../../types/permissions.types";

export const DEPARTMENTS_KEY = ["departments"];
export const departmentKey = (id: string) => ["department", id];
export const departmentMembersKey = (id: string) => ["department-members", id];

export interface DepartmentWithCount extends DepartmentRow {
  member_count: number;
}

/** Department list with a live member count from employees.department_id. */
// Exported for the background prefetcher (src/lib/prefetch).
export const departmentsQueryOptions = () =>
  queryOptions<DepartmentWithCount[]>({
    queryKey: DEPARTMENTS_KEY,
    queryFn: async () => {
      const { data: departments, error } = await permissionsDb
        .from("departments")
        .select("*")
        .order("name");
      if (error) throw error;

      // Counted client-side rather than with a grouped query: PostgREST
      // has no GROUP BY, and 7 departments over 55 staff is not worth a
      // view or an RPC.
      const { data: employees, error: employeesError } = await permissionsDb
        .from("employees")
        .select("department_id");
      if (employeesError) throw employeesError;

      const counts = new Map<string, number>();
      for (const row of employees ?? []) {
        if (!row.department_id) continue;
        counts.set(row.department_id, (counts.get(row.department_id) ?? 0) + 1);
      }

      return (departments ?? []).map((d) => ({
        ...d,
        member_count: counts.get(d.id) ?? 0,
      }));
    },
  });

export function useDepartments() {
  return useQuery(departmentsQueryOptions());
}

export function useDepartment(id: string | undefined) {
  return useQuery<DepartmentRow | null>({
    queryKey: departmentKey(id ?? "none"),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("departments")
        .select("*")
        .eq("id", id as string)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export interface NewDepartment {
  name: string;
  name_ar: string;
  code: string;
}

/**
 * Creates a department with NO permissions.
 *
 * guide section 4.1 step 3: "The department now exists with no
 * permissions at all — an empty department grants nothing. This is
 * intentional: creation and capability are two separate acts, so a new
 * department can't accidentally inherit anything."
 */
export function useCreateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewDepartment) => {
      const { data, error } = await permissionsDb
        .from("departments")
        .insert({
          name: input.name.trim(),
          name_ar: input.name_ar.trim() || null,
          code: input.code.trim().toUpperCase(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEY });
    },
  });
}

export interface DepartmentMember {
  id: string;
  full_name: string;
  email: string | null;
}

/** Staff currently placed in this department. */
export function useDepartmentMembers(departmentId: string | undefined) {
  return useQuery<DepartmentMember[]>({
    queryKey: departmentMembersKey(departmentId ?? "none"),
    enabled: Boolean(departmentId),
    queryFn: async () => {
      const { data: employees, error } = await permissionsDb
        .from("employees")
        .select("id")
        .eq("department_id", departmentId as string);
      if (error) throw error;

      const ids = (employees ?? []).map((e) => e.id);
      if (ids.length === 0) return [];

      // employees.id IS users.id (1:1 FK), so names come from users.
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, first_name, last_name, email")
        .in("id", ids);
      if (usersError) throw usersError;

      return (users ?? []).map((u) => ({
        id: u.id,
        full_name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "—",
        email: u.email,
      }));
    },
  });
}

/**
 * Assigns or clears a person's department.
 *
 * One department per person (guide section 7, decision 2), so this is a
 * straight assignment on employees.department_id — not a join table and
 * not a multi-select. Passing null removes them from whatever department
 * they were in.
 */
export function useSetEmployeeDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      employeeId,
      departmentId,
    }: {
      employeeId: string;
      departmentId: string | null;
    }) => {
      const { error } = await permissionsDb
        .from("employees")
        .update({ department_id: departmentId })
        .eq("id", employeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEY });
      queryClient.invalidateQueries({ queryKey: ["department-members"] });
      queryClient.invalidateQueries({ queryKey: ["effective-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["inherited-grants"] });
      queryClient.invalidateQueries({ queryKey: ["assignable-staff"] });
    },
  });
}

export interface AssignableStaff {
  id: string;
  full_name: string;
  email: string | null;
  department_id: string | null;
  current_department_name: string | null;
}

/**
 * Company staff who can be placed in a department.
 *
 * Includes people already in another department — moving someone is a
 * legitimate action, and hiding them would make it impossible. The UI
 * shows their current department so the admin knows it is a move.
 */
export function useAssignableStaff() {
  return useQuery<AssignableStaff[]>({
    queryKey: ["assignable-staff"],
    queryFn: async () => {
      const { data: employees, error } = await permissionsDb
        .from("employees")
        .select("id, department_id");
      if (error) throw error;
      if (!employees || employees.length === 0) return [];

      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, first_name, last_name, email")
        .in(
          "id",
          employees.map((e) => e.id),
        );
      if (usersError) throw usersError;

      const { data: departments } = await permissionsDb
        .from("departments")
        .select("id, name, name_ar");
      const departmentNameById = new Map(
        (departments ?? []).map((d) => [d.id, d.name_ar || d.name]),
      );

      const departmentByEmployee = new Map(
        employees.map((e) => [e.id, e.department_id]),
      );

      return (users ?? [])
        .map((u) => {
          const departmentId = departmentByEmployee.get(u.id) ?? null;
          return {
            id: u.id,
            full_name:
              `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "—",
            email: u.email,
            department_id: departmentId,
            current_department_name: departmentId
              ? (departmentNameById.get(departmentId) ?? null)
              : null,
          };
        })
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "ar"));
    },
  });
}

/**
 * The department one person is in, resolved to a display name.
 *
 * Read here rather than from the employee object the profile page
 * already has, because employees.department_id was added by Phase 1 and
 * is not in the generated types yet — so the existing page's typed
 * employee row does not know the column exists.
 */
export function useEmployeeDepartment(employeeId: string | undefined) {
  return useQuery<{ id: string; name: string } | null>({
    queryKey: ["employee-department", employeeId ?? "none"],
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data: employee, error } = await permissionsDb
        .from("employees")
        .select("department_id")
        .eq("id", employeeId as string)
        .maybeSingle();
      if (error) throw error;
      if (!employee?.department_id) return null;

      const { data: department } = await permissionsDb
        .from("departments")
        .select("id, name, name_ar")
        .eq("id", employee.department_id)
        .maybeSingle();
      if (!department) return null;

      return { id: department.id, name: department.name_ar || department.name };
    },
  });
}
