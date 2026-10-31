import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { permissionsDb } from "../../lib/permissionsDb";
import { supabase } from "../../lib/supabaseClient";
import { TIERS } from "../../lib/queryClient";
import type { ProjectRoleHolderRow, ProjectRoleRow } from "../../types/permissions.types";

// =====================================================================
// PROJECT TEAM — reads and writes team_assignments
// =====================================================================
//
// Implementation guide section 4.4 and section 2.2.
//
// team_assignments is the only TEAM table this file touches. It used to
// also dual-write project_assignments so nothing reading the old table
// went stale during the migration — issue #18 retired that mirror: the
// app no longer reads or writes project_assignments anywhere, so there
// is nothing left to keep in step with it.
//
// CONTRACTORS IN PROJECT ROLES
//   Contractors can fill the same project roles (so template role tasks
//   reach them) but are never team members — decision 9 below still
//   holds. Their rows live in project_contractor_roles, which grants no
//   permissions (tasks/migrations/2026-10-12_contractor_project_roles_e.sql).
//   Reads go through the project_role_holders view, which unions both;
//   writes pick the table from TeamMember.personType.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
//   - No percentage, anywhere. Distribution is a separate table, a
//     separate screen and a separate Phase (5). A person can be on the
//     team with no share and hold a share without being on the team;
//     neither is an error and neither is inferred from the other.
//   - No cardinality rules. Unlimited people per project role, all
//     equals, no lead/assistant concept. Nothing here counts PMs.
// =====================================================================

export const projectTeamKey = (projectId: string) => ["project-team", projectId];
export const PROJECT_ROLES_KEY = ["project-roles"];
export const assignableStaffKey = ["team-assignable-staff"];

// The cross-project overview (/execution-management/projects/teams).
// Deliberately not keyed by project - it holds every team at once, so
// any team change made anywhere in the app must invalidate it. Both
// mutations at the bottom of this file do exactly that.
export const ALL_PROJECT_TEAMS_KEY = ["project-teams-all"];

export type TeamPersonType = "employee" | "contractor";

export interface TeamMember {
  /** The row, not the person: team_assignments.id for an employee,
   * project_contractor_roles.id for a contractor. */
  assignmentId: string;
  /** employees.id for an employee, contractors.id for a contractor —
   * the id the add form picks. */
  personId: string;
  personType: TeamPersonType;
  /** users.id, what task_assignees.user_id holds. Same as personId for
   * an employee; null for a contractor whose login was removed. */
  userId: string | null;
  fullName: string;
  email: string | null;
  projectRoleId: string;
  projectRoleName: string;
  assignedAt: string;
}

export const PROJECT_ROLE_HOLDER_COLUMNS =
  "assignment_id, project_id, project_role_id, user_id, contractor_id, person_type, first_name, last_name, email, assigned_at";

/** One project_role_holders row as a TeamMember. */
export function toTeamMember(
  row: ProjectRoleHolderRow,
  roleName: string | undefined,
): TeamMember {
  return {
    assignmentId: row.assignment_id,
    personId: (row.person_type === "contractor" ? row.contractor_id : row.user_id) as string,
    personType: row.person_type,
    userId: row.user_id,
    fullName: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "—",
    email: row.email,
    projectRoleId: row.project_role_id,
    projectRoleName: roleName ?? "—",
    assignedAt: row.assigned_at,
  };
}

/**
 * Everyone holding a role on a project: the team (employees) plus any
 * contractors filling a project role. Callers that mean the TEAM only —
 * anything permission-related — must keep personType === "employee".
 *
 * Returns one entry per ASSIGNMENT, not per person. Someone holding two
 * project roles on one project appears twice, which is correct — they
 * really are doing two jobs on it. Callers that want distinct people
 * must dedupe on personId themselves rather than assuming uniqueness.
 */
export function useProjectTeam(projectId: string | undefined) {
  return useQuery<TeamMember[]>({
    queryKey: projectTeamKey(projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data: rows, error } = await permissionsDb
        .from("project_role_holders")
        .select(PROJECT_ROLE_HOLDER_COLUMNS)
        .eq("project_id", projectId as string);
      if (error) throw error;
      if (!rows || rows.length === 0) return [];

      // Joined in JS rather than with a PostgREST embed: the view is
      // hand-typed (see permissions.types.ts) with no Relationships, so
      // embeds would not typecheck.
      const roleIds = Array.from(new Set(rows.map((r) => r.project_role_id)));
      const { data: roles } = await permissionsDb
        .from("project_roles")
        .select("id, name")
        .in("id", roleIds);
      const roleById = new Map((roles ?? []).map((r) => [r.id, r.name]));

      return rows
        .map((row) => toTeamMember(row, roleById.get(row.project_role_id)))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));
      // Sorted alphabetically ON PURPOSE. Any ordering that reflects
      // seniority, date added, or "who was here first" would imply a
      // hierarchy this model does not have.
    },
  });
}

