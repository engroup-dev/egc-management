import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import type { Json } from "../../lib/supabase";
import type { DependencyPair, TaskRow } from "./useTaskBoard";
import { emitTaskError } from "./taskErrorBus";
import { extractErrorMessage } from "./extractErrorMessage";
import { invalidateTaskAccess } from "./useTaskAccess";

// =====================================================================
// Undo / redo for task edits (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y)
// =====================================================================
// Module-level, like taskErrorBus.ts: the edits happen in three different
// hooks (useTaskBoard / useTaskDirectory / useTaskDetail) and the keyboard
// listener lives once in TasksLayout, so the stack can't belong to any one
// of them.
//
// Each hook records an edit AFTER its write succeeded, with the value it
// replaced. Undo/redo write straight to the tables — never through the hooks'
// mutations — so they don't record themselves, notify anyone, or re-run
// "notify dependents".
//
// Before touching a row, undo checks that it still holds what the original
// edit wrote. If someone else changed it since (or it was deleted), that task
// is skipped rather than overwritten.
//
// Covered: field edits on tasks, assignees, custom values, drag-reorder,
// dependency links, and the bulk versions of those; through recordAction,
// create and delete (both archive / restore), diagram moves, highlight
// colours, link types and task <-> checklist item. NOT covered: comments,
// checklist edits, relationships, column/field config.

const MAX_ENTRIES = 50;

const tasksDb = () => supabase.schema("tasks");

export type TaskPatch = Partial<TaskRow>;

interface ApplyResult {
  applied: number;
  skipped: number;
}

interface UndoEntry {
  label: string;
  undo: () => Promise<ApplyResult>;
  redo: () => Promise<ApplyResult>;
}

/** Everything the entry covers has changed since the edit. */
class StaleError extends Error {}

// ---------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------
const undoStack: UndoEntry[] = [];
const redoStack: UndoEntry[] = [];
let busy = false;

function pushUndo(entry: UndoEntry) {
  undoStack.push(entry);
  if (undoStack.length > MAX_ENTRIES) undoStack.shift();
  redoStack.length = 0;
}

// ---------------------------------------------------------------------
// Notices (read by <TaskUndoToast/>)
// ---------------------------------------------------------------------
export type UndoNotice =
  | { kind: "undo" | "redo"; label: string; skipped: number }
  | { kind: "stale"; label: string }
  | { kind: "empty"; direction: "undo" | "redo" }
  // A schedule edit moved other tasks along the chain (useTaskSchedule.ts).
  | { kind: "schedule"; moved: number; boardEnd: string | null; boards: number }
  // Days typed on a task with no start: it was linked after the task that
  // ends latest (tasks.update_task_schedule).
  | { kind: "linked"; title: string }
  // Something undoable just happened (a delete, a box turned into an item).
  | { kind: "done"; text: string };

type NoticeListener = (notice: UndoNotice) => void;
let noticeListener: NoticeListener | null = null;

export function setUndoNoticeListener(next: NoticeListener | null): void {
  noticeListener = next;
}

export function emitScheduleNotice(moved: number, boardEnd: string | null, boards = 1): void {
  if (moved > 0) noticeListener?.({ kind: "schedule", moved, boardEnd, boards });
}

export function emitDoneNotice(text: string): void {
  noticeListener?.({ kind: "done", text });
}

export function emitLinkedNotice(title: string): void {
  noticeListener?.({ kind: "linked", title });
}

