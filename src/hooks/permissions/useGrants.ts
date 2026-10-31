import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { permissionsDb } from "../../lib/permissionsDb";
import type { ExistingGrant, GrantDiff } from "../../components/permissions/permissionModel";

// =====================================================================
// Read + save for the three company-wide grant layers.
// =====================================================================
// One hook family for all three because the tables are identical apart
// from their owning column. Phase 6's two project layers are NOT here —
// they have no scope column and a different key, and this phase must
// not write them.
// =====================================================================

export type GrantLayer = "role" | "department" | "user";

interface LayerConfig {
  table: "role_permission_grants" | "department_permission_grants" | "user_permission_grants";
  ownerColumn: "role_id" | "department_id" | "user_id";
}

const LAYERS: Record<GrantLayer, LayerConfig> = {
  role: { table: "role_permission_grants", ownerColumn: "role_id" },
  department: {
    table: "department_permission_grants",
    ownerColumn: "department_id",
  },
  user: { table: "user_permission_grants", ownerColumn: "user_id" },
};

export const grantsKey = (layer: GrantLayer, ownerId: string) => [
  "permission-grants",
  layer,
  ownerId,
];

/** Every grant currently stored for one role / department / user. */
export function useGrants(layer: GrantLayer, ownerId: string | undefined) {
  return useQuery<ExistingGrant[]>({
    queryKey: grantsKey(layer, ownerId ?? "none"),
    enabled: Boolean(ownerId),
    queryFn: async () => {
      const config = LAYERS[layer];
      const { data, error } = await permissionsDb
        .from(config.table)
        .select("permission_id, allowed, scope, note")
        .eq(config.ownerColumn, ownerId as string);

      if (error) throw error;
      return (data ?? []) as ExistingGrant[];
    },
  });
}

interface SaveArgs {
  layer: GrantLayer;
  ownerId: string;
  diff: GrantDiff;
  /** users.id of whoever is making the change, for the audit columns. */
  grantedBy: string | null;
}

/**
 * Applies a diff.
 *
 * Deletes run before upserts so that a permission flipped from allow to
 * unset and back within one editing session cannot collide with itself.
 *
 * IMPORTANT: this is two statements, not a transaction. PostgREST has no
 * client-side transaction, so a failure between the delete and the
 * upsert leaves a partial save. The blast radius is one owner's grants
 * and the screen refetches immediately, so the admin sees the real state
 * rather than a stale optimistic one. If that ever becomes unacceptable,
 * the fix is a single Postgres function taking the whole diff as JSON —
 * deliberately not built now, since Phase 3 configuration is entered by
 * one admin at a time.
 */
export function useSaveGrants() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ layer, ownerId, diff, grantedBy }: SaveArgs) => {
      const config = LAYERS[layer];

      if (diff.deletes.length > 0) {
        const { error } = await permissionsDb
          .from(config.table)
          .delete()
          .eq(config.ownerColumn, ownerId)
          .in("permission_id", diff.deletes);
        if (error) throw error;
      }

      if (diff.upserts.length > 0) {
        const rows = diff.upserts.map((row) => ({
          [config.ownerColumn]: ownerId,
          permission_id: row.permission_id,
          allowed: row.allowed,
          scope: row.scope,
          note: row.note,
          granted_by: grantedBy,
        }));

        const { error } = await permissionsDb
          .from(config.table)
          // Composite primary key (owner, permission) — an existing row
          // is updated in place rather than duplicated.
          .upsert(rows as never, {
            onConflict: `${config.ownerColumn},permission_id`,
          });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: grantsKey(variables.layer, variables.ownerId),
      });
      // Any displayed "where it came from" context is now stale.
      queryClient.invalidateQueries({ queryKey: ["effective-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["inherited-grants"] });
      // The current user's own effective-permissions set is a separate
      // cache slice (useCan). Without this invalidate, an admin editing
      // their own grants only sees the UI react after the 30 s stale
      // window — flip it to a fresh fetch on the next read.
      queryClient.invalidateQueries({ queryKey: ["my-effective-permissions"] });
    },
  });
}