export function useProjectRoles() {
  return useQuery<ProjectRoleRow[]>({
    queryKey: PROJECT_ROLES_KEY,
    ...TIERS.A,
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("project_roles")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface AssignablePerson {
  id: string;
  fullName: string;
  email: string | null;
}

/**
 * Who may be put on a project team.
 *
 * Company accounts only. Contractors, vendors and clients are excluded —
 * confirmed decision (guide section 7, decision 9): they participate in
 * projects through the contracts and bids subsystem, never as team
 * members. Two filters enforce it, deliberately overlapping:
 *   - an employees row must exist (team_assignments.person_id is FK'd to
 *     employees, so the database would reject anyone else anyway)
 *   - users.party_type must be 'company'
 * The second is redundant today and will stop being redundant the moment
 * anyone gives a vendor an employees row by mistake.
 */
export function useAssignableStaffForTeam() {
  return useQuery<AssignablePerson[]>({
    queryKey: assignableStaffKey,
    queryFn: async () => {
      const { data: employees, error } = await permissionsDb
        .from("employees")
        .select("id");
      if (error) throw error;
      if (!employees || employees.length === 0) return [];

      // Through permissionsDb because party_type is a Phase 1 column
      // that the generated types do not know about yet.
      const { data: users, error: usersError } = await permissionsDb
        .from("users")
        .select("id, first_name, last_name, email, party_type")
        .in(
          "id",
          employees.map((e) => e.id),
        )
        .eq("party_type", "company");
      if (usersError) throw usersError;

      return (users ?? [])
        .map((u) => ({
          id: u.id,
          fullName: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "—",
          email: u.email,
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));
    },
  });
}

export const assignableContractorsKey = ["role-assignable-contractors"];

/**
 * Contractors who may fill a project role (project_contractor_roles —
 * not the team; see the note at the top of this file). Every contractor
 * with a login, the same way useAssignableStaffForTeam lists every
 * employee: without contractors.user_id there is nobody to give a task
 * to. Merged contractors are hidden. id is contractors.id.
 */
export function useAssignableContractorsForRoles() {
  return useQuery<AssignablePerson[]>({
    queryKey: assignableContractorsKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contractors")
        .select("id, first_name, last_name, email")
        .not("user_id", "is", null)
        .neq("status", "merged");
      if (error) throw error;

      return (data ?? [])
        .map((c) => ({
          id: c.id,
          fullName: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—",
          email: c.email,
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));
    },
  });
}

/**
 * Everyone who can be put in a project role, employees and contractors in
 * one picker list. employees.id and contractors.id share it, so option
 * ids carry their type ("employee:<id>" / "contractor:<id>") — read them
 * back with parseRoleCandidate. Contractors carry a "مقاول" tag, which
 * PersonSearchSelect shows as a badge.
 */
export function useRoleCandidateOptions() {
  const { data: staff = [], isLoading: staffLoading } = useAssignableStaffForTeam();
  const { data: contractors = [], isLoading: contractorsLoading } =
    useAssignableContractorsForRoles();
  const options = useMemo(
    () => [
      ...staff.map((s) => ({ id: `employee:${s.id}`, name: s.fullName })),
      ...contractors.map((c) => ({ id: `contractor:${c.id}`, name: c.fullName, tag: "مقاول" })),
    ],
    [staff, contractors],
  );
  return { options, loading: staffLoading || contractorsLoading };
}

export function roleCandidateId(personType: TeamPersonType, personId: string) {
  return `${personType}:${personId}`;
}

export function parseRoleCandidate(value: string) {
  const [personType, personId] = value.split(":") as [TeamPersonType, string];
  return { personType, personId };
}

/** The table a role assignment lives in, by who holds it. */
const assignmentTable = (personType: TeamPersonType) =>
  personType === "contractor" ? "project_contractor_roles" : "team_assignments";

/** Everything that shows who holds which role, refetched after any change. */
function invalidateRoleHolders(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
) {
  queryClient.invalidateQueries({ queryKey: projectTeamKey(projectId) });
  // Keeps the cross-project overview honest: a change made on one
  // project's own screen must show up there too, and vice versa.
  queryClient.invalidateQueries({ queryKey: ALL_PROJECT_TEAMS_KEY });
  // The tasks module's template-roles dialog caches who holds each
  // role per project under this key (hooks/tasks/useRoleGaps.ts).
  queryClient.invalidateQueries({ queryKey: ["role-gaps"] });
}

// ---------------------------------------------------------------------
// WRITES — team_assignments only
// ---------------------------------------------------------------------
//
// Issue #18: this used to dual-write project_assignments too, with a
// compensating rollback for when the second write failed. That mirror
// is gone — team_assignments is the only table a team-membership change
// touches now, so there is nothing left to keep in step and nothing to
// roll back.
//
// percentage is NEVER touched here, in either direction. A person can be
// on the team with no share and hold a share without being on the team;
// neither is an error and neither is inferred from the other. Their
// project_distributions row (Phase 5) is a different table entirely.

interface AddArgs {
  projectId: string;
  /** employees.id, or contractors.id when personType is "contractor". */
  personId: string;
  /** Defaults to "employee" — the team. */
  personType?: TeamPersonType;
  projectRoleId: string;
  /** users.id of whoever is making the change. */
  assignedBy: string | null;
}

export function useAddTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      personId,
      personType = "employee",
      projectRoleId,
      assignedBy,
    }: AddArgs) => {
      const { data: created, error } =
        personType === "contractor"
          ? await permissionsDb
              .from("project_contractor_roles")
              .insert({
                project_id: projectId,
                contractor_id: personId,
                project_role_id: projectRoleId,
                assigned_by: assignedBy,
              })
              .select("id")
              .single()
          : await permissionsDb
              .from("team_assignments")
              .insert({
                project_id: projectId,
                person_id: personId,
                project_role_id: projectRoleId,
                assigned_by: assignedBy,
              })
              .select("id")
              .single();

      if (error) {
        // 23505 = unique_violation. Phase 1's
        // UNIQUE (project_id, person_id, project_role_id), and the same
        // shape on project_contractor_roles.
        if ((error as { code?: string }).code === "23505") {
          throw new Error(
            "هذا الشخص مضاف بالفعل إلى هذا المشروع بنفس الدور. يمكن إضافته بدور مختلف.",
          );
        }
        throw error;
      }

      return created.id;
    },
    onSuccess: (_id, variables) => {
      invalidateRoleHolders(queryClient, variables.projectId);
    },
  });
}

