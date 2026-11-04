import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import type { Database } from "../../lib/supabase";
import { useAuth } from "../useAuth";
import { accessSignature, canSeeSpace, useMyTaskAccess } from "./useTaskAccess";
import { TIERS } from "../../lib/queryClient";

// =====================================================================
// D1 sidebar data — one query, everything the sidebar chrome needs.
// =====================================================================
// No permission_catalog wiring yet (Part 6 of the build plan is
// deliberately deferred — see TasksRoutes.tsx). What IS enforced here is
// P8 (default-private for spaces): a `private` space only shows if the
// current user owns it (personal spaces) or has a space_members row.
// `public` spaces show to anyone who reached /tasks at all, same as
// every other still-ungated section (CRM, Supply Chain, ...).
//
// Open counts are computed client-side from raw (board_id, status_id)
// pairs rather than a SQL aggregate, since there's no view/RPC for it
// yet. Fine at today's data volume; revisit with a real view/RPC later.

type SpaceRow = Database["tasks"]["Tables"]["spaces"]["Row"];
type FolderRow = Database["tasks"]["Tables"]["folders"]["Row"];
type BoardRow = Database["tasks"]["Tables"]["boards"]["Row"];
export type SpaceType = Database["tasks"]["Enums"]["space_type"];
type StatusCategory = Database["tasks"]["Enums"]["status_category"];

export interface BoardWithCount {
  board: BoardRow;
  openCount: number;
  zoneName: string | null;
}

export interface FolderNode {
  folder: FolderRow;
  boards: BoardWithCount[];
}

export interface SpaceNode {
  space: SpaceRow;
  /** Name of the linked project (project-type spaces), so search can match
   * by project even when the space was named something else. */
  projectName: string | null;
  folders: FolderNode[];
  boards: BoardWithCount[]; // directly under the space (folder_id null)
}

export interface DepartmentShortcut {
  id: string;
  name: string;
  name_ar: string | null;
  openCount: number;
}

export interface TasksSidebarData {
  spacesByType: Record<SpaceType, SpaceNode[]>;
  departments: DepartmentShortcut[];
  myWorkCount: number;
}

const OPEN_CATEGORIES: StatusCategory[] = ["not_started", "active"];

