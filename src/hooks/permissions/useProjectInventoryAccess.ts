import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { permissionsDb } from "../../lib/permissionsDb";
import {
  grantsForLevel,
  levelFromRows,
  type InventoryLevel,
  type InventoryPermIds,
} from "../../components/permissions/inventoryAccess";

// =====================================================================
// Inventory access for one person on one project
// =====================================================================
// Read: the resolver's own answer for (user, project), not the override
// rows, so the level shown is what the person actually gets — from a
// per-project setting if there is one, otherwise from their role,
// department or company-wide grant. It also renders legacy one-row
// overrides correctly.
//
// Write: layer 1 rows in team_member_permission_grants, always both
// permissions together (see inventoryAccess.ts for why). "role" deletes
// both rows so the person follows their role again.
// =====================================================================

export const projectInventoryAccessKey = (userId: string, projectId: string) => [
  "effective-permissions",
  userId,
  projectId,
  "inventory",
];

export function useProjectInventoryAccess(
  userId: string | undefined,
  projectId: string | null,
): {
  level: InventoryLevel | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const query = useQuery({
    // Under "effective-permissions" so every existing invalidation of the
    // resolver's answers refreshes this too.
    queryKey: projectInventoryAccessKey(userId ?? "none", projectId ?? "none"),
    enabled: Boolean(userId && projectId),
    queryFn: async (): Promise<InventoryLevel> => {
      const { data, error } = await permissionsDb.rpc("effective_permissions", {
        p_user_id: userId as string,
        p_project_id: projectId as string,
      });
      if (error) throw error;
      return levelFromRows(data ?? []);
    },
  });

  return {
    // null while loading or on error: a failed read is not "no access".
    level: query.isError ? null : (query.data ?? null),
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

interface SetInventoryAccessArgs {
  userId: string;
  projectId: string;
  ids: InventoryPermIds;
  level: InventoryLevel | "role";
  grantedBy: string | null;
}

export function useSetProjectInventoryAccess() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SetInventoryAccessArgs>({
    mutationFn: async ({ userId, projectId, ids, level, grantedBy }) => {
      if (level === "role") {
        const { error } = await permissionsDb
          .from("team_member_permission_grants")
          .delete()
          .eq("project_id", projectId)
          .eq("user_id", userId)
          .in("permission_id", [ids.view, ids.manage]);
        if (error) throw error;
        return;
      }

      const grants = grantsForLevel(level);
      const grantedAt = new Date().toISOString();
      const rows = (["view", "manage"] as const).map((key) => ({
        project_id: projectId,
        user_id: userId,
        permission_id: ids[key],
        allowed: grants[key],
        granted_by: grantedBy,
        granted_at: grantedAt,
      }));

      const { error } = await permissionsDb
        .from("team_member_permission_grants")
        .upsert(rows as never, { onConflict: "project_id,user_id,permission_id" });
      if (error) throw error;
    },
    // Returned, so the mutation stays pending — and the control disabled —
    // until the new level and the مخصص / حسب الدور badge have refetched.
    onSuccess: (_data, { userId, projectId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["effective-permissions"] }),
        queryClient.invalidateQueries({ queryKey: ["my-effective-permissions"] }),
        queryClient.invalidateQueries({ queryKey: ["user-tm-grants", userId] }),
        queryClient.invalidateQueries({ queryKey: ["matrix-tm-grants"] }),
        queryClient.invalidateQueries({
          queryKey: ["team-member-permission-grants", projectId, userId],
        }),
      ]),
  });
}
