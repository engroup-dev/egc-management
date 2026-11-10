import { useMemo } from "react";
import { accessSignature, invalidateTaskAccess, useMyTaskAccess } from "./useTaskAccess";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../useAuth";
import { resolveStatusSetId } from "./resolveStatusSetId";
import { useAssignablePeople, type AssignablePerson } from "./useAssignablePeople";
import type { DependencyPair, Priority, StatusRow, TagLite, TaskRow, TaskTypeLite } from "./useTaskBoard";
import { recordAssignees, recordTaskPatch } from "./taskUndo";
import { invalidateSchedule, saveTaskSchedule, type ScheduleChange } from "./useTaskSchedule";
import { dueFromDays, workingDayOnOrAfterString } from "../../components/tasks/board/workingDays";
import { loadDependencyFlags, type DependencyFlags, type TaskLinks } from "./dependencyFlags";
import { TIERS } from "../../lib/queryClient";

async function fetchInChunks<T>(
  ids: string[],
  chunkSize: number,
  fetchFn: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<{ data: T[]; error: unknown }> {
  if (ids.length === 0) return { data: [], error: null };
  if (ids.length <= chunkSize) {
    const res = await fetchFn(ids);
    return { data: res.data ?? [], error: res.error };
  }
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  const results = await Promise.all(chunks.map(fetchFn));
  for (const r of results) {
    if (r.error) return { data: [], error: r.error };
  }
  return { data: results.flatMap((r) => r.data ?? []), error: null };
}

// =====================================================================
// Shared data + mutations for the "directory" views — AssigneeViewPage
// (grouped by who's assigned), TaskTypeViewPage (grouped by task type),
// ProjectViewPage (grouped by project, then zone), all company-wide, and
// SpaceTasksPage (grouped by board, scoped to ONE space via the
// `spaceId` option below). All of them need the SAME full inline-edit
// power the single-board table has (useTaskBoard.ts) — so this is a
// sibling of useTaskBoard.ts, not an extension of it: same mutation
// shapes (copied from useTaskBoard.ts's updateStatus/updateTaskType/
// updatePriority/updateStartDate/updateDueDate/setAssignees), but its
// own fetch and its own query key, since there's no single boardId to
// key or invalidate by.
//
// Visibility scoping (which spaces count, when no spaceId narrows it to
// one already-chosen space) is the same P8 rule useDepartmentView.ts
// already uses — duplicated here rather than shared, matching that
// file's own stated convention of small per-screen query blocks over a
// shared primitive.
//
// Grouping is deliberately NOT done here — "by assignee" (a task can
// land in more than one bucket), "by task type"/"by project"/"by board"
// (each exactly one bucket, project nested one level further by zone)
// are different enough that each page groups this hook's flat task list
// itself.
//
// Every fetched task is returned as-is (no open/closed split here) —
// "open tasks only" is the Status filter's default in
// directoryFilters.ts, applied client-side by the pages against this
// full fetch, so filtering is instant (no refetch) instead of a round
// trip, the same "fetch everything, filter in JS" shape
// useDepartmentView.ts already uses for its own metrics.
// =====================================================================

export interface TaskDirectoryData {
  tasks: TaskRow[];
  statuses: StatusRow[];
  // Populated from useAssignablePeople() at the hook level — see the
  // `data` memo near the end of this file.
  employeesById: Map<string, AssignablePerson>;
  allEmployees: AssignablePerson[];
  assigneesByTask: Map<string, string[]>;
  taskTypes: Map<string, TaskTypeLite>;
  tagsByTask: Map<string, TagLite[]>;
  parentTitleByTask: Map<string, string>;
  projectNamesById: Map<string, string>;
  zoneNamesById: Map<string, string>;
  boardNamesById: Map<string, string>;
  /** board id -> boards.sort_order (the order set in space settings) */
  boardOrderById: Map<string, number>;
  /** board_id → the name of the space that board lives in. Keyed by
   * board rather than by space so the row can resolve a task's origin in
   * one lookup off task.board_id, with no space_id hop in the component. */
  spaceNameByBoardId: Map<string, string>;
  /** board_id → the space it lives in; rows use it to look up what I may do there. */
  spaceIdByBoardId: Map<string, string>;
  /** space id → spaces.created_by. The overdue-reminder button lets a space's
   * creator chase late work in that space (admins can chase anywhere). */
  spaceCreatorById: Map<string, string>;
  linkedTaskIds: Set<string>;
  blockedTaskIds: Set<string>;
  /** The row's stop / "!" / check icons — see useTaskBoard.ts's own field. */
  dependencyFlags: Map<string, DependencyFlags>;
  /** Every link of each task, both directions — the row's link editor. */
  dependencyLinks: Map<string, TaskLinks>;
  /** The links themselves — the space Gantt's lines. */
  dependencies: DependencyPair[];
  unmetRequirementTaskIds: Set<string>;
  attachedTaskIds: Set<string>;
  commentedTaskIds: Set<string>;
}

export function useTaskDirectory(options?: { spaceId?: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tasksDb = supabase.schema("tasks");
  const spaceId = options?.spaceId;
  const { access } = useMyTaskAccess();
  const queryKey = ["task-directory", user?.id, spaceId ?? null, accessSignature(access)];

  const query = useQuery({
    queryKey,
    enabled: !!user?.id && !!access,
    staleTime: TIERS.B.staleTime,
    gcTime: TIERS.B.gcTime,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<TaskDirectoryData> => {
      try {
        if (!user?.id || !access) throw new Error("no user");

      let boards: { id: string; name: string; space_id: string; sort_order: number }[];
      let spaceNamesById = new Map<string, string>();
      let spaceCreatorById = new Map<string, string>();

      // ─── BATCH 1: Metadata + Spaces in parallel ───
      const [
        spacesResult,
        statusResult,
        taskTypesResult,
        tagsResult,
      ] = await Promise.all([
        spaceId
          ? Promise.all([
              tasksDb
                .from("boards")
                .select("id, name, space_id, sort_order")
                .eq("space_id", spaceId)
                .eq("is_archived", false)
                .eq("is_template", false),
              tasksDb
                .from("spaces")
                .select("id, name, created_by")
                .eq("id", spaceId)
                .maybeSingle(),
            ])
          : tasksDb
              .from("spaces")
              .select("id, name, created_by")
              .eq("is_archived", false)
              .eq("is_template", false),
        tasksDb
          .from("statuses")
          .select("*")
          .order("sort_order", { ascending: true }),
        tasksDb
          .from("task_types")
          .select("id, name, name_ar, color")
          .order("name_ar"),
        tasksDb
          .from("tags")
          .select("id, name, color"),
      ]);

      if (statusResult.error) {
        console.error("useTaskDirectory statusResult error:", statusResult.error);
        throw statusResult.error;
      }
      if (taskTypesResult.error) {
        console.error("useTaskDirectory taskTypesResult error:", taskTypesResult.error);
        throw taskTypesResult.error;
      }
      if (tagsResult.error) {
        console.error("useTaskDirectory tagsResult error:", tagsResult.error);
        throw tagsResult.error;
      }

      const statusRows = statusResult.data ?? [];
      const taskTypeRows = taskTypesResult.data ?? [];
      const tagRows = tagsResult.data ?? [];
      const tagById = new Map(tagRows.map((t) => [t.id, t]));

      if (spaceId) {
        const [boardsRes, spaceRes] = spacesResult as [
          { data: { id: string; name: string; space_id: string; sort_order: number }[] | null; error: unknown },
          { data: { id: string; name: string; created_by: string | null } | null; error: unknown },
        ];
        if (boardsRes.error) throw boardsRes.error;
        if (spaceRes.error) throw spaceRes.error;
        boards = boardsRes.data ?? [];
        if (spaceRes.data) {
          spaceNamesById.set(spaceRes.data.id, spaceRes.data.name);
          if (spaceRes.data.created_by) spaceCreatorById.set(spaceRes.data.id, spaceRes.data.created_by);
        }
      } else {
        const spacesRes = spacesResult as {
          data: { id: string; name: string; created_by: string | null }[] | null;
          error: unknown;
        };
        if (spacesRes.error) throw spacesRes.error;
        const spaces = spacesRes.data ?? [];
        spaceNamesById = new Map(spaces.map((s) => [s.id, s.name]));
        spaceCreatorById = new Map(
          spaces.filter((s) => !!s.created_by).map((s) => [s.id, s.created_by as string]),
        );

        const visibleSpaceIds = spaces.filter((s) => !!access.spaces[s.id]).map((s) => s.id);

        // ─── BATCH 2 (when no spaceId): fetch boards for visible spaces ───
        const { data: boardsData, error: boardsError } = visibleSpaceIds.length
          ? await tasksDb
              .from("boards")
              .select("id, name, space_id, sort_order")
              .in("space_id", visibleSpaceIds)
              .eq("is_archived", false)
              .eq("is_template", false)
          : { data: [], error: null };
        if (boardsError) throw boardsError;
        boards = boardsData ?? [];
      }

      const boardIds = boards.map((b) => b.id);

      // ─── BATCH 3: fetch all non-archived tasks in these boards (chunked to avoid huge URLs) ───
      const tasksRes = await fetchInChunks<TaskRow>(boardIds, 80, (chunk) =>
        tasksDb.from("tasks").select("*").in("board_id", chunk).eq("is_archived", false),
      );
      if (tasksRes.error) throw tasksRes.error;
      const tasks = tasksRes.data;
      const taskIds = tasks.map((t) => t.id);

      const parentIds = Array.from(new Set(tasks.map((t) => t.parent_task_id).filter((id): id is string => !!id)));
      const projectIds = Array.from(new Set(tasks.map((t) => t.project_id).filter((id): id is string => !!id)));
      const zoneIds = Array.from(new Set(tasks.map((t) => t.zone_id).filter((id): id is string => !!id)));

      const categoryByStatusId = new Map(statusRows.map((s) => [s.id, s.category]));

      // ─── BATCH 4: fetch all task relationships concurrently with safe chunking ───
      const [
        assigneeRowsRes,
        linksResult,
        dependencyResult,
        requirementsResult,
        attachmentsResult,
        commentsResult,
        taskTagsResult,
        parentRowsResult,
        projectRowsResult,
        zoneRowsResult,
      ] = await Promise.all([
        fetchInChunks<{ task_id: string; user_id: string }>(taskIds, 100, (chunk) =>
          tasksDb.from("task_assignees").select("task_id, user_id").in("task_id", chunk),
        ),
        fetchInChunks<{ task_id: string }>(taskIds, 100, (chunk) =>
          tasksDb.from("task_links").select("task_id").in("task_id", chunk),
        ),
        loadDependencyFlags(taskIds, tasks, categoryByStatusId),
        fetchInChunks<{ task_id: string }>(taskIds, 100, (chunk) =>
          tasksDb.from("task_requirements").select("task_id").in("task_id", chunk).eq("is_satisfied", false),
        ),
        fetchInChunks<{ entity_id: string }>(taskIds, 100, (chunk) =>
          supabase.from("attachments").select("entity_id").eq("entity_type", "task").in("entity_id", chunk),
        ),
        fetchInChunks<{ task_id: string }>(taskIds, 100, (chunk) =>
          tasksDb.from("task_comments").select("task_id").in("task_id", chunk),
        ),
        fetchInChunks<{ task_id: string; tag_id: string }>(taskIds, 100, (chunk) =>
          tasksDb.from("task_tags").select("task_id, tag_id").in("task_id", chunk),
        ),
        fetchInChunks<{ id: string; title: string }>(parentIds, 100, (chunk) =>
          tasksDb.from("tasks").select("id, title").in("id", chunk),
        ),
        fetchInChunks<{ id: string; name: string }>(projectIds, 100, (chunk) =>
          supabase.from("projects").select("id, name").in("id", chunk),
        ),
        fetchInChunks<{ id: string; name: string }>(zoneIds, 100, (chunk) =>
          supabase.schema("boq").from("zones").select("id, name").in("id", chunk),
        ),
      ]);

      if (assigneeRowsRes.error) throw assigneeRowsRes.error;
      if (linksResult.error) throw linksResult.error;
      if (requirementsResult.error) throw requirementsResult.error;
      if (attachmentsResult.error) throw attachmentsResult.error;
      if (commentsResult.error) throw commentsResult.error;
      if (taskTagsResult.error) throw taskTagsResult.error;
      if (parentRowsResult.error) throw parentRowsResult.error;
      if (projectRowsResult.error) throw projectRowsResult.error;
      if (zoneRowsResult.error) throw zoneRowsResult.error;

      const tagsByTask = new Map<string, TagLite[]>();
      for (const row of taskTagsResult.data) {
        const tag = tagById.get(row.tag_id);
        if (!tag) continue;
        const list = tagsByTask.get(row.task_id) ?? [];
        list.push(tag);
        tagsByTask.set(row.task_id, list);
      }

      const assigneesByTask = new Map<string, string[]>();
      for (const row of assigneeRowsRes.data) {
        const list = assigneesByTask.get(row.task_id) ?? [];
        list.push(row.user_id);
        assigneesByTask.set(row.task_id, list);
      }

      const parentTitleByTask = new Map<string, string>();
      for (const t of tasks) {
        if (!t.parent_task_id) continue;
        const parent = parentRowsResult.data.find((p) => p.id === t.parent_task_id);
        if (parent) parentTitleByTask.set(t.id, parent.title);
      }

      return {
        tasks,
        statuses: statusRows,
        // Real values merged in by the `data` memo below.
        employeesById: new Map(),
        allEmployees: [],
        assigneesByTask,
        taskTypes: new Map(taskTypeRows.map((t) => [t.id, t])),
        tagsByTask,
        parentTitleByTask,
        projectNamesById: new Map(projectRowsResult.data.map((p) => [p.id, p.name])),
        zoneNamesById: new Map(zoneRowsResult.data.map((z) => [z.id, z.name])),
        boardNamesById: new Map(boards.map((b) => [b.id, b.name])),
        boardOrderById: new Map(boards.map((b) => [b.id, b.sort_order])),
        spaceIdByBoardId: new Map(boards.map((b) => [b.id, b.space_id])),
        spaceCreatorById,
        spaceNameByBoardId: new Map(
          boards
            .map((b) => [b.id, spaceNamesById.get(b.space_id)] as const)
            .filter((pair): pair is readonly [string, string] => !!pair[1]),
        ),
        linkedTaskIds: new Set(linksResult.data.map((r) => r.task_id)),
        blockedTaskIds: dependencyResult.blockedTaskIds,
        dependencyFlags: dependencyResult.dependencyFlags,
        dependencyLinks: dependencyResult.dependencyLinks,
        dependencies: dependencyResult.dependencies,
        unmetRequirementTaskIds: new Set((requirementsResult.data ?? []).map((r) => r.task_id)),
        attachedTaskIds: new Set((attachmentsResult.data ?? []).map((a) => a.entity_id)),
        commentedTaskIds: new Set((commentsResult.data ?? []).map((c) => c.task_id)),
      };
      } catch (err) {
        console.error("USE_TASK_DIRECTORY_FAIL:", err);
        throw err;
      }
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const updateStatus = useMutation({
    mutationFn: async ({ taskId, statusId }: { taskId: string; statusId: string }) => {
      const prev = query.data?.tasks.find((t) => t.id === taskId)?.status_id;
      const { error } = await tasksDb.from("tasks").update({ status_id: statusId }).eq("id", taskId);
      if (error) throw error;
      if (prev && prev !== statusId) recordTaskPatch("تغيير الحالة", taskId, { status_id: prev }, { status_id: statusId });
      // "The next task is ready" is sent by the database (notify.task_unblocked).

      // Any task that lists this one as a blocker has its own cached
      // detail view keyed by ITS OWN taskId — invalidate those too, or
      // an already-open dependent panel's dependency badge (amber/green)
      // stays stale (see useTaskDetail.ts's updateField for the same fix).
      const { data: dependents, error: dependentsError } = await tasksDb
        .from("task_dependencies")
        .select("blocked_task_id")
        .eq("blocking_task_id", taskId);
      if (dependentsError) {
        console.error("Failed to look up dependent tasks to invalidate", dependentsError);
      } else {
        for (const dep of dependents ?? []) {
          queryClient.invalidateQueries({ queryKey: ["task-detail", dep.blocked_task_id] });
        }
      }
    },
    onSuccess: invalidate,
  });

  const updateTaskType = useMutation({
    mutationFn: async ({ taskId, taskTypeId }: { taskId: string; taskTypeId: string }) => {
      const prev = query.data?.tasks.find((t) => t.id === taskId)?.task_type_id;
      const { error } = await tasksDb.from("tasks").update({ task_type_id: taskTypeId }).eq("id", taskId);
      if (error) throw error;
      if (prev && prev !== taskTypeId) recordTaskPatch("تغيير النوع", taskId, { task_type_id: prev }, { task_type_id: taskTypeId });
    },
    onSuccess: invalidate,
  });

  const updatePriority = useMutation({
    mutationFn: async ({ taskId, priority }: { taskId: string; priority: Priority | null }) => {
      const prevTask = query.data?.tasks.find((t) => t.id === taskId);
      const { error } = await tasksDb.from("tasks").update({ priority }).eq("id", taskId);
      if (error) throw error;
      if (prevTask) recordTaskPatch("تغيير الأولوية", taskId, { priority: prevTask.priority }, { priority });
    },
    onSuccess: invalidate,
  });

  // A real board's dates go through the scheduler (useTaskSchedule.ts),
  // which also moves the tasks linked after this one; a template's "Day N"
  // dates are written directly.
  const updateStartDate = useMutation({
    mutationFn: async ({ taskId, startDate }: { taskId: string; startDate: string | null }) => {
      const prevTask = query.data?.tasks.find((t) => t.id === taskId);
      if (prevTask && !prevTask.is_template) {
        if (startDate) await saveTaskSchedule(prevTask, { startDate });
        return;
      }
      const { error } = await tasksDb.from("tasks").update({ start_date: startDate }).eq("id", taskId);
      if (error) throw error;
      if (prevTask) recordTaskPatch("تغيير تاريخ البدء", taskId, { start_date: prevTask.start_date }, { start_date: startDate });
    },
    onSettled: () => {
      invalidate();
      invalidateSchedule(queryClient);
    },
  });

  const updateDueDate = useMutation({
    mutationFn: async ({ taskId, dueDate }: { taskId: string; dueDate: string | null }) => {
      const prevTask = query.data?.tasks.find((t) => t.id === taskId);
      if (prevTask && !prevTask.is_template) {
        if (dueDate) await saveTaskSchedule(prevTask, { dueDate });
        return;
      }
      const { error } = await tasksDb.from("tasks").update({ due_date: dueDate }).eq("id", taskId);
      if (error) throw error;
      if (prevTask) recordTaskPatch("تغيير تاريخ الاستحقاق", taskId, { due_date: prevTask.due_date }, { due_date: dueDate });
    },
    onSettled: () => {
      invalidate();
      invalidateSchedule(queryClient);
    },
  });

  // The space Gantt's drag / resize / date and days columns — the same
  // shape as useTaskBoard.ts's updateTaskDates: one scheduler call per
  // gesture, optimistic for the dragged bar only (the tasks it pushes move
  // when the refetch lands).
  const updateTaskDates = useMutation({
    mutationFn: async ({
      taskId,
      startDate,
      dueDate,
      durationDays,
    }: {
      taskId: string;
      startDate?: string | null;
      dueDate?: string | null;
      durationDays?: number;
    }) => {
      const prevTask = query.data?.tasks.find((t) => t.id === taskId);
      if (!prevTask) return;
      const change: ScheduleChange = {};
      if (startDate) change.startDate = startDate;
      if (durationDays !== undefined) change.durationDays = durationDays;
      else if (dueDate) change.dueDate = dueDate;
      if (Object.keys(change).length > 0) await saveTaskSchedule(prevTask, change);
    },
    onMutate: async ({ taskId, startDate, durationDays }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskDirectoryData>(queryKey);
      if (previous) {
        queryClient.setQueryData<TaskDirectoryData>(queryKey, {
          ...previous,
          tasks: previous.tasks.map((t) => {
            if (t.id !== taskId) return t;
            // what the scheduler will do, so the bar lands where it will stay
            const start = startDate ? workingDayOnOrAfterString(startDate) : t.start_date;
            const days = durationDays ?? t.duration_days ?? 1;
            return start ? { ...t, start_date: start, duration_days: days, due_date: dueFromDays(start, days) } : t;
          }),
        });
      }
      return { previous };
    },
    // saveTaskSchedule records the undo entry
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: (_data, _error, { taskId }) => {
      invalidate();
      invalidateSchedule(queryClient);
      queryClient.invalidateQueries({ queryKey: ["task-detail", taskId] });
    },
  });

  const clearLag = useMutation({
    mutationFn: async (taskId: string) => {
      const prevTask = query.data?.tasks.find((t) => t.id === taskId);
      if (prevTask) await saveTaskSchedule(prevTask, { lagDays: 0 });
    },
    onSettled: () => {
      invalidate();
      invalidateSchedule(queryClient);
    },
  });

  const setAssignees = useMutation({
    mutationFn: async ({ taskId, userIds }: { taskId: string; userIds: string[] }) => {
      const current = query.data?.assigneesByTask.get(taskId) ?? [];
      const toAdd = userIds.filter((id) => !current.includes(id));
      const toRemove = current.filter((id) => !userIds.includes(id));

      if (toRemove.length) {
        const { error } = await tasksDb.from("task_assignees").delete().eq("task_id", taskId).in("user_id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length && user?.id) {
        const { error } = await tasksDb
          .from("task_assignees")
          .insert(toAdd.map((userId) => ({ task_id: taskId, user_id: userId, assigned_by: user.id })));
        if (error) throw error;
        // New assignees are told by the database (task.assigned).
      }

      recordAssignees("تعيين المسؤولين", user?.id, [
        {
          taskId,
          before: current,
          after: [...current.filter((id) => userIds.includes(id)), ...(user?.id ? toAdd : [])],
        },
      ]);
    },
    onSuccess: () => {
      invalidate();
      invalidateTaskAccess(queryClient);
    },
  });

  // Unlike useTaskBoard.ts's own createTask, this can't lean on
  // query.data.statuses to find the board's "not started" status —
  // TaskDirectoryData.statuses only holds the sets of tasks already
  // fetched, which is nothing for a board with no tasks yet (and a space
  // can mix sets). Resolves the board's own status set fresh instead
  // (same fallback chain resolveStatusSetId.ts already shares with
  // useTaskBoard.ts/useTaskDetail.ts).
  const createTask = useMutation({
    mutationFn: async ({ boardId, title }: { boardId: string; title: string }) => {
      if (!user?.id) throw new Error("no user");

      const { data: board, error: boardError } = await tasksDb
        .from("boards")
        .select("id, space_id, status_set_id")
        .eq("id", boardId)
        .single();
      if (boardError) throw boardError;

      const statusSetId = await resolveStatusSetId(board.status_set_id, board.space_id);
      const { data: statusRows, error: statusesError } = await tasksDb
        .from("statuses")
        .select("id, category")
        .eq("status_set_id", statusSetId)
        .order("sort_order", { ascending: true });
      if (statusesError) throw statusesError;
      const firstOpenStatus = (statusRows ?? []).find((s) => s.category === "not_started") ?? statusRows?.[0];
      if (!firstOpenStatus) throw new Error("لا توجد حالات معرّفة لهذه اللوحة");

      const { data: space, error: spaceError } = await tasksDb
        .from("spaces")
        .select("project_id")
        .eq("id", board.space_id)
        .single();
      if (spaceError) throw spaceError;

      const maxSort = (query.data?.tasks ?? [])
        .filter((t) => t.board_id === boardId && !t.parent_task_id)
        .reduce((max, t) => Math.max(max, t.sort_order), -1);

      const { error } = await tasksDb.from("tasks").insert({
        board_id: boardId,
        parent_task_id: null,
        title,
        status_id: firstOpenStatus.id,
        project_id: space.project_id,
        created_by: user.id,
        sort_order: maxSort + 1,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const assignablePeople = useAssignablePeople();

  // assignablePeople is fetched by its own shared, cross-screen query
  // (useAssignablePeople), not inside this directory's queryFn — merge it
  // in here so `data.employeesById`/`data.allEmployees` keep working for
  // existing consumers (AssigneeViewPage, DirectoryFilterSortPopover, ...).
  const data = useMemo(() => {
    if (!query.data) return query.data;
    return {
      ...query.data,
      employeesById: new Map(assignablePeople.map((e) => [e.id, e])),
      allEmployees: assignablePeople,
    };
  }, [query.data, assignablePeople]);

  return {
    data,
    loading: query.isPending,
    error: query.error,
    onChangeStatus: (taskId: string, statusId: string) => updateStatus.mutate({ taskId, statusId }),
    onChangeTaskType: (taskId: string, taskTypeId: string) => updateTaskType.mutate({ taskId, taskTypeId }),
    onChangePriority: (taskId: string, priority: Priority | null) => updatePriority.mutate({ taskId, priority }),
    onChangeStartDate: (taskId: string, startDate: string | null) => updateStartDate.mutate({ taskId, startDate }),
    onChangeDueDate: (taskId: string, dueDate: string | null) => updateDueDate.mutate({ taskId, dueDate }),
    onClearLag: (taskId: string) => clearLag.mutate(taskId),
    onChangeTaskDates: (
      taskId: string,
      change: { startDate?: string | null; dueDate?: string | null; durationDays?: number },
    ) => updateTaskDates.mutate({ taskId, ...change }),
    onChangeAssignees: (taskId: string, userIds: string[]) => setAssignees.mutate({ taskId, userIds }),
    onCreateTask: (boardId: string, title: string) => createTask.mutateAsync({ boardId, title }),
  };
}
