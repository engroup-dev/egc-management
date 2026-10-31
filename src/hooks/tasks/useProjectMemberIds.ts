import { useQuery } from "@tanstack/react-query";
import { permissionsDb } from "../../lib/permissionsDb";
import { TIERS } from "../../lib/queryClient";
import { projectTeamKey } from "../team/useTeamAssignments";

/**
 * Distinct people holding a role on a project (public.project_role_holders:
 * the team plus contractors in project roles), as a Set of user ids — the
 * same ids as AssignablePerson.id / task_assignees.user_id.
 *
 * Used by the assignee picker to float project members above everyone else.
 * Someone holding two roles on a project has two rows, hence the Set.
 *
 * Keyed under projectTeamKey(projectId) so every team add/change/remove
 * (useTeamAssignments.ts) invalidates it by prefix. `enabled` lets the picker
 * fetch only once its popover is open instead of once per board row.
 */
export function useProjectMemberIds(projectId: string | null | undefined, enabled = true) {
  return useQuery<Set<string>>({
    queryKey: [...projectTeamKey(projectId ?? "none"), "member-ids"],
    enabled: Boolean(projectId) && enabled,
    ...TIERS.B,
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("project_role_holders")
        .select("user_id")
        .eq("project_id", projectId as string)
        .not("user_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.user_id as string));
    },
  });
}
