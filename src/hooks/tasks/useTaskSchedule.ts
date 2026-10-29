import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import type { Json } from "../../lib/supabase";
import type { TaskRow } from "./useTaskBoard";
import { emitLinkedNotice, emitScheduleNotice, recordTaskPatch, type TaskPatch } from "./taskUndo";
import { recordCreated } from "./taskArchive";

// =====================================================================
// Task scheduling (tasks/migrations/2026-10-13_task_scheduling_a.sql)
// =====================================================================
// A task has a start date and a number of working days; its due date, the
// dates of every linked task after it and of every summary (a parent with
// subtasks) are computed by the database. So every schedule edit goes
// through one of two RPCs and the client never writes dates itself:
//
//   create_scheduled_task  — the create dialog (placement after / with / none)
//   update_task_schedule   — start, days, due, or wait gap of one task
//
// Both return the task as saved plus every task that moved because of it;
// with p_dry_run they return the same without saving (the dialog preview).
//
// Undo records the INPUT that changed (days, or the start of an unlinked
// task, or the wait gap of a linked one), never the cascaded dates: the
// scheduler is deterministic, so writing the input back restores the chain.

const tasksDb = () => supabase.schema("tasks");

export interface ScheduledTask {
  id: string;
  title: string;
  parent_task_id: string | null;
  start_date: string | null;
  due_date: string | null;
  duration_days: number | null;
  start_lag_days: number;
  earliest_start: string | null;
  is_summary: boolean;
}

export interface ScheduleMove {
  id: string;
  title: string;
  parent_task_id: string | null;
  old_start: string | null;
  old_due: string | null;
  new_start: string;
  new_due: string;
  shift_days: number;
  /** The board / zone it is on: a change can move tasks in every zone of the space. */
  board_id?: string;
  board_name?: string;
  zone_name?: string | null;
}

export interface ScheduleResult {
  task: ScheduledTask;
  moved: ScheduleMove[];
  board_end_before: string | null;
  board_end_after: string | null;
  /** Days typed on a task with no start: the task it was linked after (the one that ends latest). */
  linked_after?: { id: string; title: string } | null;
}

export type Placement = "none" | "after" | "with" | "append";

export interface CreateScheduledTaskInput {
  boardId: string;
  title: string;
  durationDays: number;
  parentTaskId?: string | null;
  placement: Placement;
  anchorTaskId?: string | null;
  /** Only for placement "none". "YYYY-MM-DD". */
  startDate?: string | null;
  /** Placement "after": the anchor's followers now follow the new task. */
  pushSuccessors?: boolean;
}

/** One schedule change; pass only what changed (days wins over due). */
export interface ScheduleChange {
  startDate?: string;
  durationDays?: number;
  dueDate?: string;
  lagDays?: number;
}

/** The task row fields a schedule edit needs to know about. */
export type ScheduleTaskRef = Pick<TaskRow, "id" | "start_date" | "duration_days" | "start_lag_days" | "earliest_start">;

function asResult(data: Json): ScheduleResult {
  return data as unknown as ScheduleResult;
}

async function callCreate(input: CreateScheduledTaskInput, dryRun: boolean): Promise<ScheduleResult> {
  const { data, error } = await tasksDb().rpc("create_scheduled_task", {
    p_board_id: input.boardId,
    p_title: input.title,
    p_duration_days: input.durationDays,
    p_mode: input.placement,
    ...(input.parentTaskId ? { p_parent_task_id: input.parentTaskId } : {}),
    ...(input.anchorTaskId ? { p_anchor_task_id: input.anchorTaskId } : {}),
    ...(input.startDate ? { p_start_date: input.startDate } : {}),
    p_push_successors: input.pushSuccessors ?? true,
    p_dry_run: dryRun,
  });
  if (error) throw error;
  return asResult(data);
}

async function callUpdate(taskId: string, change: ScheduleChange, dryRun = false): Promise<ScheduleResult> {
  const { data, error } = await tasksDb().rpc("update_task_schedule", {
    p_task_id: taskId,
    ...(change.startDate !== undefined ? { p_start_date: change.startDate } : {}),
    ...(change.durationDays !== undefined ? { p_duration_days: change.durationDays } : {}),
    ...(change.dueDate !== undefined ? { p_due_date: change.dueDate } : {}),
    ...(change.lagDays !== undefined ? { p_lag_days: change.lagDays } : {}),
    p_dry_run: dryRun,
  });
  if (error) throw error;
  return asResult(data);
}

function recordScheduleUndo(prev: ScheduleTaskRef, change: ScheduleChange, saved: ScheduledTask) {
  // A task that had no dates can't go back to none (scheduled dates can't be cleared).
  if (!prev.start_date) return;
  const before: TaskPatch = {};
  const after: TaskPatch = {};
  if (change.startDate !== undefined || change.lagDays !== undefined) {
    if (saved.earliest_start) {
      before.start_lag_days = prev.start_lag_days;
      after.start_lag_days = saved.start_lag_days;
    } else if (change.startDate !== undefined) {
      before.start_date = prev.start_date;
      after.start_date = saved.start_date;
    }
  }
  if (change.durationDays !== undefined || change.dueDate !== undefined) {
    before.duration_days = prev.duration_days;
    after.duration_days = saved.duration_days;
  }
  for (const key of Object.keys(after) as (keyof TaskPatch)[]) {
    const a = before[key];
    const b = after[key];
    const same =
      key === "start_date" && typeof a === "string" && typeof b === "string"
        ? new Date(a).getTime() === new Date(b).getTime()
        : a === b;
    if (same) {
      delete before[key];
      delete after[key];
    }
  }
  if (Object.keys(after).length > 0) recordTaskPatch("تغيير الجدولة", prev.id, before, after);
}

