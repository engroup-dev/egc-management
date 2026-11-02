import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import type { employeesWithRole } from "../../components/hr/list/EmployeesList";

// Not ["employees"]: that key holds plain rows (useEmployees); this list
// also carries each employee's user role for the HR table.
export const hrEmployeesListKey = ["hr", "employees-list"] as const;

async function fetchEmployeesList(): Promise<employeesWithRole[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("*, users(roles!users_role_id_fkey(*))");
  if (error) {
    console.error("Error fetching employees:", error);
    throw error;
  }
  return (data ?? []) as employeesWithRole[];
}

// Exported so the background prefetcher can warm this screen.
export const hrEmployeesListQueryOptions = () =>
  queryOptions({ queryKey: hrEmployeesListKey, queryFn: fetchEmployeesList });

export function useEmployeesList() {
  const query = useQuery(hrEmployeesListQueryOptions());
  return { employees: query.data ?? [] };
}
