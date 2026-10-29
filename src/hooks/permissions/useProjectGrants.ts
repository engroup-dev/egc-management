import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { permissionsDb } from "../../lib/permissionsDb";
import type {
  ExistingGrant,
  GrantDiff,
} from "../../components/permissions/permissionModel";

// =====================================================================
// Read + save for the two PROJECT permission layers (Phase 6)
// =====================================================================
//
//   layer 2  project_permission_defaults      "everyone on this project"
//   layer 1  team_member_permission_grants    "this person, this project"
//
// Kept separate from useGrants.ts (roles / departments / users) on
// purpose. Those three share one shape; these two share a different one:
//
//   - NO scope column. The row is already attached to one project, so
//     the all-projects / team-projects-only question cannot arise.
//   - A composite key that includes project_id, and for layer 1 also
//     user_id, rather than a single owner column.
//
// Trying to fold both shapes into one generic hook would mean a config
// object with half its fields optional, which is how the two layers
// would eventually get written to the wrong table.
//
// STILL DISPLAY + CONFIGURATION ONLY. Nothing in either app consults the
// resolver for real access control yet — that is Phase 7. This phase
// only makes the last two layers configurable.
// =====================================================================

export const projectDefaultsKey = (projectId: string) => [
  "project-permission-defaults",
  projectId,
];

export const teamMemberGrantsKey = (projectId: string, userId: string) => [
  "team-member-permission-grants",
  projectId,
  userId,
];

export const projectAllTeamGrantsKey = (projectId: string) => [
  "team-member-permission-grants-all",
  projectId,
];

// ---------------------------------------------------------------------
// Layer 2 — project defaults
// ---------------------------------------------------------------------

export function useProjectDefaults(projectId: string | undefined) {
  return useQuery<ExistingGrant[]>({
    queryKey: projectDefaultsKey(projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("project_permission_defaults")
        .select("permission_id, allowed, note")
        .eq("project_id", projectId as string);
      if (error) throw error;

      // scope: null is not a placeholder — this table genuinely has no
      // scope column, and the editor runs in "scopeless" shape so it is
      // never read back.
      return (data ?? []).map((row) => ({
        permission_id: row.permission_id,
        allowed: row.allowed,
        scope: null,
        note: row.note,
      }));
    },
  });
}

interface SaveDefaultsArgs {
  projectId: string;
  diff: GrantDiff;
  grantedBy: string | null;
}

/**
 * Applies a project-default diff.
 *
 * Deletes run before upserts, same as Phase 3's useSaveGrants, so a
 * permission flipped allow → unset → allow inside one editing session
 * cannot collide with itself. Also the same caveat: two statements, not
 * a transaction. PostgREST has no client-side transaction. The blast
 * radius is one project's defaults and the screen refetches immediately.
 */
export function useSaveProjectDefaults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, diff, grantedBy }: SaveDefaultsArgs) => {
      if (diff.deletes.length > 0) {
        const { error } = await permissionsDb
          .from("project_permission_defaults")
          .delete()
          .eq("project_id", projectId)
          .in("permission_id", diff.deletes);
        if (error) throw error;
      }

      if (diff.upserts.length > 0) {
        const rows = diff.upserts.map((write) => ({
          project_id: projectId,
          permission_id: write.permission_id,
          allowed: write.allowed,
          note: write.note,
          granted_by: grantedBy,
          granted_at: new Date().toISOString(),
        }));

        const { error } = await permissionsDb
          .from("project_permission_defaults")
          .upsert(rows as never, { onConflict: "project_id,permission_id" });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: projectDefaultsKey(variables.projectId),
      });
      // A project default changes what every team member effectively
      // has, so their resolver answers are stale too.
      queryClient.invalidateQueries({ queryKey: ["effective-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["my-effective-permissions"] });
    },
  });
}

// ---------------------------------------------------------------------
// Layer 1 — team-member overrides
// ---------------------------------------------------------------------

export function useTeamMemberGrants(
  projectId: string | undefined,
  userId: string | undefined,
) {
  return useQuery<ExistingGrant[]>({
    queryKey: teamMemberGrantsKey(projectId ?? "none", userId ?? "none"),
    enabled: Boolean(projectId && userId),
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("team_member_permission_grants")
        .select("permission_id, allowed, note")
        .eq("project_id", projectId as string)
        .eq("user_id", userId as string);
      if (error) throw error;

      return (data ?? []).map((row) => ({
        permission_id: row.permission_id,
        allowed: row.allowed,
        scope: null,
        note: row.note,
      }));
    },
  });
}