export function useTasksSidebar() {
  const { user } = useAuth();
  const { access } = useMyTaskAccess();
  const tasksDb = supabase.schema("tasks");

  const query = useQuery({
    queryKey: ["tasks-sidebar", user?.id, accessSignature(access)],
    enabled: !!user?.id && !!access,
    staleTime: TIERS.B.staleTime,
    gcTime: TIERS.B.gcTime,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<TasksSidebarData> => {
      if (!user?.id || !access) throw new Error("no authenticated user");
      const userId = user.id;

      // 1. Fetch spaces, active departments, current user's task assignments,
      // and all task statuses concurrently.
      const [
        { data: spaces, error: spacesError },
        { data: departmentRows, error: departmentsError },
        { data: assigneeRows, error: assigneeError },
        { data: statuses, error: statusesError },
      ] = await Promise.all([
        tasksDb.from("spaces").select("*").eq("is_archived", false).eq("is_template", false),
        supabase
          .from("departments")
          .select("id, name, name_ar")
          .eq("is_active", true),
        tasksDb.from("task_assignees").select("task_id").eq("user_id", userId),
        tasksDb.from("statuses").select("id, category"),
      ]);

      if (spacesError) throw spacesError;
      if (departmentsError) throw departmentsError;
      if (assigneeError) throw assigneeError;
      if (statusesError) throw statusesError;

      const categoryByStatusId = new Map(
        (statuses ?? []).map((s) => [s.id, s.category]),
      );

      // Which spaces I see is decided by the database (tasks.my_access): a
      // level on the space, or a task of mine inside it. Not by `visibility`.
      const visibleSpaces = (spaces ?? []).filter((space) => canSeeSpace(access, space.id));
      const visibleSpaceIds = visibleSpaces.map((s) => s.id);
      const myTaskIds = (assigneeRows ?? []).map((r) => r.task_id);

      const projectIds = Array.from(
        new Set(visibleSpaces.map((s) => s.project_id).filter((id): id is string => !!id)),
      );

      // 2. Fetch folders, boards, linked projects, and user's assigned tasks concurrently
      const [
        { data: folders, error: foldersError },
        { data: boards, error: boardsError },
        { data: projectRows, error: projectsError },
        { data: myTasksData, error: myTasksError },
      ] = await Promise.all([
        visibleSpaceIds.length === 0
          ? Promise.resolve({ data: [] as FolderRow[], error: null })
          : tasksDb
              .from("folders")
              .select("*")
              .in("space_id", visibleSpaceIds)
              .eq("is_archived", false),
        visibleSpaceIds.length === 0
          ? Promise.resolve({ data: [] as BoardRow[], error: null })
          : tasksDb
              .from("boards")
              .select("*")
              .in("space_id", visibleSpaceIds)
              .eq("is_archived", false)
              .eq("is_template", false),
        projectIds.length === 0
          ? Promise.resolve({ data: [] as { id: string; name: string }[], error: null })
          : supabase.from("projects").select("id, name").in("id", projectIds),
        myTaskIds.length === 0
          ? Promise.resolve({ data: [] as { status_id: string }[], error: null })
          : tasksDb
              .from("tasks")
              .select("status_id")
              .in("id", myTaskIds)
              .eq("is_archived", false)
              .eq("is_template", false),
      ]);

      if (foldersError) throw foldersError;
      if (boardsError) throw boardsError;
      if (projectsError) throw projectsError;
      if (myTasksError) throw myTasksError;

      const boardIds = (boards ?? []).map((b) => b.id);
      const zoneIds = Array.from(new Set((boards ?? []).map((b) => b.zone_id).filter(Boolean))) as string[];

      // 3. Fetch board tasks and zone names concurrently
      const [
        { data: boardTasksData, error: boardTasksError },
        { data: zoneRows, error: zonesError },
      ] = await Promise.all([
        boardIds.length === 0
          ? Promise.resolve({
              data: [] as { board_id: string; status_id: string; department_id: string | null }[],
              error: null,
            })
          : tasksDb
              .from("tasks")
              .select("board_id, status_id, department_id")
              .in("board_id", boardIds)
              .eq("is_archived", false),
        zoneIds.length === 0
          ? Promise.resolve({ data: [] as { id: string; name: string }[], error: null })
          : supabase.schema("boq").from("zones").select("id, name").in("id", zoneIds),
      ]);

      if (boardTasksError) throw boardTasksError;
      if (zonesError) throw zonesError;

      const myOpenTaskStatusIds = (myTasksData ?? []).map((r) => r.status_id);

      const relevantTaskRows: { board_id: string; status_id: string }[] = [];
      const departmentTaskRows: {
        department_id: string | null;
        status_id: string;
      }[] = [];

      for (const row of boardTasksData ?? []) {
        relevantTaskRows.push({
          board_id: row.board_id,
          status_id: row.status_id,
        });
        departmentTaskRows.push({
          department_id: row.department_id,
          status_id: row.status_id,
        });
      }

      const isOpen = (statusId: string) => {
        const category = categoryByStatusId.get(statusId);
        return !!category && OPEN_CATEGORIES.includes(category);
      };

      const openCountByBoard = new Map<string, number>();
      for (const row of relevantTaskRows) {
        if (!isOpen(row.status_id)) continue;
        openCountByBoard.set(
          row.board_id,
          (openCountByBoard.get(row.board_id) ?? 0) + 1,
        );
      }

      const openCountByDepartment = new Map<string, number>();
      for (const row of departmentTaskRows) {
        if (!row.department_id || !isOpen(row.status_id)) continue;
        openCountByDepartment.set(
          row.department_id,
          (openCountByDepartment.get(row.department_id) ?? 0) + 1,
        );
      }

      const myWorkCount = myOpenTaskStatusIds.filter(isOpen).length;
      const zoneNameById = new Map((zoneRows ?? []).map((z) => [z.id, z.name]));
      const projectNameById = new Map((projectRows ?? []).map((p) => [p.id, p.name]));

      const boardsWithCount: BoardWithCount[] = (boards ?? []).map((b) => ({
        board: b,
        openCount: openCountByBoard.get(b.id) ?? 0,
        zoneName: b.zone_id ? (zoneNameById.get(b.zone_id) ?? null) : null,
      }));

      const spaceNodes: SpaceNode[] = visibleSpaces.map((space) => {
        const spaceBoards = boardsWithCount.filter(
          (b) => b.board.space_id === space.id,
        );
        const spaceFolders = (folders ?? []).filter(
          (f) => f.space_id === space.id,
        );

        return {
          space,
          projectName: space.project_id ? (projectNameById.get(space.project_id) ?? null) : null,
          boards: spaceBoards.filter((b) => !b.board.folder_id),
          folders: spaceFolders.map((folder) => ({
            folder,
            boards: spaceBoards.filter(
              (b) => b.board.folder_id === folder.id,
            ),
          })),
        };
      });

      const spacesByType: Record<SpaceType, SpaceNode[]> = {
        project: [],
        department: [],
        company: [],
        personal: [],
      };
      for (const node of spaceNodes) {
        spacesByType[node.space.space_type].push(node);
      }

      const departments: DepartmentShortcut[] = (departmentRows ?? [])
        .map((d) => ({
          id: d.id,
          name: d.name,
          name_ar: d.name_ar,
          openCount: openCountByDepartment.get(d.id) ?? 0,
        }))
        .sort((a, b) => (a.name_ar ?? a.name).localeCompare(b.name_ar ?? b.name));

      return { spacesByType, departments, myWorkCount };
    },
  });

  return {
    data: query.data,
    loading: query.isPending,
    error: query.error,
  };
}
