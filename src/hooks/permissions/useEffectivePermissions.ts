import { useQuery } from "@tanstack/react-query";
import { permissionsDb } from "../../lib/permissionsDb";
import { supabase } from "../../lib/supabaseClient";
import { TIERS } from "../../lib/queryClient";
import type {
  EffectivePermissionRow,
  GrantScope,
} from "../../types/permissions.types";

// =====================================================================
// READ-ONLY, DISPLAY-ONLY.
// =====================================================================
// Everything in this file is informational text on an admin screen.
// NOTHING here gates a route, hides a menu item, disables a button, or
// changes what any other screen renders. Both apps still run entirely
// on their existing hardcoded role-string checks — replacing those is
// Phase 7, not this phase.
//
// If you are reading this while working on Phase 7: that is when these
// calls start driving behaviour, and that is when the caching plan in
// phase2-resolver.sql section 6 becomes relevant.
// =====================================================================

export const effectivePermissionsKey = (userId: string) => [
  "effective-permissions",
  userId,
];

/**
 * The resolver's own answer for one person, company-wide (no project).
 *
 * A LIMITATION WORTH UNDERSTANDING BEFORE TRUSTING THE OUTPUT:
 * project-scoped permissions come back allowed = false with
 * source_layer = 'no_project_context', because the resolver refuses to
 * answer a project question without a project (phase2-resolver.sql,
 * DECISION 3). That is correct behaviour, not a bug — but it means this
 * call alone cannot tell you where an engineer's project permissions
 * come from. useInheritedGrants below covers that gap.
 */
export function useEffectivePermissions(userId: string | undefined) {
  return useQuery<EffectivePermissionRow[]>({
    queryKey: effectivePermissionsKey(userId ?? "none"),
    enabled: Boolean(userId),
    ...TIERS.E,
    queryFn: async () => {
      const { data, error } = await permissionsDb.rpc("effective_permissions", {
        p_user_id: userId as string,
      });
      if (error) throw error;
      return (data ?? []) as EffectivePermissionRow[];
    },
  });
}

// ---------------------------------------------------------------------
// Inherited grants — what the role and department layers say
// ---------------------------------------------------------------------

export interface InheritedGrant {
  permission_id: string;
  allowed: boolean;
  scope: GrantScope;
  /** Which layer it came from, and the human name of the owner. */
  layer: "role_baseline" | "department_baseline";
  ownerName: string;
}

export const inheritedGrantsKey = (userId: string) => [
  "inherited-grants",
  userId,
];

/**
 * What layers 4 and 5 say about this person, before their own override.
 *
 * This reads the grant tables directly rather than calling the resolver,
 * for one reason: the user-override screen needs to show inheritance for
 * project-scoped permissions too, and the resolver cannot answer those
 * without a project (see above). Reading the two baseline layers gives an
 * accurate "before your override" picture for every permission.
 *
 * It applies the same precedence the resolver does — department (layer 4)
 * beats role (layer 5) — so the answer agrees with the resolver wherever
 * the resolver can answer. It deliberately does NOT re-implement scope
 * evaluation or team membership; the returned scope is displayed as-is so
 * the admin can see it, not silently applied.
 */
export function useInheritedGrants(userId: string | undefined) {
  return useQuery<Record<string, InheritedGrant>>({
    queryKey: inheritedGrantsKey(userId ?? "none"),
    enabled: Boolean(userId),
    ...TIERS.E,
    queryFn: async () => {
      const result: Record<string, InheritedGrant> = {};

      // --- Layer 5: role baselines -------------------------------------
      // Role membership comes from user_roles, matching the resolver
      // (phase2-resolver.sql, DECISION 7).
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("role_id, roles(name)")
        .eq("user_id", userId as string);
      if (roleError) throw roleError;

      const roleIds = (roleRows ?? []).map((r) => r.role_id);
      const roleNameById = new Map<string, string>(
        (roleRows ?? []).map((r) => [
          r.role_id,
          // The embedded relation comes back as an object or an array
          // depending on how PostgREST resolves it; handle both.
          (Array.isArray(r.roles) ? r.roles[0]?.name : (r.roles as { name?: string })?.name) ??
            "دور",
        ]),
      );

      if (roleIds.length > 0) {
        const { data, error } = await permissionsDb
          .from("role_permission_grants")
          .select("role_id, permission_id, allowed, scope")
          .in("role_id", roleIds);
        if (error) throw error;

        for (const row of data ?? []) {
          const existing = result[row.permission_id];
          // Multiple roles: deny wins, matching the resolver's bool_and
          // (phase2-resolver.sql, DECISION 5).
          if (existing && existing.allowed === false) continue;
          result[row.permission_id] = {
            permission_id: row.permission_id,
            allowed: existing ? existing.allowed && row.allowed : row.allowed,
            scope: row.scope,
            layer: "role_baseline",
            ownerName: roleNameById.get(row.role_id) ?? "دور",
          };
        }
      }

      // --- Layer 4: department baseline (overwrites role) --------------
      const { data: employeeRow, error: employeeError } = await permissionsDb
        .from("employees")
        .select("department_id")
        .eq("id", userId as string)
        .maybeSingle();
      if (employeeError) throw employeeError;

      const departmentId = employeeRow?.department_id ?? null;
      if (departmentId) {
        const { data: department } = await permissionsDb
          .from("departments")
          .select("name, name_ar")
          .eq("id", departmentId)
          .maybeSingle();

        const departmentName =
          department?.name_ar || department?.name || "القسم";

        const { data, error } = await permissionsDb
          .from("department_permission_grants")
          .select("permission_id, allowed, scope")
          .eq("department_id", departmentId);
        if (error) throw error;

        for (const row of data ?? []) {
          result[row.permission_id] = {
            permission_id: row.permission_id,
            allowed: row.allowed,
            scope: row.scope,
            layer: "department_baseline",
            ownerName: departmentName,
          };
        }
      }

      return result;
    },
  });
}