// ---------------------------------------------------------------------
// Running an entry
// ---------------------------------------------------------------------
export async function runUndoRedo(queryClient: QueryClient, direction: "undo" | "redo"): Promise<void> {
  if (busy) return;
  const from = direction === "undo" ? undoStack : redoStack;
  const to = direction === "undo" ? redoStack : undoStack;
  const entry = from[from.length - 1];
  if (!entry) {
    noticeListener?.({ kind: "empty", direction });
    return;
  }

  busy = true;
  try {
    const result = await entry[direction]();
    from.pop();
    to.push(entry);
    noticeListener?.({ kind: direction, label: entry.label, skipped: result.skipped });
  } catch (error) {
    if (error instanceof StaleError) {
      // Nothing left to restore — drop it so the next press reaches the entry below.
      from.pop();
      noticeListener?.({ kind: "stale", label: entry.label });
    } else {
      // e.g. the database refused (unmet requirements): keep the entry, say why.
      emitTaskError(extractErrorMessage(error));
    }
  } finally {
    busy = false;
    for (const key of ["task-board", "task-directory", "task-detail", "tasks-sidebar", "template-sync",
                       "space-zones", "zone-chain-groups", "flow-state"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
    invalidateTaskAccess(queryClient);
  }
}

// ---------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------
// timestamptz comes back from Postgres in a different spelling than the one
// the UI wrote, so dates are compared as instants.
const DATE_KEYS = new Set(["start_date", "due_date"]);

function sameValue(key: string, a: unknown, b: unknown): boolean {
  if (DATE_KEYS.has(key) && typeof a === "string" && typeof b === "string") {
    return new Date(a).getTime() === new Date(b).getTime();
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// ---------------------------------------------------------------------
// Task column patches (status, priority, dates, type, title, order, ...)
// ---------------------------------------------------------------------
interface PatchStep {
  taskId: string;
  /** What the row must still hold for this step to apply. */
  expect: TaskPatch;
  apply: TaskPatch;
}

async function applyPatchSteps(steps: PatchStep[]): Promise<ApplyResult> {
  if (steps.length === 0) return { applied: 0, skipped: 0 };

  const { data: rows, error } = await tasksDb()
    .from("tasks")
    .select("*")
    .in("id", Array.from(new Set(steps.map((s) => s.taskId))));
  if (error) throw error;
  const rowById = new Map((rows ?? []).map((r) => [r.id, r]));

  const live = steps.filter((step) => {
    const row = rowById.get(step.taskId);
    if (!row) return false;
    return Object.entries(step.expect).every(([key, value]) =>
      sameValue(key, (row as Record<string, unknown>)[key], value),
    );
  });
  if (live.length === 0) throw new StaleError();

  // One update per distinct patch (a bulk edit is usually a single patch).
  const groups = new Map<string, { apply: TaskPatch; ids: string[] }>();
  for (const step of live) {
    const key = JSON.stringify(step.apply);
    const group = groups.get(key) ?? { apply: step.apply, ids: [] };
    group.ids.push(step.taskId);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const { error: updateError } = await tasksDb().from("tasks").update(group.apply).in("id", group.ids);
    if (updateError) throw updateError;
  }
  return { applied: live.length, skipped: steps.length - live.length };
}

/** Record a change to columns of one or more tasks. `prev` is what the row held before, `next` what was written. */
export function recordTaskPatches(label: string, items: { taskId: string; prev: TaskPatch; next: TaskPatch }[]) {
  const changed = items.filter((i) => Object.keys(i.next).length > 0);
  if (changed.length === 0) return;
  pushUndo({
    label,
    undo: () => applyPatchSteps(changed.map((i) => ({ taskId: i.taskId, expect: i.next, apply: i.prev }))),
    redo: () => applyPatchSteps(changed.map((i) => ({ taskId: i.taskId, expect: i.prev, apply: i.next }))),
  });
}

export function recordTaskPatch(label: string, taskId: string, prev: TaskPatch, next: TaskPatch) {
  recordTaskPatches(label, [{ taskId, prev, next }]);
}

// ---------------------------------------------------------------------
// Assignees
// ---------------------------------------------------------------------
interface AssigneeStep {
  taskId: string;
  expect: string[];
  apply: string[];
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

async function applyAssigneeSteps(steps: AssigneeStep[], actorId: string): Promise<ApplyResult> {
  if (steps.length === 0) return { applied: 0, skipped: 0 };

  const { data: rows, error } = await tasksDb()
    .from("task_assignees")
    .select("task_id, user_id")
    .in("task_id", steps.map((s) => s.taskId));
  if (error) throw error;
  const currentByTask = new Map<string, string[]>();
  for (const r of rows ?? []) currentByTask.set(r.task_id, [...(currentByTask.get(r.task_id) ?? []), r.user_id]);

  // A deleted task has no assignees and no row to re-add them to — its
  // expected set would only match if it was empty, which changes nothing.
  const live = steps.filter((s) => sameSet(currentByTask.get(s.taskId) ?? [], s.expect));
  if (live.length === 0) throw new StaleError();

  for (const step of live) {
    const current = currentByTask.get(step.taskId) ?? [];
    const toRemove = current.filter((id) => !step.apply.includes(id));
    const toAdd = step.apply.filter((id) => !current.includes(id));
    if (toRemove.length) {
      const { error: delError } = await tasksDb()
        .from("task_assignees")
        .delete()
        .eq("task_id", step.taskId)
        .in("user_id", toRemove);
      if (delError) throw delError;
    }
    if (toAdd.length) {
      const { error: insError } = await tasksDb()
        .from("task_assignees")
        .insert(toAdd.map((userId) => ({ task_id: step.taskId, user_id: userId, assigned_by: actorId })));
      if (insError) throw insError;
    }
  }
  return { applied: live.length, skipped: steps.length - live.length };
}

/** `before` / `after` are the task's full assignee id lists. Tasks whose list didn't change are ignored. */
export function recordAssignees(
  label: string,
  actorId: string | null | undefined,
  items: { taskId: string; before: string[]; after: string[] }[],
) {
  if (!actorId) return;
  const changed = items.filter((i) => !sameSet(i.before, i.after));
  if (changed.length === 0) return;
  pushUndo({
    label,
    undo: () => applyAssigneeSteps(changed.map((i) => ({ taskId: i.taskId, expect: i.after, apply: i.before })), actorId),
    redo: () => applyAssigneeSteps(changed.map((i) => ({ taskId: i.taskId, expect: i.before, apply: i.after })), actorId),
  });
}

// ---------------------------------------------------------------------
// Custom field values
// ---------------------------------------------------------------------
async function applyValueStep(taskId: string, fieldDefinitionId: string, expect: Json | undefined, apply: Json | undefined): Promise<ApplyResult> {
  const { data: row, error } = await tasksDb()
    .from("task_values")
    .select("value")
    .eq("task_id", taskId)
    .eq("field_definition_id", fieldDefinitionId)
    .maybeSingle();
  if (error) throw error;
  if (!sameValue("value", row?.value, expect)) throw new StaleError();

  if (apply === undefined) {
    const { error: delError } = await tasksDb()
      .from("task_values")
      .delete()
      .eq("task_id", taskId)
      .eq("field_definition_id", fieldDefinitionId);
    if (delError) throw delError;
  } else {
    const { error: upError } = await tasksDb()
      .from("task_values")
      .upsert({ task_id: taskId, field_definition_id: fieldDefinitionId, value: apply }, { onConflict: "task_id,field_definition_id" });
    if (upError) throw upError;
  }
  return { applied: 1, skipped: 0 };
}

/** `prev` is undefined when the task had no value for this field yet. */
export function recordTaskValue(taskId: string, fieldDefinitionId: string, prev: Json | undefined, next: Json) {
  if (sameValue("value", prev, next)) return;
  pushUndo({
    label: "تعديل حقل مخصص",
    undo: () => applyValueStep(taskId, fieldDefinitionId, next, prev),
    redo: () => applyValueStep(taskId, fieldDefinitionId, prev, next),
  });
}

// ---------------------------------------------------------------------
// Dependency links
// ---------------------------------------------------------------------
const pairKey = (p: DependencyPair) => `${p.blocking_task_id}>${p.blocked_task_id}`;

/** Make each link exist (`present`) or not. A link already that way is skipped. */
async function applyDependencySteps(pairs: DependencyPair[], present: boolean, actorId: string | null): Promise<ApplyResult> {
  const { data: rows, error } = await tasksDb()
    .from("task_dependencies")
    .select("blocking_task_id, blocked_task_id")
    .in("blocked_task_id", Array.from(new Set(pairs.map((p) => p.blocked_task_id))));
  if (error) throw error;
  const existing = new Set((rows ?? []).map(pairKey));

  const live = pairs.filter((p) => existing.has(pairKey(p)) !== present);
  if (live.length === 0) throw new StaleError();

  if (present) {
    const { error: insError } = await tasksDb()
      .from("task_dependencies")
      .insert(live.map((p) => ({ ...p, created_by: actorId })));
    if (insError) throw insError;
  } else {
    for (const p of live) {
      const { error: delError } = await tasksDb()
        .from("task_dependencies")
        .delete()
        .eq("blocking_task_id", p.blocking_task_id)
        .eq("blocked_task_id", p.blocked_task_id);
      if (delError) throw delError;
    }
  }
  return { applied: live.length, skipped: pairs.length - live.length };
}

/** A link that was turned around: one entry, so one Ctrl+Z puts it back.
 * Each direction removes before it adds — both at once would be a loop. */
export function recordDependencySwap(label: string, actorId: string | null, removed: DependencyPair, added: DependencyPair) {
  const swap = async (from: DependencyPair, to: DependencyPair): Promise<ApplyResult> => {
    const out = await applyDependencySteps([from], false, actorId);
    const back = await applyDependencySteps([to], true, actorId);
    return { applied: out.applied + back.applied, skipped: out.skipped + back.skipped };
  };
  pushUndo({
    label,
    undo: () => swap(added, removed),
    redo: () => swap(removed, added),
  });
}

/** Any other change: `undo` / `redo` put it back and forth, and throw when
 * they can't (the error is shown, the entry stays). */
export function recordAction(label: string, undo: () => Promise<void>, redo: () => Promise<void>) {
  pushUndo({
    label,
    undo: async () => {
      await undo();
      return { applied: 1, skipped: 0 };
    },
    redo: async () => {
      await redo();
      return { applied: 1, skipped: 0 };
    },
  });
}

/** Links that were just added or removed (both are one entry, however many). */
export function recordDependencies(
  label: string,
  actorId: string | null,
  pairs: DependencyPair[],
  change: "added" | "removed",
) {
  if (pairs.length === 0) return;
  const added = change === "added";
  pushUndo({
    label,
    undo: () => applyDependencySteps(pairs, !added, actorId),
    redo: () => applyDependencySteps(pairs, added, actorId),
  });
}
