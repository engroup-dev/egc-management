import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { permissionsDb } from "../../lib/permissionsDb";
import { supabase } from "../../lib/supabaseClient";
import type { ProjectRoleHolderRow } from "../../types/permissions.types";
import { ALL_PROJECT_TEAMS_KEY, PROJECT_ROLES_KEY } from "./useTeamAssignments";

// Settings → project roles (public.project_roles): the global list of
// positions a person can hold on a project team (Project Manager, Site
// Engineer, ...). Who holds which role where lives in team_assignments
// (employees) and project_contractor_roles (contractors), read together
// through the project_role_holders view; template tasks can also point
// at a role (tasks.task_role_assignees).
//
// A role can only be deleted while nothing uses it: team_assignments and
// project_contractor_roles would refuse anyway (ON DELETE RESTRICT), and
// task_role_assignees would silently lose the template's role assignments
// (ON DELETE CASCADE), so the UI blocks all three.

const ADMIN_KEY = ["project-roles-admin"];

// A holder's id and name as these screens show them. Contractors are
// keyed by contractors.id and marked the way the assignee picker marks
// them, since they share role lists with employees here.
const holderId = (h: Pick<ProjectRoleHolderRow, "person_type" | "user_id" | "contractor_id">) =>
  (h.person_type === "contractor" ? h.contractor_id : h.user_id) as string;