export interface TeamMemberGrantCount {
  userId: string;
  allow: number;
  deny: number;
}

/**
 * How many overrides each person on this project has, for the collapsed
 * roster rows — so an admin can see who has something configured without
 * expanding fourteen people one at a time.
 *
 * Returns rows for EVERY user_id present in the table for this project,
 * including people who are no longer on the team. The screen needs those
 * to render the orphan warning; see ProjectPermissionsPage.
 */
export function useProjectTeamGrantCounts(projectId: string | undefined) {
  return useQuery<Record<string, TeamMemberGrantCount>>({
    queryKey: projectAllTeamGrantsKey(projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("team_member_permission_grants")
        .select("user_id, allowed")
        .eq("project_id", projectId as string);
      if (error) throw error;

      const counts: Record<string, TeamMemberGrantCount> = {};
      for (const row of data ?? []) {
        const entry = counts[row.user_id] ?? {
          userId: row.user_id,
          allow: 0,
          deny: 0,
        };
        if (row.allowed) entry.allow += 1;
        else entry.deny += 1;
        counts[row.user_id] = entry;
      }
      return counts;
    },
  });
}

interface SaveTeamMemberArgs {
  projectId: string;
  userId: string;
  diff: GrantDiff;
  grantedBy: string | null;
}

export function useSaveTeamMemberGrants() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      userId,
      diff,
      grantedBy,
    }: SaveTeamMemberArgs) => {
      if (diff.deletes.length > 0) {
        const { error } = await permissionsDb
          .from("team_member_permission_grants")
          .delete()
          .eq("project_id", projectId)
          .eq("user_id", userId)
          .in("permission_id", diff.deletes);
        if (error) throw error;
      }

      if (diff.upserts.length > 0) {
        const rows = diff.upserts.map((write) => ({
          project_id: projectId,
          user_id: userId,
          permission_id: write.permission_id,
          allowed: write.allowed,
          note: write.note,
          granted_by: grantedBy,
          granted_at: new Date().toISOString(),
        }));

        const { error } = await permissionsDb
          .from("team_member_permission_grants")
          .upsert(rows as never, {
            onConflict: "project_id,user_id,permission_id",
          });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: teamMemberGrantsKey(variables.projectId, variables.userId),
      });
      queryClient.invalidateQueries({
        queryKey: projectAllTeamGrantsKey(variables.projectId),
      });
      queryClient.invalidateQueries({ queryKey: ["effective-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["my-effective-permissions"] });
    },
  });
}

// ---------------------------------------------------------------------
// Orphan cleanup
// ---------------------------------------------------------------------
//
// DECISION, and it is deliberate: removing someone from a project team
// does NOT cascade-delete their team-member overrides.
//
// The database cannot do it even if we wanted it to —
// team_member_permission_grants has no foreign key to team_assignments,
// only to projects and users, so there is nothing for ON DELETE CASCADE
// to hang off. That was a Phase 1 choice, not an oversight.
//
// Instead the resolver makes such rows INERT: layers 1 and 2 both
// require actual team membership, so an override for someone who has
// rolled off the team has no opinion and the ladder falls through to the
// company-wide layers (phase2-resolver.sql, DECISION 4). It cannot grant
// anything, so it is not a security hole.
//
// What it IS is confusing — a stale row that looks like configuration
// and does nothing. So the UI surfaces every orphan explicitly and
// offers this one-click delete, rather than hiding them and letting them
// rot. Nothing is deleted automatically; an admin decides, because the
// usual reason someone is off a team is that they will be back.

export function useDeleteOrphanedTeamGrants() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      userId,
    }: {
      projectId: string;
      userId: string;
    }) => {
      const { error } = await permissionsDb
        .from("team_member_permission_grants")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: projectAllTeamGrantsKey(variables.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: teamMemberGrantsKey(variables.projectId, variables.userId),
      });
      queryClient.invalidateQueries({ queryKey: ["my-effective-permissions"] });
    },
  });
}