interface UpdateRoleArgs {
  assignmentId: string;
  personType: TeamPersonType;
  projectId: string;
  projectRoleId: string;
}

/**
 * Changes an existing assignment's role in place — an UPDATE on
 * project_role_id, not a remove-then-add. That matters because
 * assignmentId (and its assigned_at/assigned_by) is preserved, where
 * delete+insert would silently reset both.
 */
export function useUpdateTeamMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ assignmentId, personType, projectRoleId }: UpdateRoleArgs) => {
      const { error } = await permissionsDb
        .from(assignmentTable(personType))
        .update({ project_role_id: projectRoleId })
        .eq("id", assignmentId);

      if (error) {
        // 23505 = unique_violation. Phase 1's
        // UNIQUE (project_id, person_id, project_role_id).
        if ((error as { code?: string }).code === "23505") {
          throw new Error("هذا الشخص لديه بالفعل هذا الدور في هذا المشروع.");
        }
        throw error;
      }
    },
    onSuccess: (_data, variables) => {
      invalidateRoleHolders(queryClient, variables.projectId);
    },
  });
}

interface RemoveArgs {
  assignmentId: string;
  personType: TeamPersonType;
  projectId: string;
  personId: string;
  projectRoleId: string;
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ assignmentId, personType }: RemoveArgs) => {
      const { error } = await permissionsDb
        .from(assignmentTable(personType))
        .delete()
        .eq("id", assignmentId);
      if (error) throw error;
    },
    onMutate: async ({ projectId, assignmentId }: RemoveArgs) => {
      const key = projectTeamKey(projectId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TeamMember[]>(key);
      queryClient.setQueryData<TeamMember[]>(
        key,
        (previous ?? []).filter((m) => m.assignmentId !== assignmentId),
      );
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (!context?.previous) return;
      queryClient.setQueryData(projectTeamKey(variables.projectId), context.previous);
    },
    onSettled: (_data, _err, variables) => {
      invalidateRoleHolders(queryClient, variables.projectId);
      // Deliberately does NOT invalidate anything distribution-related.
      // Removing someone from a team has no effect on their percentage,
      // and pretending otherwise by refetching would suggest it might.
    },
  });
}
