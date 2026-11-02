import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";

// =====================================================================
// Job-function roles only.
// =====================================================================
// Contractor / Vendor / Client are excluded. Under the target design
// they are party types on the account (users.party_type, added by
// phase1-schema.sql section 4), not job functions, and offering role
// baseline permissions for "Client" would be nonsense.
//
// A NOTE ON THE EXPECTED COUNT — worth reading before you file a bug:
// the Phase 3 brief says "the 13 job-function roles that survived Phase
// 1's cleanup". Phase 1 took the roles table from 16 to 13 by deleting
// Supplier, Treasury and Finance. Of those 13, three are the party
// types excluded here, so THIS LIST SHOWS 10, not 13. That matches
// phase0-verification.md section 2, which says in as many words:
// "leaving 10 job-function roles: Admin, Manager, Engineer, HR, Head
// Finance, Bookkeeper, Secretary, Developer, CleaningSupervisor, Labor
// Supplier. That is the list you'll be configuring baseline permissions
// against in Phase 3."
//
// Filtering is by name because the party-type roles have no marker
// column of their own. They are deleted in Phase 8, at which point this
// filter can go.
// =====================================================================

export const PARTY_TYPE_ROLE_NAMES = ["Contractor", "Vendor", "Client"];

export const JOB_ROLES_KEY = ["job-roles"];

export interface JobRole {
  id: string;
  name: string;
  code: string | null;
  holder_count: number;
}

// Exported for the background prefetcher (src/lib/prefetch).
export const jobRolesQueryOptions = () =>
  queryOptions<JobRole[]>({
    queryKey: JOB_ROLES_KEY,
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("roles")
        .select("id, name, code")
        .order("name");
      if (error) throw error;

      // Holder count from user_roles — the single source of truth for
      // role membership, matching the resolver (phase2-resolver.sql,
      // DECISION 7). Deliberately NOT users.role_id, which is the other,
      // divergent copy that Phase 8 removes.
      const { data: memberships, error: membershipError } = await supabase
        .from("user_roles")
        .select("role_id");
      if (membershipError) throw membershipError;

      const counts = new Map<string, number>();
      for (const row of memberships ?? []) {
        counts.set(row.role_id, (counts.get(row.role_id) ?? 0) + 1);
      }

      return (roles ?? [])
        .filter((r) => !PARTY_TYPE_ROLE_NAMES.includes(r.name))
        .map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
          holder_count: counts.get(r.id) ?? 0,
        }));
    },
  });

export function useJobRoles() {
  return useQuery(jobRolesQueryOptions());
}

export function useJobRole(id: string | undefined) {
  const query = useJobRoles();
  return {
    ...query,
    data: query.data?.find((r) => r.id === id) ?? null,
  };
}

export interface RoleHolder {
  id: string;
  full_name: string;
  email: string | null;
}

/** Everyone who holds this role, via user_roles. */
export function useRoleHolders(roleId: string | undefined) {
  return useQuery<RoleHolder[]>({
    queryKey: ["role-holders", roleId ?? "none"],
    enabled: Boolean(roleId),
    queryFn: async () => {
      const { data: memberships, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role_id", roleId as string);
      if (error) throw error;

      const ids = (memberships ?? []).map((m) => m.user_id);
      if (ids.length === 0) return [];

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