/** Every cached view a schedule change can touch: dates move across the board. */
// Every board, not only the edited one: the zones of a space are scheduled
// together, so a change on one board can move tasks on the others.
export function invalidateSchedule(queryClient: QueryClient, boardId?: string | null) {
  queryClient.invalidateQueries({ queryKey: ["task-board"] });
  queryClient.invalidateQueries({ queryKey: ["board-schedule"] });
  queryClient.invalidateQueries({ queryKey: ["task-detail"] });
  queryClient.invalidateQueries({ queryKey: ["task-directory"] });
  queryClient.invalidateQueries({ queryKey: ["space-zones"] });
  queryClient.invalidateQueries({ queryKey: ["zone-chain-groups"] });
  if (boardId) queryClient.invalidateQueries({ queryKey: ["template-sync", boardId] });
}

/** How many boards (zones) a change moved tasks on. */
export function movedBoardCount(moved: ScheduleMove[]): number {
  return new Set(moved.map((m) => m.board_id).filter(Boolean)).size;
}

/**
 * Saves one schedule change through the RPC, records undo, and announces how
 * many other tasks moved. For use inside a hook's own mutation (the board,
 * directory and detail hooks each keep their own cache handling).
 */
export async function saveTaskSchedule(prev: ScheduleTaskRef, change: ScheduleChange): Promise<ScheduleResult> {
  const result = await callUpdate(prev.id, change);
  recordScheduleUndo(prev, change, result.task);
  if (result.linked_after) emitLinkedNotice(result.linked_after.title);
  else emitScheduleNotice(result.moved.length, result.board_end_after, movedBoardCount(result.moved));
  return result;
}

export function useUpdateTaskSchedule(boardId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, change }: { task: ScheduleTaskRef; change: ScheduleChange }) => saveTaskSchedule(task, change),
    onSettled: () => invalidateSchedule(queryClient, boardId),
  });
}

export function useCreateScheduledTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateScheduledTaskInput) => {
      const result = await callCreate(input, false);
      // Ctrl+Z archives it again (taskArchive.ts)
      recordCreated(result.task.id, result.task.title);
      return result;
    },
    onSuccess: (result) => emitScheduleNotice(result.moved.length, result.board_end_after, movedBoardCount(result.moved)),
    onSettled: (_data, _error, input) => {
      invalidateSchedule(queryClient, input.boardId);
      if (input.parentTaskId) queryClient.invalidateQueries({ queryKey: ["task-detail", input.parentTaskId] });
    },
  });
}

/** `value`, once it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * The server's dry run of a create, refreshed as the dialog's fields settle:
 * exact start / end, the tasks that would move, the board's new end. null
 * input = nothing to preview yet.
 */
export function useCreateTaskPreview(input: CreateScheduledTaskInput | null) {
  // Compared by content: the dialog builds a fresh input object every render.
  const key = input ? JSON.stringify(input) : null;
  const debouncedKey = useDebounced(key, 350);
  const query = useQuery({
    queryKey: ["schedule-preview", debouncedKey],
    enabled: !!debouncedKey,
    queryFn: () => callCreate(JSON.parse(debouncedKey as string) as CreateScheduledTaskInput, true),
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
  });
  const settled = !!key && debouncedKey === key;
  return {
    preview: settled ? query.data ?? null : null,
    previewError: settled ? (query.error as Error | null) : null,
    previewLoading: !!key && (!settled || query.isFetching),
  };
}

// ---------------------------------------------------------------------
// The board's tasks, light — for the create dialog's "after which task"
// picker. Its own query, so the dialog also works from screens that never
// load the full board (the space page, the detail panel).
// ---------------------------------------------------------------------
export interface BoardScheduleTask {
  id: string;
  title: string;
  parent_task_id: string | null;
  sort_order: number;
  start_date: string | null;
  due_date: string | null;
  duration_days: number | null;
  is_summary: boolean;
  /** Same-board tasks that follow this one. */
  successorCount: number;
}

export interface BoardSchedule {
  tasks: BoardScheduleTask[];
  /** A template board: days are "Day N" and every day counts (no Friday). */
  isTemplate: boolean;
}

export function useBoardScheduleTasks(boardId: string | null | undefined) {
  return useQuery({
    queryKey: ["board-schedule", boardId],
    enabled: !!boardId,
    queryFn: async (): Promise<BoardSchedule> => {
      const { data: board, error: boardError } = await tasksDb()
        .from("boards")
        .select("is_template")
        .eq("id", boardId as string)
        .single();
      if (boardError) throw boardError;
      const { data: tasks, error } = await tasksDb()
        .from("tasks")
        .select("id, title, parent_task_id, sort_order, start_date, due_date, duration_days, is_summary")
        .eq("board_id", boardId as string)
        .eq("is_archived", false)
        .order("sort_order");
      if (error) throw error;
      const ids = (tasks ?? []).map((t) => t.id);
      const { data: deps, error: depsError } = ids.length
        ? await tasksDb().from("task_dependencies").select("blocking_task_id, blocked_task_id").in("blocking_task_id", ids)
        : { data: [], error: null };
      if (depsError) throw depsError;
      const onBoard = new Set(ids);
      const followers = new Map<string, number>();
      for (const d of deps ?? []) {
        if (!onBoard.has(d.blocked_task_id)) continue;
        followers.set(d.blocking_task_id, (followers.get(d.blocking_task_id) ?? 0) + 1);
      }
      return {
        tasks: (tasks ?? []).map((t) => ({ ...t, successorCount: followers.get(t.id) ?? 0 })),
        isTemplate: board.is_template,
      };
    },
  });
}