const holderName = (h: Pick<ProjectRoleHolderRow, "person_type" | "first_name" | "last_name">) =>
  (`${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() || "—") +
  (h.person_type === "contractor" ? " (مقاول)" : "");

export interface RoleHolderProject {
  projectId: string;
  projectName: string;
  people: { id: string; name: string }[];
}

export interface ProjectRoleAdminRow {
  id: string;
  name: string;
  assignmentCount: number;
  templateTaskCount: number;
  projects: RoleHolderProject[];
}

// Exported for the background prefetcher (src/lib/prefetch).
export const projectRolesAdminQueryOptions = () =>
  queryOptions({
    queryKey: ADMIN_KEY,
    queryFn: async (): Promise<ProjectRoleAdminRow[]> => {
      const [{ data: roles, error: rolesError }, { data: assignments, error: assignmentsError }, templateRoles] =
        await Promise.all([
          supabase.from("project_roles").select("id, name").order("name"),
          permissionsDb
            .from("project_role_holders")
            .select("project_id, project_role_id, user_id, contractor_id, person_type, first_name, last_name"),
          supabase.schema("tasks").from("task_role_assignees").select("project_role_id"),
        ]);
      if (rolesError) throw rolesError;
      if (assignmentsError) throw assignmentsError;
      // Before the template-roles migration runs this table doesn't exist;
      // then nothing can be using a role from a template either.
      const templateRoleRows = templateRoles.error ? [] : (templateRoles.data ?? []);

      const projectIds = Array.from(new Set((assignments ?? []).map((a) => a.project_id)));
      const { data: projects, error: projectsError } = projectIds.length
        ? await supabase.from("projects").select("id, name").in("id", projectIds)
        : { data: [] as { id: string; name: string }[], error: null };
      if (projectsError) throw projectsError;

      const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));

      const templateCountByRole = new Map<string, number>();
      for (const r of templateRoleRows) {
        templateCountByRole.set(r.project_role_id, (templateCountByRole.get(r.project_role_id) ?? 0) + 1);
      }

      return (roles ?? []).map((role) => {
        const mine = (assignments ?? []).filter((a) => a.project_role_id === role.id);
        const byProject = new Map<string, RoleHolderProject>();
        for (const a of mine) {
          const entry = byProject.get(a.project_id) ?? {
            projectId: a.project_id,
            projectName: projectNameById.get(a.project_id) ?? "—",
            people: [],
          };
          const id = holderId(a);
          if (!entry.people.some((p) => p.id === id)) {
            entry.people.push({ id, name: holderName(a) });
          }
          byProject.set(a.project_id, entry);
        }
        return {
          id: role.id,
          name: role.name,
          assignmentCount: mine.length,
          templateTaskCount: templateCountByRole.get(role.id) ?? 0,
          projects: Array.from(byProject.values()).sort((a, b) => a.projectName.localeCompare(b.projectName, "ar")),
        };
      });
    },
  });

export function useProjectRolesAdmin() {
  const queryClient = useQueryClient();

  const query = useQuery(projectRolesAdminQueryOptions());

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ADMIN_KEY });
    queryClient.invalidateQueries({ queryKey: PROJECT_ROLES_KEY });
    queryClient.invalidateQueries({ queryKey: ALL_PROJECT_TEAMS_KEY });
  };

  // project_roles.name is UNIQUE
  const friendlyError = (error: { code?: string; message: string }) =>
    error.code === "23505" ? new Error("يوجد دور بهذا الاسم بالفعل.") : error;

  const create = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("project_roles").insert({ name });
      if (error) throw friendlyError(error);
    },
    onSuccess: invalidate,
  });

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("project_roles").update({ name }).eq("id", id);
      if (error) throw friendlyError(error);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const role = query.data?.find((r) => r.id === id);
      if (role && (role.assignmentCount > 0 || role.templateTaskCount > 0)) {
        throw new Error("لا يمكن حذف دور مستخدم في فرق المشاريع أو القوالب.");
      }
      const { error } = await supabase.from("project_roles").delete().eq("id", id);
      if (error) {
        // 23503 = foreign_key_violation: someone got the role meanwhile
        if (error.code === "23503") throw new Error("لا يمكن حذف دور مستخدم في فرق المشاريع.");
        throw error;
      }
    },
    onSuccess: invalidate,
  });

  return {
    roles: query.data ?? [],
    loading: query.isPending,
    error: query.error,
    createRole: create.mutateAsync,
    creating: create.isPending,
    renameRole: rename.mutateAsync,
    deleteRole: remove.mutateAsync,
  };
}

export interface RoleHolderRow {
  assignmentId: string;
  personId: string;
  personName: string;
  email: string | null;
  projectId: string;
  projectName: string;
  assignedAt: string;
}

// One role's page: everyone holding it, one row per (person, project).
export function useProjectRoleHolders(roleId: string | undefined) {
  const query = useQuery({
    queryKey: [...ADMIN_KEY, "holders", roleId],
    enabled: !!roleId,
    queryFn: async (): Promise<{ roleName: string; rows: RoleHolderRow[] }> => {
      if (!roleId) throw new Error("no role id");

      const [{ data: role, error: roleError }, { data: assignments, error: assignmentsError }] = await Promise.all([
        supabase.from("project_roles").select("id, name").eq("id", roleId).single(),
        permissionsDb
          .from("project_role_holders")
          .select("assignment_id, project_id, user_id, contractor_id, person_type, first_name, last_name, email, assigned_at")
          .eq("project_role_id", roleId),
      ]);
      if (roleError) throw roleError;
      if (assignmentsError) throw assignmentsError;

      const projectIds = Array.from(new Set((assignments ?? []).map((a) => a.project_id)));
      const { data: projects, error: projectsError } = projectIds.length
        ? await supabase.from("projects").select("id, name").in("id", projectIds)
        : { data: [] as { id: string; name: string }[], error: null };
      if (projectsError) throw projectsError;

      const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));

      return {
        roleName: role.name,
        rows: (assignments ?? []).map((a) => ({
          assignmentId: a.assignment_id,
          personId: holderId(a),
          personName: holderName(a),
          email: a.email,
          projectId: a.project_id,
          projectName: projectNameById.get(a.project_id) ?? "—",
          assignedAt: a.assigned_at,
        })),
      };
    },
  });

  return { data: query.data, loading: query.isPending, error: query.error };
}
