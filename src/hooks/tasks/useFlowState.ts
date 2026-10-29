import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import type { Json } from "../../lib/supabase";
import { emitDoneNotice, recordAction } from "./taskUndo";
import { invalidateSchedule } from "./useTaskSchedule";

// The free network diagram's shared state (migration 2026-10-29_flow_diagram_b):
// the board's layout mode ('tidy' = automatic, 'free' = saved positions), the
// "keep after blockers" switch, every box's saved position, the tasks'
// highlight colours, and the checklist items a box can show. Everyone on the
// board sees the same picture; moves, colours and box <-> item go on the
// undo stack. Highlights are read here for the board's other views too.

export type HighlightColor = "g" | "r" | "b" | "y";
export type FlowMode = "tidy" | "free";

export interface FlowPosition {
  task_id: string;
  x: number;
  y: number;
}

export interface FlowChecklistItem {
  id: string;
  checklist_id: string;
  task_id: string;
  content: string;
  is_checked: boolean;
  sort_order: number;
  source_task_id: string | null;
}

export interface FlowState {
  mode: FlowMode;
  keepAfterBlockers: boolean;
  positions: Map<string, { x: number; y: number }>;
  highlights: Map<string, HighlightColor>;
  itemsByTask: Map<string, FlowChecklistItem[]>;
}

const EMPTY: FlowState = {
  mode: "tidy",
  keepAfterBlockers: false,
  positions: new Map(),
  highlights: new Map(),
  itemsByTask: new Map(),
};

const tasksDb = () => supabase.schema("tasks");

async function rpcSavePositions(boardId: string, positions: FlowPosition[], replace: boolean) {
  const { error } = await tasksDb().rpc("save_flow_positions", {
    p_board_id: boardId,
    p_positions: positions as unknown as Json,
    p_replace: replace,
  });
  if (error) throw error;
}

async function rpcSetMode(boardId: string, mode: FlowMode) {
  const { error } = await tasksDb().rpc("set_flow_layout", { p_board_id: boardId, p_mode: mode });
  if (error) throw error;
}

async function rpcSetHighlight(taskIds: string[], color: HighlightColor | null) {
  if (taskIds.length === 0) return;
  const { error } = await tasksDb().rpc("set_task_highlight", { p_task_ids: taskIds, p_color: color });
  if (error) throw error;
}

/** Puts back each task's colour from a before-snapshot (missing = none). */
async function restoreHighlights(taskIds: string[], before: Map<string, HighlightColor>) {
  const byColor = new Map<HighlightColor | null, string[]>();
  for (const id of taskIds) {
    const c = before.get(id) ?? null;
    byColor.set(c, [...(byColor.get(c) ?? []), id]);
  }
  for (const [color, ids] of byColor) await rpcSetHighlight(ids, color);
}

async function rpcTaskToItem(taskId: string, targetId: string): Promise<string> {
  const { data, error } = await tasksDb().rpc("task_to_checklist_item", { p_task_id: taskId, p_target_task_id: targetId });
  if (error) throw error;
  return (data as unknown as { item_id: string }).item_id;
}

async function rpcItemToTask(itemId: string): Promise<string> {
  const { data, error } = await tasksDb().rpc("checklist_item_to_task", { p_item_id: itemId });
  if (error) throw error;
  return (data as unknown as { task_id: string }).task_id;
}

