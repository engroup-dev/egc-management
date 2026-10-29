import { useMemo } from "react";
import { invalidateTaskAccess } from "./useTaskAccess";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import type { Database, Json } from "../../lib/supabase";
import { useAuth } from "../useAuth";
import { useAssignablePeople, type AssignablePerson } from "./useAssignablePeople";
import { resolveStatusSetId } from "./resolveStatusSetId";
import { DEFAULT_FEATURE_SETTINGS, type SpaceFeatureSettings } from "./useSpaceSettings";
import { emitTaskError } from "./taskErrorBus";
import { extractErrorMessage } from "./extractErrorMessage";
import { topmostTaskIds, withDescendants } from "./bulkSelection";
import { archiveTasks } from "./taskArchive";
import { recordAssignees, recordTaskPatch, recordTaskPatches, recordTaskValue } from "./taskUndo";
import { invalidateSchedule, saveTaskSchedule, type ScheduleChange } from "./useTaskSchedule";
import { dueFromDays, workingDayOnOrAfterString } from "../../components/tasks/board/workingDays";
import { loadDependencyFlags, type DependencyFlags, type TaskLinks } from "./dependencyFlags";

/** How many tasks a bulk status change updates at once. */
const BULK_BATCH_SIZE = 6;

// D2 — Zone board (list view), the main screen (build plan Part 7, D2).
//
// Custom columns (board_columns → field_definitions → task_values) are
// attach-existing-or-create-new, per §4.11's "define once, attach many" —
// detaching a column (deleting its board_columns row) never touches
// task_values, so it's non-destructive and the field can be reattached
// later with its data intact. There's no "hidden columns" browser here
// (is_visible exists on board_columns but this screen doesn't use it) —
// "···" only offers rename-the-field (shared everywhere it's attached)
// and detach-from-this-board, not hide/unhide.

export type TaskRow = Database["tasks"]["Tables"]["tasks"]["Row"];
export type StatusRow = Database["tasks"]["Tables"]["statuses"]["Row"];
export type Priority = Database["tasks"]["Enums"]["priority"];
export type FieldType = Database["tasks"]["Enums"]["field_type"];

export interface CustomColumn {
  boardColumnId: string;
  fieldDefinitionId: string;
  name_ar: string;
  type: FieldType;
  config: Json;
}

export interface EmployeeLite {
  id: string;
  first_name: string;
  last_name: string | null;
}

export interface TaskTypeLite {
  id: string;
  /** Stable system key (e.g. "milestone") — logic reads this, never name_ar. */
  name: string;
  name_ar: string;
  color: string | null;
}

/** fs: starts the working day after the other ends; ss: starts with it. */
export type LinkType = "fs" | "ss";

/** One task_dependencies edge, read from either end. */
export interface DependencyPair {
  blocking_task_id: string;
  blocked_task_id: string;
  /** Missing = "fs" (a new link is finish -> start unless asked). */
  link_type?: LinkType;
  /** Made by "chain zones" (the same task in the next zone). */
  zone_chain?: boolean;
}

export interface TagLite {
  id: string;
  name: string;
  color: string | null;
}

export interface TaskBoardData {
  board: { id: string; name: string; space_id: string; zone_id: string | null; is_template: boolean };
  zoneName: string | null;
  statuses: StatusRow[];
  tasks: TaskRow[];
  assigneesByTask: Map<string, string[]>; // task_id -> user_id[]
  // Populated from useAssignablePeople() at the hook level, not fetched in
  // queryFn (hooks aren't callable inside an async callback) — see the
  // `data` memo below.
  employees: AssignablePerson[];
  taskTypes: Map<string, TaskTypeLite>;
  departmentNamesById: Map<string, string>;
  linkedTaskIds: Set<string>;
  /** Tasks waiting on another task that isn't done yet. */
  blockedTaskIds: Set<string>;
  /** Per task: what it waits on, what waits on it, or "cleared" once
   * everything it waited on is done — the row's stop / "!" / check icons. */
  dependencyFlags: Map<string, DependencyFlags>;
  /** Every link of each task, both directions — the row's link icons and their popover. */
  dependencyLinks: Map<string, TaskLinks>;
  // The edges whose waiting side is on this board (the other side may be
  // on another board). The Gantt view draws an arrow for each edge whose
  // two ends are both on this board.
  dependencies: DependencyPair[];
  unmetRequirementTaskIds: Set<string>;
  attachedTaskIds: Set<string>;
  commentedTaskIds: Set<string>;
  tagsByTask: Map<string, TagLite[]>;
  subtaskProgressByTask: Map<string, { done: number; total: number }>;
  /** null when the board's space isn't a project space (department/company/personal) — tasks.project_id is nullable for exactly this case. */
  projectId: string | null;
  customColumns: CustomColumn[];
  hiddenColumns: CustomColumn[];
  valuesByTask: Map<string, Map<string, Json>>; // task_id -> field_definition_id -> value
  featureSettings: SpaceFeatureSettings;
}

