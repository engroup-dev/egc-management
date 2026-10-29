import { supabase } from "../../lib/supabaseClient";

// Template apply / push / add-to-template (useTemplatePicker D4,
// useTemplateSync) — all end up in tasks.copy_task_tree() (build plan §5.1,
// "one copy function"), and so do zone copies (tasks.copy_tasks_to_boards,
// useZones.ts, which retries the same way).
//
// copy_task_tree() does its work in two passes through a session-scoped
// temporary table (_copy_map): pass 1 assigns every new row's id, pass 2
// inserts rows and looks up each one's *new* parent id from that table.
// Under Supabase's pooled connections this has been observed to
// intermittently fail — "violates foreign key constraint
// tasks_parent_task_id_fkey" — on a call with perfectly valid inputs,
// then succeed identically on an immediate retry with no state changed.
// That signature (same inputs, non-deterministic result) points at a
// connection-reuse artifact around the temp table rather than a real bad
// input, which would fail the same way every time. One silent retry
// absorbs it; a genuinely bad input still fails on the retry too and
// surfaces normally.

// Applies a whole template board (boards.is_template) onto a board in one
// RPC: tasks.apply_template_board() calls copy_task_tree() once per root
// and then recreates dependencies, relationships, tags, record links,
// attachments, recurrence rules and board columns between the copies,
// and turns the template's project roles into the target project's people
// (tasks._assign_roles). Returns the new task ids.
// Same temp-table mechanism underneath, so the same one silent retry.
export async function callApplyTemplateBoard(args: {
  templateBoardId: string;
  targetBoardId: string;
  anchorDate: string;
  createdBy: string;
  excludedIds: string[];
  /** Picks for project roles nobody holds on the target: {roleId: [userIds]}. */
  roleOverrides: Record<string, string[]>;
}): Promise<string[]> {
  const tasksDb = supabase.schema("tasks");
  const run = () =>
    tasksDb.rpc("apply_template_board", {
      p_template_board_id: args.templateBoardId,
      p_target_board_id: args.targetBoardId,
      p_anchor_date: args.anchorDate,
      p_created_by: args.createdBy,
      p_excluded_ids: args.excludedIds,
      p_role_overrides: args.roleOverrides,
    });

  let { data, error } = await run();
  if (error) {
    ({ data, error } = await run());
  }
  if (error) throw error;
  return (data ?? []).map((r) => r.new_task_id);
}

// Copies chosen template tasks (with their subtrees) onto each target
// board that doesn't have them yet — tasks.push_template_tasks(). Each
// copy lands under the target's copy of its template parent when there is
// one, dated from the Day 0 the board was built with (or defaultAnchor
// when that can't be worked out). Returns the new task ids.
export async function callPushTemplateTasks(args: {
  templateBoardId: string;
  taskIds: string[];
  targetBoardIds: string[];
  defaultAnchor: string;
  createdBy: string;
  /** {boardId: {roleId: [userIds]}} — picks for roles nobody holds. */
  roleOverrides: Record<string, Record<string, string[]>>;
}): Promise<string[]> {
  const tasksDb = supabase.schema("tasks");
  const run = () =>
    tasksDb.rpc("push_template_tasks", {
      p_template_board_id: args.templateBoardId,
      p_task_ids: args.taskIds,
      p_target_board_ids: args.targetBoardIds,
      p_default_anchor: args.defaultAnchor,
      p_created_by: args.createdBy,
      p_role_overrides: args.roleOverrides,
    });

  let { data, error } = await run();
  if (error) {
    ({ data, error } = await run());
  }
  if (error) throw error;
  return (data ?? []).map((r) => r.new_task_id);
}

// Copies tasks added by hand on a real board into its template —
// tasks.add_tasks_to_template() — and links the originals back to the new
// template tasks. Returns the new template task ids.
export async function callAddTasksToTemplate(args: {
  taskIds: string[];
  templateBoardId: string;
  createdBy: string;
}): Promise<string[]> {
  const tasksDb = supabase.schema("tasks");
  const run = () =>
    tasksDb.rpc("add_tasks_to_template", {
      p_task_ids: args.taskIds,
      p_template_board_id: args.templateBoardId,
      p_created_by: args.createdBy,
    });

  let { data, error } = await run();
  if (error) {
    ({ data, error } = await run());
  }
  if (error) throw error;
  return (data ?? []).map((r) => r.template_task_id);
}