export function useFlowState(boardId: string | undefined, taskIds: string[]) {
  const queryClient = useQueryClient();
  const queryKey = ["flow-state", boardId];

  const query = useQuery({
    queryKey,
    enabled: !!boardId,
    queryFn: async (): Promise<FlowState> => {
      const db = tasksDb();
      const [layoutRes, posRes, hiRes, listRes] = await Promise.all([
        db.from("flow_layouts").select("mode, keep_after_blockers").eq("board_id", boardId as string).maybeSingle(),
        db.from("flow_positions").select("task_id, x, y").eq("board_id", boardId as string),
        taskIds.length
          ? db.from("task_highlights").select("task_id, color").in("task_id", taskIds)
          : Promise.resolve({ data: [], error: null }),
        taskIds.length
          ? db.from("checklists").select("id, task_id").in("task_id", taskIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      for (const r of [layoutRes, posRes, hiRes, listRes]) if (r.error) throw r.error;

      const lists = (listRes.data ?? []) as { id: string; task_id: string }[];
      const taskOfList = new Map(lists.map((l) => [l.id, l.task_id]));
      const itemsByTask = new Map<string, FlowChecklistItem[]>();
      if (lists.length) {
        const { data: items, error } = await db
          .from("checklist_items")
          .select("id, checklist_id, content, is_checked, sort_order, source_task_id")
          .in("checklist_id", lists.map((l) => l.id))
          .order("sort_order");
        if (error) throw error;
        for (const it of items ?? []) {
          const taskId = taskOfList.get(it.checklist_id) as string;
          itemsByTask.set(taskId, [...(itemsByTask.get(taskId) ?? []), { ...it, task_id: taskId }]);
        }
      }

      return {
        mode: (layoutRes.data?.mode as FlowMode | undefined) ?? "tidy",
        keepAfterBlockers: !!layoutRes.data?.keep_after_blockers,
        positions: new Map((posRes.data ?? []).map((p) => [p.task_id, { x: p.x, y: p.y }])),
        highlights: new Map(((hiRes.data ?? []) as { task_id: string; color: string }[]).map((h) => [h.task_id, h.color as HighlightColor])),
        itemsByTask,
      };
    },
  });
  const state = query.data ?? EMPTY;
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const patchCache = (fn: (s: FlowState) => FlowState) =>
    queryClient.setQueryData<FlowState>(queryKey, (prev) => fn(prev ?? EMPTY));

  /**
   * Boxes moved by hand. `seed` = the board was tidy: every box's current
   * place is saved too and the board turns free.
   */
  const savePositions = useMutation({
    mutationFn: async ({ moved, seed }: { moved: FlowPosition[]; seed?: FlowPosition[] }) => {
      if (!boardId) return;
      const prevMode = state.mode;
      const prev = moved.map((m) => {
        const p = state.positions.get(m.task_id);
        return p ? { task_id: m.task_id, ...p } : null;
      });
      const all = seed ? mergePositions(seed, moved) : moved;
      patchCache((s) => ({
        ...s,
        mode: "free",
        positions: new Map([...(seed ? [] : s.positions), ...all.map((p) => [p.task_id, { x: p.x, y: p.y }] as const)]),
      }));
      await rpcSavePositions(boardId, all, !!seed);
      recordAction(
        moved.length > 1 ? `تحريك ${moved.length} مهام في المخطط` : "تحريك مهمة في المخطط",
        async () => {
          if (prevMode === "tidy") await rpcSetMode(boardId, "tidy");
          else await rpcSavePositions(boardId, prev.filter(Boolean) as FlowPosition[], false);
        },
        async () => rpcSavePositions(boardId, all, !!seed),
      );
    },
    onError: refresh,
  });

  const setMode = useMutation({
    mutationFn: async ({ mode, seed }: { mode: FlowMode; seed?: FlowPosition[] }) => {
      if (!boardId) return;
      const prevMode = state.mode;
      patchCache((s) => ({ ...s, mode }));
      if (mode === "free" && seed && state.positions.size === 0) await rpcSavePositions(boardId, seed, true);
      else await rpcSetMode(boardId, mode);
      recordAction(
        mode === "tidy" ? "ترتيب تلقائي للمخطط" : "مخطط حر",
        async () => rpcSetMode(boardId, prevMode),
        async () => rpcSetMode(boardId, mode),
      );
    },
    onSettled: refresh,
  });

  const setKeepAfterBlockers = useMutation({
    mutationFn: async (on: boolean) => {
      if (!boardId) return;
      patchCache((s) => ({ ...s, keepAfterBlockers: on }));
      const { error } = await tasksDb().rpc("set_flow_layout", { p_board_id: boardId, p_keep_after_blockers: on });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const setHighlight = useMutation({
    mutationFn: async ({ taskIds: ids, color }: { taskIds: string[]; color: HighlightColor | null }) => {
      const before = new Map(state.highlights);
      patchCache((s) => {
        const highlights = new Map(s.highlights);
        for (const id of ids) {
          if (color) highlights.set(id, color);
          else highlights.delete(id);
        }
        return { ...s, highlights };
      });
      await rpcSetHighlight(ids, color);
      recordAction(color ? "تلوين" : "إزالة اللون", () => restoreHighlights(ids, before), () => rpcSetHighlight(ids, color));
    },
    onSettled: refresh,
  });

  const clearHighlights = useMutation({
    mutationFn: async () => {
      if (!boardId) return;
      const before = new Map(state.highlights);
      const ids = Array.from(before.keys());
      patchCache((s) => ({ ...s, highlights: new Map() }));
      const { error } = await tasksDb().rpc("clear_board_highlights", { p_board_id: boardId });
      if (error) throw error;
      recordAction("إزالة كل الألوان", () => restoreHighlights(ids, before), () => rpcSetHighlight(ids, null));
    },
    onSettled: refresh,
  });

  // A box dropped on another becomes one of its checklist items (the task is
  // archived and remembered); ↗ turns an item back into a task.
  const taskToItem = useMutation({
    mutationFn: async ({ taskId, targetId, title }: { taskId: string; targetId: string; title: string }) => {
      let itemId = await rpcTaskToItem(taskId, targetId);
      recordAction(
        `تحويل «${title}» إلى بند`,
        async () => {
          await rpcItemToTask(itemId);
        },
        async () => {
          itemId = await rpcTaskToItem(taskId, targetId);
        },
      );
      emitDoneNotice(`أصبحت «${title}» بنداً في قائمة تحقق`);
    },
    onSettled: () => {
      refresh();
      invalidateSchedule(queryClient, boardId);
    },
  });

  const itemToTask = useMutation({
    mutationFn: async ({ item }: { item: FlowChecklistItem }) => {
      let taskId = await rpcItemToTask(item.id);
      let itemId = item.id;
      recordAction(
        `تحويل «${item.content}» إلى مهمة`,
        async () => {
          itemId = await rpcTaskToItem(taskId, item.task_id);
        },
        async () => {
          taskId = await rpcItemToTask(itemId);
        },
      );
    },
    onSettled: () => {
      refresh();
      invalidateSchedule(queryClient, boardId);
    },
  });

  const toggleItem = useMutation({
    mutationFn: async ({ itemId, checked }: { itemId: string; checked: boolean }) => {
      patchCache((s) => {
        const itemsByTask = new Map(s.itemsByTask);
        for (const [taskId, items] of itemsByTask)
          if (items.some((i) => i.id === itemId))
            itemsByTask.set(taskId, items.map((i) => (i.id === itemId ? { ...i, is_checked: checked } : i)));
        return { ...s, itemsByTask };
      });
      const { error } = await tasksDb().from("checklist_items").update({ is_checked: checked }).eq("id", itemId);
      if (error) throw error;
    },
    onSettled: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ["task-detail"] });
    },
  });

  return {
    state,
    loading: query.isPending,
    savePositions: savePositions.mutate,
    setMode: setMode.mutate,
    setKeepAfterBlockers: setKeepAfterBlockers.mutate,
    setHighlight: setHighlight.mutate,
    clearHighlights: clearHighlights.mutate,
    taskToItem: taskToItem.mutate,
    itemToTask: itemToTask.mutate,
    toggleItem: toggleItem.mutate,
  };
}

function mergePositions(base: FlowPosition[], over: FlowPosition[]): FlowPosition[] {
  const map = new Map(base.map((p) => [p.task_id, p]));
  for (const p of over) map.set(p.task_id, p);
  return Array.from(map.values());
}

/** The light fills a highlighted box / bar / card gets. */
export const HIGHLIGHT_FILL: Record<HighlightColor, string> = {
  g: "#DCF2DA",
  r: "#FBDAD6",
  b: "#D9E7FA",
  y: "#FCF1BE",
};
/** The palette's swatches (stronger, like Construction Flow's). */
export const HIGHLIGHT_SWATCH: Record<HighlightColor, { color: string; label: string }> = {
  g: { color: "#5cb85c", label: "أخضر" },
  r: { color: "#e5534b", label: "أحمر" },
  b: { color: "#4a8fe7", label: "أزرق" },
  y: { color: "#f2c94c", label: "أصفر" },
};
