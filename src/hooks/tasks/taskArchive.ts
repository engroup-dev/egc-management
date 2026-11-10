import { supabase } from "../../lib/supabaseClient";
import { emitDoneNotice, recordAction } from "./taskUndo";

// Deleting a task archives it with its subtasks (tasks.set_tasks_archived,
// migration 2026-10-29_zones_schedule_a), so Ctrl+Z can bring it back with
// its links, comments and files. Every view reads only non-archived tasks;
// the scheduler counts a link through an archived task as a link from that
// task's own predecessors, so the chain keeps its shape meanwhile.

async function setArchived(taskIds: string[], archived: boolean): Promise<string[]> {
  if (taskIds.length === 0) return [];

  // Direct table update with recursive descendant subtasks
  const tasksDb = supabase.schema("tasks");
  let currentParentIds = [...taskIds];
  const allIds = new Set<string>(taskIds);

  while (currentParentIds.length > 0) {
    const { data: children, error: fetchErr } = await tasksDb
      .from("tasks")
      .select("id")
      .in("parent_task_id", currentParentIds);

    if (fetchErr || !children || children.length === 0) break;
    const nextParentIds: string[] = [];
    for (const child of children) {
      if (!allIds.has(child.id)) {
        allIds.add(child.id);
        nextParentIds.push(child.id);
      }
    }
    currentParentIds = nextParentIds;
  }

  const idsToUpdate = Array.from(allIds);
  const { error: updateErr } = await tasksDb
    .from("tasks")
    .update({ is_archived: archived })
    .in("id", idsToUpdate);

  if (updateErr) {
    console.error("Error archiving tasks:", updateErr);
    throw updateErr;
  }

  return idsToUpdate;
}

/** Archives the tasks (and their subtasks) as one undo entry. Returns every id archived. */
export async function archiveTasks(taskIds: string[], label: string): Promise<string[]> {
  if (taskIds.length === 0) return [];
  const ids = await setArchived(taskIds, true);
  recordAction(
    label,
    async () => {
      await setArchived(taskIds, false);
    },
    async () => {
      await setArchived(taskIds, true);
    },
  );
  emitDoneNotice(label);
  return ids;
}

/** A task just created, undone: archived (redo restores it). */
export function recordCreated(taskId: string, title: string): void {
  recordAction(
    `إضافة «${title}»`,
    async () => {
      await setArchived([taskId], true);
    },
    async () => {
      await setArchived([taskId], false);
    },
  );
}
