import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import { RoleFormValues } from "../../types/schema/Role.schema";
import { Roles, Users } from "../../types/global.type";
import { TIERS } from "../../lib/queryClient";

export const settingsRolesKey = ["settings", "roles"] as const;
export const settingsRoleKey = (id: string) =>
  ["settings", "role", id] as const;

async function fetchRoles(): Promise<Roles[]> {
  const { data, error } = await supabase.from("roles").select("*");
  if (error) throw error;
  return data ?? [];
}

// Exported so the background prefetcher can warm this screen. Also read
// by useUtils and EmployeeRole so every roles dropdown shares one cache.
export const settingsRolesQueryOptions = () =>
  queryOptions({
    queryKey: settingsRolesKey,
    queryFn: fetchRoles,
    ...TIERS.A,
  });

interface RoleDetail {
  role: Roles;
  users: Users[];
}

async function fetchRole(id: string): Promise<RoleDetail> {
  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;

  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("*")
    .eq("role_id", id);
  // The users list was always best-effort: the role still shows without it.
  if (usersError) {
    console.error("error fetching users for role", usersError);
  }
  return { role: data, users: usersData ?? [] };
}

export const settingsRoleQueryOptions = (id: string) =>
  queryOptions({
    queryKey: settingsRoleKey(id),
    queryFn: () => fetchRole(id),
    enabled: !!id,
  });

export function useRoles() {
  const queryClient = useQueryClient();
  const query = useQuery(settingsRolesQueryOptions());

  const addRoles = async (form: RoleFormValues) => {
    const { error } = await supabase
      .from("roles")
      .insert({ name: form.name, code: form.code });
    if (error) {
      console.error("error adding role", error);
      return { success: false, error: "خطأ في اضافة الدور" };
    }
    queryClient.invalidateQueries({ queryKey: settingsRolesKey });
    return { success: true };
  };
  return {
    roles: query.data ?? [],
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    addRoles,
  };
}

export function useRole(id: string) {
  // A role's permissions are in role_permission_grants, edited at
  // /settings/permissions/roles/:id (the old role_permissions table is gone).
  const queryClient = useQueryClient();
  const query = useQuery(settingsRoleQueryOptions(id));

  const updateRole = async (form: RoleFormValues) => {
    const { error } = await supabase
      .from("roles")
      .update({ name: form.name, code: form.code })
      .eq("id", id);
    if (error) {
      console.error("error updating role", error);
      return { success: false, error: "خطأ في تحديث الدور" };
    }
    queryClient.setQueryData<RoleDetail>(settingsRoleKey(id), (prev) =>
      prev
        ? { ...prev, role: { ...prev.role, name: form.name, code: form.code } }
        : prev,
    );
    queryClient.setQueryData<Roles[]>(settingsRolesKey, (prev) =>
      prev?.map((r) =>
        r.id === id ? { ...r, name: form.name, code: form.code } : r,
      ),
    );
    return { success: true };
  };

  return {
    role: query.data?.role ?? null,
    users: query.data?.users ?? [],
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    updateRole,
  };
}
