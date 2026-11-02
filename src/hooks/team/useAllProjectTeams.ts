import { queryOptions, useQuery } from "@tanstack/react-query";
import { permissionsDb } from "../../lib/permissionsDb";
import { supabase } from "../../lib/supabaseClient";
import {
  ALL_PROJECT_TEAMS_KEY,
  PROJECT_ROLE_HOLDER_COLUMNS,
  toTeamMember,
  type TeamMember,
} from "./useTeamAssignments";

// =====================================================================
// EVERY PROJECT TEAM AT ONCE — the cross-project overview
// =====================================================================
// useProjectTeam() answers "who is on THIS project". This answers "who
// is on everything", for /execution-management/projects/teams, so
// nobody has to open 63
// projects one at a time to find out where a person is assigned.
//
// THREE QUERIES, NOT ONE PER PROJECT. Everything is fetched in bulk and
// joined in JS, the same way useProjectTeam does it and for the same
// reason: team_assignments is hand-typed with no Relationships, so a
// PostgREST embed would not typecheck. At today's size — 63 projects,
// 115 assignments — this is three round trips total, versus 63 if the
// page mounted one useProjectTeam per project.
//
// PROJECTS WITH NO TEAM ARE INCLUDED, with an empty members array.
// They are the most interesting rows on the page, not the ones to hide:
// an unstaffed project is a thing you want to notice. 11 of 63 today.
//
// THIS HOOK GRANTS NOTHING. It reads team data for the whole company;
// the route that renders it is gated on view_all_project_teams, and
// editing any one project is gated separately, per project, because
// manage_project_team is project-scoped. See AllProjectTeamsPage.
// =====================================================================

export interface ProjectWithTeam {
  projectId: string;
  projectName: string;
  serialNumber: number | null;
  status: string | null;
  /** One entry per ASSIGNMENT. Two roles on one project = two entries. */
  members: TeamMember[];
}

// Exported for the background prefetcher (src/lib/prefetch).
export const allProjectTeamsQueryOptions = () =>
  queryOptions<ProjectWithTeam[]>({
    queryKey: ALL_PROJECT_TEAMS_KEY,
    queryFn: async () => {
      const [{ data: projects, error: projectsError }, { data: rows, error }] =
        await Promise.all([
          supabase
            .from("projects")
            .select("id, name, serial_number, status")
            .order("serial_number", { ascending: true }),
          permissionsDb
            .from("project_role_holders")
            .select(PROJECT_ROLE_HOLDER_COLUMNS),
        ]);

      if (projectsError) throw projectsError;
      if (error) throw error;

      // Employees and contractors in project roles alike — the view
      // unions team_assignments and project_contractor_roles.
      const assignments = rows ?? [];
      const roleIds = Array.from(
        new Set(assignments.map((r) => r.project_role_id)),
      );

      const { data: roles } = roleIds.length
        ? await permissionsDb.from("project_roles").select("id, name").in("id", roleIds)
        : { data: [] as never[] };

      const roleById = new Map((roles ?? []).map((r) => [r.id, r.name]));

      const byProject = new Map<string, TeamMember[]>();
      for (const row of assignments) {
        const member = toTeamMember(row, roleById.get(row.project_role_id));
        const list = byProject.get(row.project_id);
        if (list) list.push(member);
        else byProject.set(row.project_id, [member]);
      }

      return (projects ?? []).map((project) => ({
        projectId: project.id,
        projectName: project.name,
        serialNumber: project.serial_number ?? null,
        status: project.status ?? null,
        // Alphabetical, for the same reason useProjectTeam sorts this
        // way: any other order would imply a seniority this model does
        // not have.
        members: (byProject.get(project.id) ?? []).sort((a, b) =>
          a.fullName.localeCompare(b.fullName, "ar"),
        ),
      }));
    },
  });

export function useAllProjectTeams() {
  return useQuery(allProjectTeamsQueryOptions());
}
