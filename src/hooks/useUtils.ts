import { queryOptions, useQuery } from "@tanstack/react-query";
import { Employees } from "../types/global.type";
import { supabase } from "../lib/supabaseClient";
import { specialitiesQueryOptions } from "./useSpecializations";
import { settingsRolesQueryOptions } from "./settings/useRoles";

export const hrManagersKey = ["hr", "managers"] as const;

async function fetchManagers(): Promise<Employees[]> {
  const { data: roleData, error: roleError } = await supabase
    .from("roles")
    .select("*")
    .eq("name", "Manager")
    .single();
  if (roleError) throw roleError;
  if (!roleData) return [];

  const { data: UserRoles, error: userRolesError } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role_id", [roleData.id]);
  if (userRolesError) throw userRolesError;

  const userIds = UserRoles?.map((ur) => ur.user_id).filter(Boolean) ?? [];
  if (userIds.length === 0) return [];

  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .in("id", userIds);
  if (error) throw error;
  return data ?? [];
}

export const hrManagersQueryOptions = () =>
  queryOptions({ queryKey: hrManagersKey, queryFn: fetchManagers });

export function useUtils() {
  const specializationsQuery = useQuery(specialitiesQueryOptions());
  const rolesQuery = useQuery(settingsRolesQueryOptions());
  const managersQuery = useQuery(hrManagersQueryOptions());

  return {
    specializations: specializationsQuery.data ?? [],
    roles: rolesQuery.data ?? [],
    managers: managersQuery.data ?? [],
    loading:
      specializationsQuery.isPending ||
      rolesQuery.isPending ||
      managersQuery.isPending,
    error: (specializationsQuery.error ??
      rolesQuery.error ??
      managersQuery.error) as Error | null,
  };
}