export function useAllFieldDefinitions() {
  const query = useQuery({
    queryKey: ["all-field-definitions"],
    queryFn: async () => {
      const { data, error } = await supabase.schema("tasks").from("field_definitions").select("id, name_ar, type, config").order("name_ar");
      if (error) throw error;
      return data ?? [];
    },
  });
  return query.data ?? [];
}

export function useTaskBoard(boardId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const tasksDb = supabase.schema("tasks");
  const queryKey = ["task-board", boardId];

  const query = useQuery({
    queryKey,
    enabled: !!boardId,
    queryFn: async (): Promise<TaskBoardData> => {
      if (!boardId) throw new Error("no board id");

      const { data: board, error: boardError } = await tasksDb
        .from("boards")
        .select("id, name, space_id, zone_id, status_set_id, is_template")
        .eq("id", boardId)
        .single();
      if (boardError) throw boardError;

      const [{ data: space, error: spaceError }, statusSetId, zoneRow] =
        await Promise.all([
          tasksDb
            .from("spaces")
            .select("project_id, settings")
            .eq("id", board.space_id)
            .single(),
          resolveStatusSetId(board.status_set_id, board.space_id),
          board.zone_id
            ? supabase.schema("boq").from("zones").select("name").eq("id", board.zone_id).single()
            : Promise.resolve({ data: null, error: null }),
        ]);
      if (spaceError) throw spaceError;
      if (zoneRow.error) throw zoneRow.error;

      // D9's "الميزات" tab wrote these but nothing ever read them back —
      // priorities/task_types were saved, fully inert. This is the read
      // side: D2 respects them for the priority column and the task-type
      // dot/group-by option. time_tracking stays inert (no time-tracking
      // UI exists yet to gate); default_view stays inert (Kanban is
      // Part 7/Phase 7 "Later", not built).
      const featureSettings: SpaceFeatureSettings = {
        ...DEFAULT_FEATURE_SETTINGS,
        ...(space.settings as unknown as Partial<SpaceFeatureSettings>),
      };

      const [
        { data: statuses, error: statusesError },
        { data: tasks, error: tasksError },
      ] = await Promise.all([
        tasksDb
          .from("statuses")
          .select("*")
          .eq("status_set_id", statusSetId)
          .order("sort_order", { ascending: true }),
        tasksDb
          .from("tasks")
          .select("*")
          .eq("board_id", boardId)
          .eq("is_archived", false)
          .order("sort_order", { ascending: true }),
      ]);
      if (statusesError) throw statusesError;
      if (tasksError) throw tasksError;

      const taskIds = (tasks ?? []).map((t) => t.id);
      const departmentIds = Array.from(
        new Set((tasks ?? []).map((t) => t.department_id).filter(Boolean)),
      ) as string[];

      const [
        { data: assigneeRows, error: assigneeError },
        { data: taskTypeRows, error: taskTypesError },
        { data: departmentRows, error: departmentsError },
        linksResult,
        requirementsResult,
        attachmentsResult,
        commentsResult,
        taskTagsResult,
        dependencyResult,
      ] = await Promise.all([
        taskIds.length
          ? tasksDb
              .from("task_assignees")
              .select("task_id, user_id")
              .in("task_id", taskIds)
          : Promise.resolve({ data: [], error: null }),
        // The full company-wide catalog, not just the types already used on
        // this board's tasks — TaskTypeCell's popover needs every type as a
        // pickable option, same reasoning as useAllFieldDefinitions.
        tasksDb.from("task_types").select("id, name, name_ar, color").order("name_ar"),
        departmentIds.length
          ? supabase.from("departments").select("id, name_ar, name").in("id", departmentIds)
          : Promise.resolve({ data: [], error: null }),
        taskIds.length
          ? tasksDb.from("task_links").select("task_id").in("task_id", taskIds)
          : Promise.resolve({ data: [], error: null }),
        taskIds.length
          ? tasksDb
              .from("task_requirements")
              .select("task_id")
              .in("task_id", taskIds)
              .eq("is_satisfied", false)
          : Promise.resolve({ data: [], error: null }),
        taskIds.length
          ? supabase.from("attachments").select("entity_id").eq("entity_type", "task").in("entity_id", taskIds)
          : Promise.resolve({ data: [], error: null }),
        taskIds.length
          ? tasksDb.from("task_comments").select("task_id").in("task_id", taskIds)
          : Promise.resolve({ data: [], error: null }),
        taskIds.length
          ? tasksDb.from("task_tags").select("task_id, tag_id").in("task_id", taskIds)
          : Promise.resolve({ data: [], error: null }),
        loadDependencyFlags(
          taskIds,
          tasks ?? [],
          new Map((statuses ?? []).map((s) => [s.id, s.category])),
        ),
      ]);
      if (assigneeError) throw assigneeError;
      if (taskTypesError) throw taskTypesError;
      if (departmentsError) throw departmentsError;
      if (linksResult.error) throw linksResult.error;
      if (requirementsResult.error) throw requirementsResult.error;
      if (attachmentsResult.error) throw attachmentsResult.error;
      if (commentsResult.error) throw commentsResult.error;
      if (taskTagsResult.error) throw taskTagsResult.error;

      // Which tags exist isn't known until task_tags resolves, so this is
      // a follow-up query rather than part of the Promise.all above (same
      // shape as the blocking-tasks lookup further down) — only the tags
      // actually attached to this board's tasks, not the full company
      // catalog (unlike TaskTypeCell's popover, this is read-only display).
      const attachedTagIds = Array.from(new Set((taskTagsResult.data ?? []).map((r) => r.tag_id)));
      const { data: tagRows, error: tagsError } = attachedTagIds.length
        ? await tasksDb.from("tags").select("id, name, color").in("id", attachedTagIds)
        : { data: [], error: null };
      if (tagsError) throw tagsError;

      const tagById = new Map((tagRows ?? []).map((t) => [t.id, t]));
      const tagsByTask = new Map<string, TagLite[]>();
      for (const row of taskTagsResult.data ?? []) {
        const tag = tagById.get(row.tag_id);
        if (!tag) continue;
        const list = tagsByTask.get(row.task_id) ?? [];
        list.push(tag);
        tagsByTask.set(row.task_id, list);
      }

      const assigneesByTask = new Map<string, string[]>();
      for (const row of assigneeRows ?? []) {
        const list = assigneesByTask.get(row.task_id) ?? [];
        list.push(row.user_id);
        assigneesByTask.set(row.task_id, list);
      }

      const taskTypes = new Map<string, TaskTypeLite>(
        (taskTypeRows ?? []).map((t) => [t.id, t]),
      );

      const departmentNamesById = new Map<string, string>(
        (departmentRows ?? []).map((d) => [d.id, d.name_ar ?? d.name]),
      );

      const linkedTaskIds = new Set((linksResult.data ?? []).map((r) => r.task_id));

      const unmetRequirementTaskIds = new Set(
        (requirementsResult.data ?? []).map((r) => r.task_id),
      );

      const attachedTaskIds = new Set((attachmentsResult.data ?? []).map((a) => a.entity_id));
      const commentedTaskIds = new Set((commentsResult.data ?? []).map((c) => c.task_id));

      // Subtask progress (Part 11 open decision #5) — plain completed-count,
      // not weighted by time_estimate_minutes: most ad-hoc tasks never get
      // an estimate filled in, so weighting would silently show 0% or hide
      // the badge entirely for them. Counting always works. Direct
      // children only, not the whole subtree, matching D2's row scope.
      const categoryByStatusId = new Map((statuses ?? []).map((s) => [s.id, s.category]));
      const subtaskProgressByTask = new Map<string, { done: number; total: number }>();
      for (const t of tasks ?? []) {
        if (!t.parent_task_id) continue;
        const progress = subtaskProgressByTask.get(t.parent_task_id) ?? { done: 0, total: 0 };
        progress.total += 1;
        const category = categoryByStatusId.get(t.status_id);
        if (category === "done" || category === "closed") progress.done += 1;
        subtaskProgressByTask.set(t.parent_task_id, progress);
      }

      // Fetch every column regardless of visibility — is_visible was
      // previously only ever written as true, so "hide" had no unhide
      // path (a hidden column would just vanish from every query that
      // filters on it). hiddenColumns below is what makes it reversible.
      const { data: boardColumnRows, error: boardColumnsError } = await tasksDb
        .from("board_columns")
        .select("id, field_definition_id, sort_order, is_visible")
        .eq("board_id", boardId)
        .order("sort_order");
      if (boardColumnsError) throw boardColumnsError;

      const columnFieldIds = (boardColumnRows ?? []).map((c) => c.field_definition_id);
      const [{ data: fieldDefRows, error: fieldDefsError }, { data: valueRows, error: valuesError }] = await Promise.all([
        columnFieldIds.length
          ? tasksDb.from("field_definitions").select("id, name_ar, type, config").in("id", columnFieldIds)
          : Promise.resolve({ data: [], error: null }),
        columnFieldIds.length && taskIds.length
          ? tasksDb.from("task_values").select("task_id, field_definition_id, value").in("field_definition_id", columnFieldIds).in("task_id", taskIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (fieldDefsError) throw fieldDefsError;
      if (valuesError) throw valuesError;

      const fieldDefById = new Map((fieldDefRows ?? []).map((f) => [f.id, f]));
      const allColumns = (boardColumnRows ?? [])
        .map((c) => {
          const field = fieldDefById.get(c.field_definition_id);
          return field
            ? { boardColumnId: c.id, fieldDefinitionId: field.id, name_ar: field.name_ar, type: field.type, config: field.config, isVisible: c.is_visible }
            : null;
        })
        .filter((c): c is CustomColumn & { isVisible: boolean } => !!c);

      const toCustomColumn = (c: CustomColumn & { isVisible: boolean }): CustomColumn => ({
        boardColumnId: c.boardColumnId,
        fieldDefinitionId: c.fieldDefinitionId,
        name_ar: c.name_ar,
        type: c.type,
        config: c.config,
      });
      const customColumns: CustomColumn[] = allColumns.filter((c) => c.isVisible).map(toCustomColumn);
      const hiddenColumns: CustomColumn[] = allColumns.filter((c) => !c.isVisible).map(toCustomColumn);

      const valuesByTask = new Map<string, Map<string, Json>>();
      for (const row of valueRows ?? []) {
        const forTask = valuesByTask.get(row.task_id) ?? new Map<string, Json>();
        forTask.set(row.field_definition_id, row.value);
        valuesByTask.set(row.task_id, forTask);
      }

      return {
        board: {
          id: board.id,
          name: board.name,
          space_id: board.space_id,
          zone_id: board.zone_id,
          is_template: board.is_template,
        },
        zoneName: zoneRow.data?.name ?? null,
        statuses: statuses ?? [],
        tasks: tasks ?? [],
        assigneesByTask,
        // Real value merged in by the `data` memo below.
        employees: [],
        taskTypes,
        departmentNamesById,
        linkedTaskIds,
        blockedTaskIds: dependencyResult.blockedTaskIds,
        dependencyFlags: dependencyResult.dependencyFlags,
        dependencyLinks: dependencyResult.dependencyLinks,
        dependencies: dependencyResult.dependencies,
        unmetRequirementTaskIds,
        attachedTaskIds,
        commentedTaskIds,
        tagsByTask,
        subtaskProgressByTask,
        projectId: space.project_id,
        customColumns,
        hiddenColumns,
        valuesByTask,
        featureSettings,
      };
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    // a new/moved task can change the template-push banner (useTemplateSync.ts)
    queryClient.invalidateQueries({ queryKey: ["template-sync", boardId] });
  };

  // One task's status change plus its side effects — shared by the cell's
  // updateStatus and the bulk bar's bulkSetStatus.
  const applyStatus = async (taskId: string, statusId: string) => {
    const { error } = await tasksDb
      .from("tasks")
      .update({ status_id: statusId })
      .eq("id", taskId);
    if (error) throw error;

    // "The next task is ready" is sent by the database when this status
    // change frees a dependent task (notify.task_unblocked).

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
  };

  const updateStatus = useMutation({
    mutationFn: async ({ taskId, statusId }: { taskId: string; statusId: string }) => {
      const prev = query.data?.tasks.find((t) => t.id === taskId)?.status_id;
      await applyStatus(taskId, statusId);
      if (prev && prev !== statusId) recordTaskPatch("تغيير الحالة", taskId, { status_id: prev }, { status_id: statusId });
    },
    onSuccess: invalidate,
  });

  // ---------------------------------------------------------------------
  // Bulk actions (BulkActionPanel)
  // ---------------------------------------------------------------------
  // Status changes run one task at a time, in small batches, and settle
  // independently: completing a task can be refused by the database (unmet
  // requirements, see tasks.assert_requirements_satisfied), and one refusal
  // must not roll back or hide the rest. Partial failures are reported
  // through the tasks error toast instead of throwing, so the tasks that did
  // change still refresh.
  const reportBulkFailures = (results: PromiseSettledResult<unknown>[]) => {
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failures.length === 0) return;
    const ok = results.length - failures.length;
    emitTaskError(
      `تم ${ok} من ${results.length} — فشل ${failures.length}: ${extractErrorMessage(failures[0].reason)}`,
    );
  };

  const bulkSetStatus = useMutation({
    mutationFn: async ({ taskIds, statusId }: { taskIds: string[]; statusId: string }) => {
      const prevById = new Map((query.data?.tasks ?? []).map((t) => [t.id, t.status_id]));
      const results: PromiseSettledResult<void>[] = [];
      for (let i = 0; i < taskIds.length; i += BULK_BATCH_SIZE) {
        const batch = taskIds.slice(i, i + BULK_BATCH_SIZE);
        results.push(...(await Promise.allSettled(batch.map((id) => applyStatus(id, statusId)))));
      }
      reportBulkFailures(results);
      // Only the tasks that actually changed — a refused one has nothing to undo.
      recordTaskPatches(
        "تغيير الحالة لعدة مهام",
        taskIds.flatMap((taskId, i) => {
          const prev = prevById.get(taskId);
          return results[i]?.status === "fulfilled" && prev && prev !== statusId
            ? [{ taskId, prev: { status_id: prev }, next: { status_id: statusId } }]
            : [];
        }),
      );
    },
    onSettled: invalidate,
  });

  const bulkSetPriority = useMutation({
    mutationFn: async ({ taskIds, priority }: { taskIds: string[]; priority: Priority | null }) => {
      const prevById = new Map((query.data?.tasks ?? []).map((t) => [t.id, t.priority]));
      const { error } = await tasksDb.from("tasks").update({ priority }).in("id", taskIds);
      if (error) throw error;
      recordTaskPatches(
        "تغيير الأولوية لعدة مهام",
        taskIds
          .filter((taskId) => prevById.has(taskId) && prevById.get(taskId) !== priority)
          .map((taskId) => ({ taskId, prev: { priority: prevById.get(taskId) ?? null }, next: { priority } })),
      );
    },
    onSettled: invalidate,
  });

  // Adds and/or removes people across the selected tasks. Only inserts the
  // pairs that don't exist yet; notifies each newly added person once (not
  // once per task), and never on template boards or for yourself.
  const bulkAssign = useMutation({
    mutationFn: async ({
      taskIds,
      add,
      remove,
    }: {
      taskIds: string[];
      add: string[];
      remove: string[];
    }) => {
      const assigneesByTask = query.data?.assigneesByTask ?? new Map<string, string[]>();

      if (remove.length) {
        const { error } = await tasksDb
          .from("task_assignees")
          .delete()
          .in("task_id", taskIds)
          .in("user_id", remove);
        if (error) throw error;
      }

      if (add.length && user?.id) {
        const rows = taskIds.flatMap((taskId) =>
          add
            .filter((userId) => !(assigneesByTask.get(taskId) ?? []).includes(userId))
            .map((userId) => ({ task_id: taskId, user_id: userId, assigned_by: user.id })),
        );
        if (rows.length) {
          const { error } = await tasksDb.from("task_assignees").insert(rows);
          if (error) throw error;
          // The database tells each new assignee, one notification per person
          // for the whole insert (task.assigned, grouped per transaction).
        }
      }

      recordAssignees(
        "تعيين المسؤولين لعدة مهام",
        user?.id,
        taskIds.map((taskId) => {
          const before = assigneesByTask.get(taskId) ?? [];
          const kept = before.filter((id) => !remove.includes(id));
          const after = user?.id ? [...kept, ...add.filter((id) => !kept.includes(id))] : kept;
          return { taskId, before, after };
        }),
      );
    },
    onSettled: () => {
      invalidate();
      invalidateTaskAccess(queryClient);
    },
  });

  // Hard delete, same as the detail panel's deleteTask. Subtasks (and every
  // child row) go with their parent via ON DELETE CASCADE, so only the
  // topmost selected tasks are sent. Resolves with every task id that is now
  // gone, subtasks included, so the page can close a panel that was open on one.
  const bulkDelete = useMutation({
    mutationFn: async ({ taskIds }: { taskIds: string[] }): Promise<Set<string>> => {
      const allTasks = query.data?.tasks ?? [];
      const roots = topmostTaskIds(allTasks, new Set(taskIds));
      if (roots.length === 0) return new Set();
      // archived, not deleted: Ctrl+Z brings them back
      await archiveTasks(roots, roots.length > 1 ? `حذف ${roots.length} مهام` : "حذف مهمة");
      return withDescendants(allTasks, roots);
    },
    onSuccess: (deletedIds) => {
      for (const id of deletedIds) queryClient.removeQueries({ queryKey: ["task-detail", id] });
    },
    onSettled: invalidate,
  });

  const updateTaskType = useMutation({
    mutationFn: async ({ taskId, taskTypeId }: { taskId: string; taskTypeId: string }) => {
      const prev = query.data?.tasks.find((t) => t.id === taskId)?.task_type_id;
      const { error } = await tasksDb
        .from("tasks")
        .update({ task_type_id: taskTypeId })
        .eq("id", taskId);
      if (error) throw error;
      if (prev && prev !== taskTypeId) recordTaskPatch("تغيير النوع", taskId, { task_type_id: prev }, { task_type_id: taskTypeId });
    },
    onSuccess: invalidate,
  });

  const updatePriority = useMutation({
    mutationFn: async ({
      taskId,
      priority,
    }: {
      taskId: string;
      priority: Priority | null;
    }) => {
      const prevTask = query.data?.tasks.find((t) => t.id === taskId);
      const { error } = await tasksDb
        .from("tasks")
        .update({ priority })
        .eq("id", taskId);
      if (error) throw error;
      if (prevTask) recordTaskPatch("تغيير الأولوية", taskId, { priority: prevTask.priority }, { priority });
    },
    onSuccess: invalidate,
  });

  // The title, edited inline (the list row, the diagram's edit bar).
  const updateTitle = useMutation({
    mutationFn: async ({ taskId, title }: { taskId: string; title: string }) => {
      const next = title.trim();
      const prevTask = query.data?.tasks.find((t) => t.id === taskId);
      if (!next || next === prevTask?.title) return;
      const { error } = await tasksDb.from("tasks").update({ title: next }).eq("id", taskId);
      if (error) throw error;
      if (prevTask) recordTaskPatch("تغيير اسم المهمة", taskId, { title: prevTask.title }, { title: next });
    },
    onSuccess: invalidate,
  });

  // Dates. A real board's dates belong to the scheduler (useTaskSchedule.ts):
  // a start, a number of working days or a due date goes to
  // update_task_schedule, which moves the linked tasks after it too. A
  // template board ("Day N", nothing chained) writes its dates directly.
  const scheduleTask = (taskId: string, change: ScheduleChange) => {
    const prev = query.data?.tasks.find((t) => t.id === taskId);
    if (!prev) throw new Error("task not loaded");
    return saveTaskSchedule(prev, change);
  };
  const onScheduleSettled = () => {
    invalidate();
    invalidateSchedule(queryClient, boardId);
  };

  const updateDueDate = useMutation({
    mutationFn: async ({
      taskId,
      dueDate,
    }: {
      taskId: string;
      dueDate: string | null;
    }) => {
      if (dueDate) await scheduleTask(taskId, { dueDate });
    },
    onSettled: onScheduleSettled,
  });

  const updateStartDate = useMutation({
    mutationFn: async ({
      taskId,
      startDate,
    }: {
      taskId: string;
      startDate: string | null;
    }) => {
      if (startDate) await scheduleTask(taskId, { startDate });
    },
    onSettled: onScheduleSettled,
  });

  // Working days (DurationCell). On a template board every Day counts; the
  // database derives the due date from the days either way.
  const updateDuration = useMutation({
    mutationFn: ({ taskId, days }: { taskId: string; days: number }) => scheduleTask(taskId, { durationDays: days }),
    onSettled: onScheduleSettled,
  });

  // The wait gap of a linked task (start_lag_days): working days between its
  // predecessors' end and its own start.
  const updateLag = useMutation({
    mutationFn: ({ taskId, lagDays }: { taskId: string; lagDays: number }) => scheduleTask(taskId, { lagDays }),
    onSettled: onScheduleSettled,
  });

  // Gantt drag/resize, one update per gesture. Optimistic for the dragged bar
  // only — a bar snapping back until the refetch lands reads as "the drag
  // failed" — while the tasks it pushes along move when the refetch lands.
  // Sends what the gesture changed (start and/or days) and the scheduler
  // derives the rest, on a template board too ("Day N", every day counts).
  // An omitted key is left untouched.
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
      const change: ScheduleChange = {};
      if (startDate) change.startDate = startDate;
      if (durationDays !== undefined) change.durationDays = durationDays;
      else if (dueDate) change.dueDate = dueDate;
      if (Object.keys(change).length > 0) await scheduleTask(taskId, change);
    },
    onMutate: async ({ taskId, startDate, durationDays }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskBoardData>(queryKey);
      if (previous) {
        const plain = previous.board.is_template;
        queryClient.setQueryData<TaskBoardData>(queryKey, {
          ...previous,
          tasks: previous.tasks.map((t) => {
            if (t.id !== taskId) return t;
            // what the scheduler will do, so the bar lands where it will stay
            const start = startDate ? workingDayOnOrAfterString(startDate, plain) : t.start_date;
            const days = durationDays ?? t.duration_days ?? 1;
            return start
              ? { ...t, start_date: start, duration_days: days, due_date: dueFromDays(start, days, plain) }
              : t;
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
      onScheduleSettled();
      queryClient.invalidateQueries({ queryKey: ["task-detail", taskId] });
    },
  });

  const setAssignees = useMutation({
    mutationFn: async ({
      taskId,
      userIds,
    }: {
      taskId: string;
      userIds: string[];
    }) => {
      const current = query.data?.assigneesByTask.get(taskId) ?? [];
      const toAdd = userIds.filter((id) => !current.includes(id));
      const toRemove = current.filter((id) => !userIds.includes(id));

      if (toRemove.length) {
        const { error } = await tasksDb
          .from("task_assignees")
          .delete()
          .eq("task_id", taskId)
          .in("user_id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length && user?.id) {
        const { error } = await tasksDb.from("task_assignees").insert(
          toAdd.map((userId) => ({
            task_id: taskId,
            user_id: userId,
            assigned_by: user.id,
          })),
        );
        if (error) throw error;
        // New assignees are told by the database (task.assigned); template
        // tasks are skipped there too.
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
  const setTaskValue = useMutation({
    mutationFn: async ({ taskId, fieldDefinitionId, value }: { taskId: string; fieldDefinitionId: string; value: Json }) => {
      const prev = query.data?.valuesByTask.get(taskId)?.get(fieldDefinitionId);
      const { error } = await tasksDb
        .from("task_values")
        .upsert({ task_id: taskId, field_definition_id: fieldDefinitionId, value }, { onConflict: "task_id,field_definition_id" });
      if (error) throw error;
      recordTaskValue(taskId, fieldDefinitionId, prev, value);
    },
    onSuccess: invalidate,
  });

  const attachField = useMutation({
    mutationFn: async (fieldDefinitionId: string) => {
      if (!boardId) throw new Error("no board id");
      const maxSort = (query.data?.customColumns ?? []).length;
      const { error } = await tasksDb.from("board_columns").insert({ board_id: boardId, field_definition_id: fieldDefinitionId, sort_order: maxSort });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const createAndAttachField = useMutation({
    mutationFn: async (input: { name: string; name_ar: string; type: FieldType; config: Json }) => {
      if (!boardId) throw new Error("no board id");
      const { data: field, error: fieldError } = await tasksDb.from("field_definitions").insert(input).select("id").single();
      if (fieldError) throw fieldError;
      const maxSort = (query.data?.customColumns ?? []).length;
      const { error } = await tasksDb.from("board_columns").insert({ board_id: boardId, field_definition_id: field.id, sort_order: maxSort });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const detachColumn = useMutation({
    mutationFn: async (boardColumnId: string) => {
      const { error } = await tasksDb.from("board_columns").delete().eq("id", boardColumnId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setColumnVisibility = useMutation({
    mutationFn: async ({ boardColumnId, visible }: { boardColumnId: string; visible: boolean }) => {
      const { error } = await tasksDb.from("board_columns").update({ is_visible: visible }).eq("id", boardColumnId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const renameField = useMutation({
    mutationFn: async ({ fieldDefinitionId, name_ar }: { fieldDefinitionId: string; name_ar: string }) => {
      const { error } = await tasksDb.from("field_definitions").update({ name_ar }).eq("id", fieldDefinitionId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  // Drag-and-drop reorder/reparent (native HTML5 DnD, no library).
  // Cycle guard walks up from
  // the drop target before writing anything.
  const moveTaskTo = useMutation({
    mutationFn: async ({
      id,
      newParentId,
      beforeId,
    }: {
      id: string;
      newParentId: string | null;
      beforeId: string | null;
    }) => {
      if (!query.data) throw new Error("board not loaded");
      const byId = new Map(query.data.tasks.map((t) => [t.id, t]));
      let cursor: string | null = newParentId;
      while (cursor) {
        if (cursor === id) return; // would create a cycle
        cursor = byId.get(cursor)?.parent_task_id ?? null;
      }
      const moved = byId.get(id);
      if (!moved) return;
      const siblings = query.data.tasks
        .filter((t) => t.parent_task_id === newParentId && t.id !== id)
        .sort((a, b) => a.sort_order - b.sort_order);
      const insertAt = beforeId ? siblings.findIndex((t) => t.id === beforeId) : -1;
      siblings.splice(insertAt === -1 ? siblings.length : insertAt, 0, moved);
      const undoItems: { taskId: string; prev: Partial<TaskRow>; next: Partial<TaskRow> }[] = [];
      for (let i = 0; i < siblings.length; i++) {
        const s = siblings[i];
        const patch: Partial<TaskRow> = { sort_order: i };
        if (s.id === id) patch.parent_task_id = newParentId;
        const { error } = await tasksDb.from("tasks").update(patch).eq("id", s.id);
        if (error) throw error;
        // `s` is the cached row, so it still holds the order / parent from before the move.
        const reparented = s.id === id && s.parent_task_id !== newParentId;
        if (s.sort_order !== i || reparented) {
          undoItems.push({
            taskId: s.id,
            prev: { sort_order: s.sort_order, ...(s.id === id ? { parent_task_id: s.parent_task_id } : {}) },
            next: patch,
          });
        }
      }
      recordTaskPatches("نقل مهمة", undoItems);
    },
    onSuccess: invalidate,
  });

  const assignablePeople = useAssignablePeople();

  const employeesById = useMemo(() => {
    return new Map(assignablePeople.map((e) => [e.id, e]));
  }, [assignablePeople]);

  // assignablePeople is fetched by its own shared, cross-screen query
  // (useAssignablePeople), not inside this board's queryFn — merge it in
  // here so `data.employees` keeps working for existing consumers
  // (TaskBoardPage, TaskTable, AssigneeCell, ...).
  const data = useMemo(() => {
    if (!query.data) return query.data;
    return { ...query.data, employees: assignablePeople };
  }, [query.data, assignablePeople]);

  return {
    data,
    loading: query.isPending,
    error: query.error,
    employeesById,
    updateStatus: updateStatus.mutate,
    updateTaskType: updateTaskType.mutate,
    updatePriority: updatePriority.mutate,
    updateTitle: updateTitle.mutate,
    updateDueDate: updateDueDate.mutate,
    updateStartDate: updateStartDate.mutate,
    updateTaskDates: updateTaskDates.mutate,
    updateDuration: updateDuration.mutate,
    updateLag: updateLag.mutate,
    setAssignees: setAssignees.mutate,
    bulkSetStatus: bulkSetStatus.mutateAsync,
    bulkSetPriority: bulkSetPriority.mutateAsync,
    bulkAssign: bulkAssign.mutateAsync,
    bulkDelete: bulkDelete.mutateAsync,
    setTaskValue: setTaskValue.mutate,
    attachField: attachField.mutateAsync,
    createAndAttachField: createAndAttachField.mutateAsync,
    detachColumn: detachColumn.mutateAsync,
    setColumnVisibility: setColumnVisibility.mutateAsync,
    renameField: renameField.mutateAsync,
    moveTaskTo: moveTaskTo.mutateAsync,
  };
}
