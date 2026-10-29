import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowUpLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  CopyPlus,
  Crosshair,
  ExternalLink,
  Highlighter,
  LayoutGrid,
  ListTree,
  Maximize2,
  Minus,
  Move,
  Plus,
  Repeat,
  Trash2,
  Workflow,
} from "lucide-react";
import type { DependencyPair, LinkType, StatusRow, TaskRow, TaskTypeLite } from "../../../hooks/tasks/useTaskBoard";
import { externalWaitIds, type DependencyFlags } from "../../../hooks/tasks/dependencyFlags";
import {
  HIGHLIGHT_FILL,
  HIGHLIGHT_SWATCH,
  type FlowChecklistItem,
  type FlowMode,
  type FlowPosition,
  type FlowState,
  type HighlightColor,
} from "../../../hooks/tasks/useFlowState";
import { WAIT_STYLE } from "../board/DependencyBadges";
import { useTemplateMode } from "../TemplateModeContext";
import { typeBadges, type TypeBadge } from "../board/taskTypeBadge";
import { arabicCount, criticalCount, dayAdapter, daysShort, spanShort, tasksCount } from "../gantt/ganttScale";
import { Badge } from "../gantt/GanttBar";
import { criticalPath, linkKey, type CriticalPathResult } from "../schedule/criticalPath";
import { workingDaysBetween } from "../board/workingDays";
import { flowLayout } from "./flowLayout";

// مخطط الروابط — the board's tasks as boxes and their links as arrows: the
// client's Construction Flow (plans/construction-flow-comparison/), now as a
// free network diagram. Reached at /tasks/board/:id/flow, from the same
// ["task-board", boardId] query as the list and the Gantt.
//
// Two layouts, shared by everyone on the board (useFlowState.ts):
//   - "ترتيب تلقائي" (tidy): placed by link order (flowLayout.ts), recomputed
//     on every change;
//   - "حر" (free): every box where someone put it. Dragging a box in the tidy
//     layout turns the board free, starting from the tidy places. A box with
//     no saved place yet (a new task) goes next to the task it follows.
//
// Every task and subtask is its own box ("ضمن: …" on a subtask, bracket
// edges and a count on a parent).
//
// Gestures, like Construction Flow: drag a box to move it (Shift / Ctrl+click
// selects several, they move together; "keep after blockers" stops a box
// from going before the tasks it waits for); drop a box on another to make it
// one of its checklist items; drag the dot on a box's exit edge (its left
// edge — the chart runs right → left) onto another box to link them, as
// "starts after" or "starts with" (the toolbar's link type); click a line to
// select it; Delete removes the selection (Ctrl+Z brings it back); double-click
// opens the task; the wheel zooms around the cursor; dragging the background,
// Space+drag or the middle button pans. The edit bar at the bottom renames a
// task, changes its days or a link's type. 🖍️ colours boxes for everyone.
// "المسار الحرج" colours the critical path (schedule/criticalPath.ts).

const NODE_W = 210;
const NODE_H = 76;
const GAP_X = 90;
const GAP_Y = 28;
const MARGIN = 40;
const GRID = 10;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
/** How close (screen px) to a box's entry the link drag snaps to it. */
const SNAP_PX = 80;
/** How far (screen px) the pointer moves before a press is a drag, not a click. */
const DRAG_PX = 4;
/** Room kept between a box and the box it waits for ("keep after blockers"). */
const BLOCKER_GAP = 24;
const DEFAULT_STATUS_COLOR = "#6B7280";
const SS_COLOR = "#C9702F";
/** Room around the boxes for link curves (an "ss" curve bulges 50 past the boxes). */
const SVG_PAD = 400;

const isFinished = (category: string | undefined) => category === "done" || category === "closed";
const snap = (v: number) => Math.round(v / GRID) * GRID;

type Point = { x: number; y: number };

export interface FlowEditing {
  state: FlowState;
  /** Move boxes, switch the layout, colour (space edit rights). */
  canEditLayout: boolean;
  onSavePositions: (moved: FlowPosition[], seed?: FlowPosition[]) => void;
  onSetMode: (mode: FlowMode, seed?: FlowPosition[]) => void;
  onSetKeepAfterBlockers: (on: boolean) => void;
  onSetHighlight: (taskIds: string[], color: HighlightColor | null) => void;
  onClearHighlights: () => void;
  onTaskToItem: (taskId: string, targetId: string, title: string) => void;
  onItemToTask: (item: FlowChecklistItem) => void;
  onToggleItem: (itemId: string, checked: boolean) => void;
}

interface TaskFlowProps {
  tasks: TaskRow[];
  statuses: StatusRow[];
  taskTypes: Map<string, TaskTypeLite>;
  dependencies: DependencyPair[];
  dependencyFlags: Map<string, DependencyFlags>;
  onOpenTask: (taskId: string) => void;
  onLink?: (pair: DependencyPair) => void;
  onUnlink?: (pair: DependencyPair) => void;
  onReverseLink?: (pair: DependencyPair) => void;
  onChangeLinkType?: (pair: DependencyPair, linkType: LinkType) => void;
  /** "+" on a box: a new task after it, under the same parent. */
  onAddAfter?: (taskId: string, parentTaskId: string | null) => void;
  /** The toolbar's "إضافة مهمة" (always a main task — null parent). */
  onAddTask?: (parentTaskId: string | null) => void;
  readOnly?: boolean;
  /** The free diagram (positions, colours, box <-> item). Without it: the tidy layout only. */
  flow?: FlowEditing;
  /** Per-task rights (an assignee may edit their own task). Defaults to !readOnly. */
  canEditTask?: (taskId: string) => boolean;
  onRenameTask?: (taskId: string, title: string) => void;
  onChangeDays?: (taskId: string, days: number) => void;
  onDeleteTasks?: (taskIds: string[]) => void;
  onCopyToZones?: (taskIds: string[]) => void;
  /** Picking tasks (the import dialog): a click toggles a box, nothing is edited. */
  selectMode?: { selected: Set<string>; disabled: Set<string>; onToggle: (taskId: string) => void };
  /** Remembers zoom / pan per board in this browser. */
  storageKey?: string;
}

interface View {
  x: number;
  y: number;
  k: number;
}

function loadView(key: string | undefined): View | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(`flow-view:${key}`);
    const v = raw ? (JSON.parse(raw) as View) : null;
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.k) ? v : null;
  } catch {
    return null;
  }
}

export default function TaskFlow({
  tasks,
  statuses,
  taskTypes,
  dependencies,
  dependencyFlags,
  onOpenTask,
  onLink,
  onUnlink,
  onReverseLink,
  onChangeLinkType,
  onAddAfter,
  onAddTask,
  readOnly = false,
  flow,
  canEditTask,
  onRenameTask,
  onChangeDays,
  onDeleteTasks,
  onCopyToZones,
  selectMode,
  storageKey,
}: TaskFlowProps) {
  const isTemplate = useTemplateMode();
  const adapter = useMemo(() => dayAdapter(isTemplate), [isTemplate]);
  const badges = useMemo(() => typeBadges(taskTypes), [taskTypes]);
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const picking = !!selectMode;
  const editable = !readOnly && !picking;
  const mayEdit = (taskId: string) => editable && (canEditTask ? canEditTask(taskId) : true);
  const layoutEditable = editable && !!flow?.canEditLayout;
  // Every link on this board is drawn; a wait on a task of another zone /
  // board gets the stop icon.
  const externalWaits = useMemo(
    () => externalWaitIds(tasks, dependencies, dependencyFlags, (id) => statusById.get(id)?.category),
    [tasks, dependencies, dependencyFlags, statusById],
  );

  // A task's parent, or null (a main task) when its parent isn't loaded
  // (an assignee's filtered board).
  const parentOf = (task: TaskRow): string | null =>
    task.parent_task_id && byId.has(task.parent_task_id) ? task.parent_task_id : null;
  const childCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) if (t.parent_task_id && byId.has(t.parent_task_id)) map.set(t.parent_task_id, (map.get(t.parent_task_id) ?? 0) + 1);
    return map;
  }, [tasks, byId]);
  /** Titles from the main task down to this task's parent. */
  const ancestorsOf = (task: TaskRow): string[] => {
    const out: TaskRow[] = [];
    let cursor = parentOf(task);
    while (cursor) {
      const t = byId.get(cursor);
      if (!t || out.includes(t)) break;
      out.unshift(t);
      cursor = parentOf(t);
    }
    return out.map((t) => t.title);
  };

  const dayOf = (value: string | null) => (value ? adapter.toDay(value) : null);
  const startOf = (t: TaskRow) => dayOf(t.start_date) ?? Number.POSITIVE_INFINITY;

  // Every task in outline order — each parent followed by its subtasks,
  // siblings by start date — and every link with both ends on this board.
  const { boxes, links } = useMemo(() => {
    const kids = new Map<string | null, { t: TaskRow; i: number }[]>();
    tasks.forEach((t, i) => {
      const parent = parentOf(t);
      const list = kids.get(parent) ?? [];
      list.push({ t, i });
      kids.set(parent, list);
    });
    for (const list of kids.values())
      list.sort((a, b) => {
        const sa = startOf(a.t);
        const sb = startOf(b.t);
        return sa === sb ? a.i - b.i : sa < sb ? -1 : 1;
      });
    const order: string[] = [];
    const seen = new Set<string>();
    const visit = (parent: string | null) => {
      for (const { t } of kids.get(parent) ?? []) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        order.push(t.id);
        visit(t.id);
      }
    };
    visit(null);
    // A parent loop (refused on save, so only bad data) never reaches the top.
    for (const t of tasks) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      order.push(t.id);
      visit(t.id);
    }
    const drawn = dependencies
      .filter((d) => byId.has(d.blocking_task_id) && byId.has(d.blocked_task_id))
      .map((d) => ({ pair: d, from: d.blocking_task_id, to: d.blocked_task_id, ss: d.link_type === "ss" }));
    return { boxes: order, links: drawn };
  }, [tasks, dependencies, byId, adapter]);

  // The tidy layout (finish -> start links only; "starts with" links are
  // drawn on top) — the tidy mode, and where boxes start when a board turns free.
  const tidy = useMemo(
    () =>
      flowLayout(
        boxes,
        links.filter((l) => !l.ss).map((l) => ({ from: l.from, to: l.to })),
        { nodeW: NODE_W, nodeH: NODE_H, gapX: GAP_X, gapY: GAP_Y },
      ),
    [boxes, links],
  );
  const free = flow?.state.mode === "free";

  // Saved places in the free layout; a box without one goes left of the task
  // it follows (or under everything), on a free spot.
  const placed = useMemo((): Map<string, Point> => {
    if (!free || !flow) return new Map(Array.from(tidy.nodes, ([id, p]) => [id, { x: p.x, y: p.y }]));
    const saved = flow.state.positions;
    const out = new Map<string, Point>();
    for (const id of boxes) {
      const p = saved.get(id);
      if (p) out.set(id, p);
    }
    const overlaps = (x: number, y: number) =>
      Array.from(out.values()).some((p) => Math.abs(p.x - x) < NODE_W && Math.abs(p.y - y) < NODE_H);
    const predOf = new Map<string, string>();
    for (const l of links) if (!predOf.has(l.to)) predOf.set(l.to, l.from);
    let bottom = Math.max(0, ...Array.from(out.values(), (p) => p.y + NODE_H));
    let rowX = Math.max(0, ...Array.from(out.values(), (p) => p.x));
    for (const id of boxes) {
      if (out.has(id)) continue;
      const pred = predOf.get(id);
      const anchor = pred ? out.get(pred) : undefined;
      let x: number;
      let y: number;
      if (anchor) {
        x = anchor.x - NODE_W - GAP_X;
        y = anchor.y;
        while (overlaps(x, y)) y += NODE_H + GAP_Y;
      } else {
        if (rowX < NODE_W) {
          rowX = Math.max(0, ...Array.from(out.values(), (p) => p.x));
          bottom += NODE_H + GAP_Y;
        }
        x = rowX;
        y = bottom + GAP_Y;
        rowX -= NODE_W + GAP_Y;
        while (overlaps(x, y)) y += NODE_H + GAP_Y;
      }
      out.set(id, { x: snap(x), y: snap(y) });
      bottom = Math.max(bottom, y);
    }
    return out;
  }, [free, flow, tidy, boxes, links]);

  // --- Moving boxes ----------------------------------------------------------
  const [drag, setDrag] = useState<{
    ids: string[];
    from: Point;
    orig: Map<string, Point>;
    dx: number;
    dy: number;
    moved: boolean;
    dropTarget: string | null;
  } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const positions = useMemo(() => {
    if (!drag?.moved) return placed;
    const out = new Map(placed);
    for (const id of drag.ids) {
      const o = drag.orig.get(id);
      if (o) out.set(id, { x: o.x + drag.dx, y: o.y + drag.dy });
    }
    return out;
  }, [placed, drag]);

  const bounds = useMemo(() => {
    const pts = Array.from(positions.values());
    if (pts.length === 0) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    return {
      x0: Math.min(...pts.map((p) => p.x)),
      y0: Math.min(...pts.map((p) => p.y)),
      x1: Math.max(...pts.map((p) => p.x + NODE_W)),
      y1: Math.max(...pts.map((p) => p.y + NODE_H)),
    };
  }, [positions]);

  // --- Critical path, over the whole board --------------------------------
  const [focus, setFocus] = useState(false);
  const critical = useMemo((): { ok: boolean; result: CriticalPathResult | null } | null => {
    if (!focus) return null;
    const outcome = criticalPath(
      tasks.map((t) => ({
        id: t.id,
        parent_task_id: t.parent_task_id,
        start_date: t.start_date,
        due_date: t.due_date,
        start_lag_days: t.start_lag_days,
        frozen: isFinished(statusById.get(t.status_id)?.category),
      })),
      dependencies,
      { plain: isTemplate },
    );
    return outcome.ok ? { ok: true, result: outcome.result } : { ok: false, result: null };
  }, [focus, tasks, dependencies, statusById, isTemplate]);
  const criticalResult = critical?.result ?? null;

  // --- Hover: the whole chain ---------------------------------------------
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const chain = useMemo(() => {
    if (!hoveredId || drag?.moved) return null;
    const ids = new Set([hoveredId]);
    const walk = (from: "blocking_task_id" | "blocked_task_id", to: "blocking_task_id" | "blocked_task_id") => {
      const queue = [hoveredId];
      while (queue.length) {
        const id = queue.pop() as string;
        for (const dep of dependencies) {
          if (dep[from] === id && !ids.has(dep[to])) {
            ids.add(dep[to]);
            queue.push(dep[to]);
          }
        }
      }
    };
    walk("blocking_task_id", "blocked_task_id");
    walk("blocked_task_id", "blocking_task_id");
    return ids;
  }, [hoveredId, dependencies, drag?.moved]);

  // --- Selection, paint ------------------------------------------------------
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [paint, setPaint] = useState<HighlightColor | "x" | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newLinkType, setNewLinkType] = useState<LinkType>("fs");
  const [openLists, setOpenLists] = useState<Set<string>>(new Set());
  // tasks that disappeared (deleted, turned into items) leave the selection
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set(Array.from(prev).filter((id) => byId.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [byId]);

  // --- Pan and zoom -------------------------------------------------------
  const viewportRef = useRef<HTMLDivElement>(null);
  const restored = useRef(loadView(storageKey));
  const [view, setView] = useState<View>(restored.current ?? { x: MARGIN, y: MARGIN, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    if (!storageKey) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(`flow-view:${storageKey}`, JSON.stringify(view));
      } catch {
        // private window / storage blocked: the view just isn't remembered
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [view, storageKey]);

  const fit = () => {
    const el = viewportRef.current;
    const w0 = bounds.x1 - bounds.x0;
    const h0 = bounds.y1 - bounds.y0;
    if (!el || w0 <= 0) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const k = Math.max(MIN_ZOOM, Math.min(1.2, (w - MARGIN * 2) / w0, (h - MARGIN * 2) / h0));
    // Columns run right → left: hold the right edge when the chart is wider
    // than the screen.
    const x = w0 * k < w - MARGIN * 2 ? (w - w0 * k) / 2 - bounds.x0 * k : w - MARGIN - bounds.x1 * k;
    setView({ x, y: Math.max(MARGIN, (h - h0 * k) / 2) - bounds.y0 * k, k });
  };
  // Fit once when first laid out — unless this board's last view is remembered.
  const fitted = useRef(!!restored.current);
  useLayoutEffect(() => {
    if (fitted.current || bounds.x1 - bounds.x0 <= 0) return;
    fitted.current = true;
    fit();
  }, [bounds]);

  const zoomAt = (factor: number, cx: number, cy: number) =>
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  const zoomCentre = (factor: number) => {
    const el = viewportRef.current;
    if (el) zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
  };

  // The wheel zooms around the cursor, like Construction Flow (panning is
  // dragging). Native, non-passive: React's onWheel can't preventDefault.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      // A trackpad pinch arrives as Ctrl + small deltas: zoom it faster.
      const rate = e.ctrlKey ? 0.01 : 0.002;
      zoomAt(Math.min(1.25, Math.max(0.8, Math.exp(-delta * rate))), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /** Screen point → chart coordinates. */
  const toChart = (clientX: number, clientY: number): Point => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - v.x) / v.k, y: (clientY - rect.top - v.y) / v.k };
  };

  // Space held: any press pans, even on a box.
  const [spaceDown, setSpaceDown] = useState(false);
  useEffect(() => {
    const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? "");
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing()) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpaceDown(false);
    const blur = () => setSpaceDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // A press on the background (or with Space / the middle button anywhere)
  // pans once it moves DRAG_PX; the click that ends a drag is swallowed, so
  // dragging over a box or a line never opens or selects it.
  const [panning, setPanning] = useState<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const dragged = useRef(false);
  const onPressDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragged.current = false;
    const target = e.target as HTMLElement;
    const panAnywhere = e.button === 1 || e.button === 2 || (spaceDown && e.button === 0);
    if (panAnywhere) e.preventDefault();
    if (!panAnywhere) {
      if (e.button !== 0) return;
      if (target.closest("[data-flow-handle],[data-flow-control],[data-flow-box],[data-flow-link]")) return;
    }
    setPanning({ sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y });
  };
  const onClickAfterDrag = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!dragged.current) return;
    dragged.current = false;
    e.preventDefault();
    e.stopPropagation();
  };
  useEffect(() => {
    if (!panning) return;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - panning.sx;
      const dy = e.clientY - panning.sy;
      if (!dragged.current && Math.hypot(dx, dy) < DRAG_PX) return;
      dragged.current = true;
      setView((v) => ({ ...v, x: panning.ox + dx, y: panning.oy + dy }));
    };
    const up = () => setPanning(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [panning]);

  // "keep after blockers": how far the moved boxes may go left / right
  // (RTL: a task stays left of the tasks it waits for, right of its followers).
  const clampDx = (ids: string[], orig: Map<string, Point>, dx: number) => {
    const set = new Set(ids);
    let lo = -Infinity;
    let hi = Infinity;
    for (const id of ids) {
      const s = orig.get(id);
      if (!s) continue;
      for (const l of links) {
        if (l.ss) continue;
        if (l.to === id && !set.has(l.from)) {
          const a = placed.get(l.from);
          if (a) hi = Math.min(hi, a.x - NODE_W - BLOCKER_GAP - s.x);
        }
        if (l.from === id && !set.has(l.to)) {
          const b = placed.get(l.to);
          if (b) lo = Math.max(lo, b.x + NODE_W + BLOCKER_GAP - s.x);
        }
      }
    }
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
    return Math.max(lo, Math.min(hi, dx));
  };

  const dragActive = !!drag;
  useEffect(() => {
    if (!dragActive) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const p = toChart(e.clientX, e.clientY);
      const rawX = p.x - d.from.x;
      const rawY = p.y - d.from.y;
      if (!d.moved && Math.hypot(rawX * viewRef.current.k, rawY * viewRef.current.k) < DRAG_PX) return;
      dragged.current = true;
      let dx = snap(rawX);
      const dy = snap(rawY);
      if (flow?.state.keepAfterBlockers) dx = clampDx(d.ids, d.orig, dx);
      // one box over another: it would become one of its checklist items
      let dropTarget: string | null = null;
      if (d.ids.length === 1 && flow) {
        for (const [id, pos] of placed) {
          if (id === d.ids[0]) continue;
          if (p.x >= pos.x && p.x <= pos.x + NODE_W && p.y >= pos.y && p.y <= pos.y + NODE_H) {
            dropTarget = id;
            break;
          }
        }
      }
      setDrag({ ...d, dx, dy, moved: true, dropTarget });
    };
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d?.moved || !flow) return;
      const only = d.ids[0];
      if (d.dropTarget && d.ids.length === 1 && !childCount.get(only) && mayEdit(only) && mayEdit(d.dropTarget)) {
        flow.onTaskToItem(only, d.dropTarget, byId.get(only)?.title ?? "");
        return;
      }
      if (d.dx === 0 && d.dy === 0) return;
      const moved = d.ids
        .map((id) => {
          const o = d.orig.get(id);
          return o ? { task_id: id, x: o.x + d.dx, y: o.y + d.dy } : null;
        })
        .filter(Boolean) as FlowPosition[];
      const seed = free ? undefined : Array.from(placed, ([task_id, p]) => ({ task_id, x: p.x, y: p.y }));
      flow.onSavePositions(moved, seed);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragActive, placed, links, flow, free]);

  const onBoxPress = (task: TaskRow, e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || spaceDown || picking || paint) return;
    if (!layoutEditable) {
      // no layout rights: a press on a box pans like the background
      setPanning({ sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y });
      return;
    }
    dragged.current = false;
    const ids = selected.has(task.id) && selected.size > 1 ? Array.from(selected) : [task.id];
    setDrag({
      ids,
      from: toChart(e.clientX, e.clientY),
      orig: new Map(ids.map((id) => [id, placed.get(id) as Point])),
      dx: 0,
      dy: 0,
      moved: false,
      dropTarget: null,
    });
  };

  const onBoxClick = (task: TaskRow, e: ReactMouseEvent) => {
    if (picking) {
      if (!selectMode?.disabled.has(task.id)) selectMode?.onToggle(task.id);
      return;
    }
    if (paint && flow && mayEdit(task.id)) {
      flow.onSetHighlight([task.id], paint === "x" ? null : paint);
      return;
    }
    if (readOnly) {
      onOpenTask(task.id);
      return;
    }
    setSelectedLink(null);
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(task.id)) next.delete(task.id);
        else next.add(task.id);
        return next;
      });
    } else {
      setSelected(new Set([task.id]));
    }
  };

  // --- Drag a link from a box's dot -----------------------------------------
  const canLink = editable && !!onLink;
  const [linking, setLinking] = useState<{ fromId: string; x: number; y: number; targetId: string | null } | null>(null);
  const linkingRef = useRef(linking);
  linkingRef.current = linking;
  const linkActive = !!linking;
  useEffect(() => {
    if (!linkActive) return;
    const move = (e: PointerEvent) => {
      const p = toChart(e.clientX, e.clientY);
      const k = viewRef.current.k;
      let best: string | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const [id, pos] of positions) {
        if (id === linkingRef.current?.fromId) continue;
        // a box's entry is its right edge (the chart runs right → left)
        const ex = pos.x + NODE_W;
        const ey = pos.y + NODE_H / 2;
        const dist = Math.hypot(p.x - ex, p.y - ey);
        const inside = p.x >= pos.x - 20 && p.x <= pos.x + NODE_W + 20 && p.y >= pos.y - 20 && p.y <= pos.y + NODE_H + 20;
        if ((inside || dist < SNAP_PX / k) && dist < bestDist) {
          best = id;
          bestDist = dist;
        }
      }
      setLinking((prev) => prev && { ...prev, x: p.x, y: p.y, targetId: best });
    };
    const up = () => {
      const done = linkingRef.current;
      setLinking(null);
      if (done?.targetId)
        onLink?.({ blocking_task_id: done.fromId, blocked_task_id: done.targetId, link_type: newLinkType });
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setLinking(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
    };
  }, [linkActive, positions, onLink, newLinkType]);

  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const linkByKey = useMemo(() => new Map(links.map((l) => [linkKey(l.pair), l])), [links]);

  // --- Keys: Delete, Escape --------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? "")) return;
      if (e.key === "Escape") {
        setSelected(new Set());
        setSelectedLink(null);
        setPaint(null);
        setPaletteOpen(false);
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (selectedLink) {
        const l = linkByKey.get(selectedLink);
        if (l && onUnlink && mayEdit(l.to)) {
          e.preventDefault();
          onUnlink(l.pair);
          setSelectedLink(null);
        }
        return;
      }
      const ids = Array.from(selected).filter((id) => mayEdit(id));
      if (ids.length && onDeleteTasks) {
        e.preventDefault();
        onDeleteTasks(ids);
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, selectedLink, linkByKey, onUnlink, onDeleteTasks]);

  // --- Link lines -----------------------------------------------------------
  const paths = useMemo(() => {
    // Several links into or out of one box spread along its edge.
    const outs = new Map<string, typeof links>();
    const ins = new Map<string, typeof links>();
    for (const l of links) {
      if (l.ss) continue;
      outs.set(l.from, [...(outs.get(l.from) ?? []), l]);
      ins.set(l.to, [...(ins.get(l.to) ?? []), l]);
    }
    const yOf = (id: string) => positions.get(id)?.y ?? 0;
    const offset = (list: typeof links, l: (typeof links)[number], other: (x: (typeof links)[number]) => string) => {
      const sorted = list.slice().sort((a, b) => yOf(other(a)) - yOf(other(b)));
      const n = sorted.length;
      const step = n > 1 ? Math.min(14, (NODE_H - 24) / (n - 1)) : 0;
      return NODE_H / 2 + (sorted.indexOf(l) - (n - 1) / 2) * step;
    };
    return links.map((l) => {
      const a = positions.get(l.from);
      const b = positions.get(l.to);
      if (!a || !b) return null;
      let d: string;
      let mid: Point;
      if (l.ss) {
        // start to start: both right edges, bulging right
        const x1 = a.x + NODE_W;
        const y1 = a.y + NODE_H / 2;
        const x2 = b.x + NODE_W;
        const y2 = b.y + NODE_H / 2;
        const o = Math.max(x1, x2) + 50;
        d = `M ${x1} ${y1} C ${o} ${y1} ${o} ${y2} ${x2} ${y2}`;
        mid = { x: o - 12, y: (y1 + y2) / 2 };
      } else {
        const x1 = a.x;
        const y1 = a.y + offset(outs.get(l.from) ?? [], l, (x) => x.to);
        const x2 = b.x + NODE_W;
        const y2 = b.y + offset(ins.get(l.to) ?? [], l, (x) => x.from);
        // the tidy layout's bends only fit its own places
        const bends = !free && !drag?.moved ? (tidy.bends.get(`${l.from}>${l.to}`) ?? []) : [];
        const pts = [{ x: x1, y: y1 }, ...bends, { x: x2, y: y2 }];
        d = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i - 1];
          const q = pts[i];
          const dx = Math.max(30, Math.abs(q.x - p.x) / 2);
          d += ` C ${p.x - dx} ${p.y} ${q.x + dx} ${q.y} ${q.x} ${q.y}`;
        }
        const m = pts[Math.floor((pts.length - 1) / 2)];
        const mn = pts[Math.floor((pts.length - 1) / 2) + 1] ?? m;
        mid = { x: (m.x + mn.x) / 2, y: (m.y + mn.y) / 2 - 6 };
      }
      const blocker = byId.get(l.pair.blocking_task_id);
      const blocked = byId.get(l.pair.blocked_task_id);
      const end = blocker ? dayOf(l.ss ? blocker.start_date : blocker.due_date) : null;
      const start = blocked ? dayOf(blocked.start_date) : null;
      const lag = blocked?.start_lag_days ?? 0;
      return {
        key: linkKey(l.pair),
        pair: l.pair,
        ss: l.ss,
        d,
        lag,
        label: lag > 0 ? mid : null,
        conflict: end !== null && start !== null && (l.ss ? start < end : start <= end),
        inChain: !!chain && chain.has(l.pair.blocking_task_id) && chain.has(l.pair.blocked_task_id),
      };
    });
  }, [links, positions, byId, chain, adapter, free, tidy, drag?.moved]);

  const linkFrom = linking ? positions.get(linking.fromId) : null;

  // --- Summary ---------------------------------------------------------------
  const summary = useMemo(() => {
    let s = Infinity;
    let e = -Infinity;
    for (const t of tasks) {
      if (!t.start_date || !t.due_date) continue;
      s = Math.min(s, adapter.toDay(t.start_date));
      e = Math.max(e, adapter.toDay(t.due_date));
    }
    if (!Number.isFinite(s)) return null;
    return { days: workingDaysBetween(s, e, isTemplate), end: spanShort(e, e, adapter) };
  }, [tasks, adapter, isTemplate]);

  const selectedTask = selected.size === 1 ? byId.get(Array.from(selected)[0]) ?? null : null;
  const selectedPair = selectedLink ? linkByKey.get(selectedLink) ?? null : null;
  const items = flow?.state.itemsByTask;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {onAddTask && !picking && (
            <button
              onClick={() => onAddTask(null)}
              className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              إضافة مهمة
            </button>
          )}
          {flow && !picking && (
            <div className="flex overflow-hidden rounded-md border border-gray-200 text-xs">
              <button
                disabled={!layoutEditable}
                onClick={() => flow.onSetMode("tidy")}
                title="ترتيب المهام تلقائياً حسب الروابط"
                className={`flex items-center gap-1 px-2 py-1 disabled:cursor-default ${!free ? "bg-primary-superLight font-medium text-primary" : "text-gray-600 hover:bg-gray-50"}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                ترتيب تلقائي
              </button>
              <button
                disabled={!layoutEditable}
                onClick={() =>
                  flow.onSetMode(
                    "free",
                    Array.from(placed, ([task_id, p]) => ({ task_id, x: p.x, y: p.y })),
                  )
                }
                title="ضع المهام حيث تريد — يراها الجميع كما رتّبتها"
                className={`flex items-center gap-1 border-r border-gray-200 px-2 py-1 disabled:cursor-default ${free ? "bg-primary-superLight font-medium text-primary" : "text-gray-600 hover:bg-gray-50"}`}
              >
                <Move className="h-3.5 w-3.5" />
                حر
              </button>
            </div>
          )}
          {flow && layoutEditable && (
            <label
              className="flex cursor-pointer items-center gap-1 text-xs text-gray-600"
              title="عند السحب لا يمكن وضع مهمة قبل المهام التي تنتظرها"
            >
              <input
                type="checkbox"
                checked={flow.state.keepAfterBlockers}
                onChange={(e) => flow.onSetKeepAfterBlockers(e.target.checked)}
              />
              بعد ما تنتظره
            </label>
          )}
          {canLink && (
            <label className="flex items-center gap-1 text-xs text-gray-500">
              نوع الربط الجديد
              <select
                value={newLinkType}
                onChange={(e) => setNewLinkType(e.target.value as LinkType)}
                className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-700 outline-none"
              >
                <option value="fs">تبدأ بعد انتهاء الأولى</option>
                <option value="ss">تبدأ معها</option>
              </select>
            </label>
          )}
          {flow && layoutEditable && (
            <div className="relative" data-flow-control>
              <button
                onClick={() => {
                  setPaletteOpen((o) => !o);
                  if (paletteOpen) setPaint(null);
                }}
                title="تلوين المهام (يراه الجميع)"
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                  paint ? "border-primary bg-primary-superLight text-primary" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Highlighter className="h-3.5 w-3.5" />
                تلوين
              </button>
              {paletteOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                  {(Object.keys(HIGHLIGHT_SWATCH) as HighlightColor[]).map((c) => (
                    <button
                      key={c}
                      title={HIGHLIGHT_SWATCH[c].label}
                      onClick={() => {
                        const ids = Array.from(selected).filter((id) => mayEdit(id));
                        if (ids.length) flow.onSetHighlight(ids, c);
                        setPaint(c);
                      }}
                      className={`h-6 w-6 rounded-full border-2 ${paint === c ? "border-gray-800" : "border-white"}`}
                      style={{ background: HIGHLIGHT_SWATCH[c].color, boxShadow: "0 0 0 1px #E5E7EB" }}
                    />
                  ))}
                  <button
                    onClick={() => {
                      const ids = Array.from(selected).filter((id) => mayEdit(id));
                      if (ids.length) flow.onSetHighlight(ids, null);
                      setPaint("x");
                    }}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${paint === "x" ? "border-gray-800" : "border-gray-200"} text-gray-600`}
                  >
                    بلا لون
                  </button>
                  <button
                    onClick={() => flow.onClearHighlights()}
                    className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                  >
                    مسح الكل
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {critical &&
            (critical.ok ? (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                {criticalCount(criticalResult?.count ?? 0)} — أي تأخير فيها يؤخر النهاية
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                تعذّر حساب المسار الحرج — أعد تحميل الصفحة
              </span>
            ))}
          <span className="text-xs text-gray-500">
            {tasksCount(tasks.length)} ·{" "}
            {arabicCount(links.length, { one: "رابط واحد", two: "رابطان", few: "روابط", many: "رابطاً" })}
            {summary && (
              <>
                {" "}· {summary.days} {isTemplate ? "يوم" : "يوم عمل"} · تنتهي {summary.end}
              </>
            )}
          </span>
          <div className="flex overflow-hidden rounded-md border border-gray-200">
            <button onClick={() => zoomCentre(1 / 1.2)} className="px-2 py-1 text-gray-600 hover:bg-gray-50" title="تصغير (عجلة التمرير)">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => zoomCentre(1.2)} className="border-r border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50" title="تكبير (عجلة التمرير)">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={fit}
            className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            ملاءمة الكل
          </button>
          {!picking && (
            <button
              onClick={() => setFocus((v) => !v)}
              aria-pressed={focus}
              title="المهام التي يؤخر أي تأخير فيها نهاية اللوحة"
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                focus ? "border-red-200 bg-red-50 font-medium text-red-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Crosshair className="h-3.5 w-3.5" />
              المسار الحرج
            </button>
          )}
        </div>
      </div>

      <div
        ref={viewportRef}
        onPointerDown={onPressDown}
        onClickCapture={onClickAfterDrag}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-flow-box],[data-flow-link],[data-flow-control]")) return;
          setSelected(new Set());
          setSelectedLink(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative flex-1 select-none overflow-hidden bg-gray-50 ${
          panning ? "cursor-grabbing" : spaceDown ? "cursor-grab" : paint ? "cursor-copy" : "cursor-default"
        }`}
        style={{
          backgroundImage: "radial-gradient(#D1D5DB 1.2px, transparent 1.2px)",
          backgroundSize: `${24 * view.k}px ${24 * view.k}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
          touchAction: "none",
        }}
      >
        {tasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-gray-400">
            <Workflow className="h-8 w-8 text-gray-300" />
            لا توجد مهام في هذه اللوحة بعد
          </div>
        ) : (
          <div
            className="absolute left-0 top-0"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}
          >
            {/* links under the boxes */}
            {/* covers every box with room for curves, in chart coordinates (free places can be negative) */}
            <svg
              className="absolute overflow-visible"
              style={{ left: bounds.x0 - SVG_PAD, top: bounds.y0 - SVG_PAD }}
              width={bounds.x1 - bounds.x0 + SVG_PAD * 2}
              height={bounds.y1 - bounds.y0 + SVG_PAD * 2}
              viewBox={`${bounds.x0 - SVG_PAD} ${bounds.y0 - SVG_PAD} ${bounds.x1 - bounds.x0 + SVG_PAD * 2} ${bounds.y1 - bounds.y0 + SVG_PAD * 2}`}
            >
              <defs>
                <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto">
                  <path d="M0,0L10,5L0,10z" fill="#6B7280" />
                </marker>
                <marker id="flow-arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto">
                  <path d="M0,0L10,5L0,10z" fill="#DC2626" />
                </marker>
                <marker id="flow-arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto">
                  <path d="M0,0L10,5L0,10z" fill="#2563EB" />
                </marker>
                <marker id="flow-arrow-ss" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto">
                  <path d="M0,0L10,5L0,10z" fill={SS_COLOR} />
                </marker>
              </defs>
              {paths.map((p) => {
                if (!p) return null;
                const onPath = !!criticalResult && criticalResult.criticalLinks.has(p.key);
                const red = p.conflict || onPath;
                const hot = hoveredLink === p.key || selectedLink === p.key;
                const blue = !red && (p.inChain || hot);
                const dim = (!!chain && !p.inChain) || (!!criticalResult && !onPath);
                const stroke = red ? "#DC2626" : blue ? "#2563EB" : p.ss ? SS_COLOR : "#6B7280";
                const marker = red ? "flow-arrow-red" : blue ? "flow-arrow-blue" : p.ss ? "flow-arrow-ss" : "flow-arrow";
                return (
                  <g key={p.key} opacity={dim ? 0.2 : 1}>
                    <path
                      d={p.d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={hot ? 3.25 : onPath || p.inChain ? 2.5 : 1.75}
                      strokeDasharray={p.ss ? "7 5" : p.lag > 0 ? "3 4" : undefined}
                      markerEnd={`url(#${marker})`}
                    />
                    {p.label && (
                      <text x={p.label.x} y={p.label.y} textAnchor="middle" fontSize={11} fill="#B45309">
                        انتظار {p.lag}
                      </text>
                    )}
                    {!picking && !linking && (
                      <path
                        data-flow-link
                        d={p.d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={14}
                        style={{ pointerEvents: "stroke", cursor: "pointer" }}
                        onMouseEnter={() => setHoveredLink(p.key)}
                        onMouseLeave={() => setHoveredLink(null)}
                        onClick={() => {
                          setSelected(new Set());
                          setSelectedLink(p.key);
                        }}
                      />
                    )}
                  </g>
                );
              })}
              {linking && linkFrom && (
                <path
                  d={
                    newLinkType === "ss"
                      ? `M ${linkFrom.x + NODE_W} ${linkFrom.y + NODE_H / 2} L ${linking.x} ${linking.y}`
                      : `M ${linkFrom.x} ${linkFrom.y + NODE_H / 2} L ${linking.x} ${linking.y}`
                  }
                  stroke={newLinkType === "ss" ? SS_COLOR : "#2563EB"}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  fill="none"
                />
              )}
            </svg>

            {boxes.map((id) => {
              const pos = positions.get(id);
              const task = byId.get(id);
              if (!pos || !task) return null;
              const its = items?.get(id) ?? [];
              const isDragged = !!drag?.moved && drag.ids.includes(id);
              return (
                <FlowBox
                  key={id}
                  task={task}
                  x={pos.x}
                  y={pos.y}
                  color={statusById.get(task.status_id)?.color ?? DEFAULT_STATUS_COLOR}
                  done={isFinished(statusById.get(task.status_id)?.category)}
                  fill={flow?.state.highlights.get(id) ? HIGHLIGHT_FILL[flow.state.highlights.get(id) as HighlightColor] : null}
                  subtitle={
                    task.start_date && task.due_date
                      ? (() => {
                          const s = adapter.toDay(task.start_date);
                          const e = adapter.toDay(task.due_date);
                          return `${spanShort(s, e, adapter)} · ${daysShort(task.duration_days ?? workingDaysBetween(s, e, isTemplate))}`;
                        })()
                      : "غير مجدولة"
                  }
                  externalWait={externalWaits.has(task.id)}
                  badge={badges.get(task.task_type_id) ?? null}
                  ancestors={ancestorsOf(task)}
                  subtasks={childCount.get(task.id) ?? 0}
                  selected={selected.has(id) || !!selectMode?.selected.has(id)}
                  picked={!!selectMode?.selected.has(id)}
                  unavailable={!!selectMode?.disabled.has(id)}
                  dropTarget={drag?.dropTarget === id}
                  lifted={isDragged}
                  movable={layoutEditable}
                  items={its}
                  listOpen={openLists.has(id)}
                  onToggleList={() =>
                    setOpenLists((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  onToggleItem={flow && mayEdit(id) ? (item) => flow.onToggleItem(item.id, !item.is_checked) : undefined}
                  onItemToTask={flow && mayEdit(id) ? (item) => flow.onItemToTask(item) : undefined}
                  onPress={(e) => onBoxPress(task, e)}
                  onClick={(e) => onBoxClick(task, e)}
                  onOpen={() => !picking && onOpenTask(task.id)}
                  onHover={(on) => setHoveredId(on ? task.id : null)}
                  onLinkStart={
                    canLink && mayEdit(task.id) && !linking
                      ? (e) => {
                          e.stopPropagation();
                          const p = toChart(e.clientX, e.clientY);
                          setLinking({ fromId: task.id, x: p.x, y: p.y, targetId: null });
                        }
                      : undefined
                  }
                  onAddAfter={editable && onAddAfter ? () => onAddAfter(task.id, parentOf(task)) : undefined}
                  linkTarget={linking?.targetId === task.id}
                  tone={
                    criticalResult
                      ? criticalResult.critical.has(task.id)
                        ? "critical"
                        : "dim"
                      : chain && !chain.has(task.id)
                        ? "dim"
                        : null
                  }
                  note={
                    criticalResult
                      ? criticalResult.critical.has(task.id)
                        ? "حرجة — أي تأخير فيها يؤخر النهاية"
                        : criticalResult.slack.has(task.id)
                          ? `يمكن أن تتأخر ${criticalResult.slack.get(task.id)} ${isTemplate ? "يوم" : "يوم عمل"} دون تأخير النهاية`
                          : null
                      : null
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      {!picking && (
        <EditBar
          selectedCount={selected.size}
          task={selectedTask}
          pair={selectedPair?.pair ?? null}
          titleById={(id) => byId.get(id)?.title ?? ""}
          canEdit={selectedTask ? mayEdit(selectedTask.id) : selectedPair ? mayEdit(selectedPair.to) : editable}
          readOnly={readOnly}
          hasSubtasks={!!selectedTask && !!childCount.get(selectedTask.id)}
          onRename={onRenameTask}
          onChangeDays={onChangeDays}
          onOpen={(id) => onOpenTask(id)}
          onDelete={
            onDeleteTasks
              ? () => {
                  const ids = Array.from(selected).filter((id) => mayEdit(id));
                  if (ids.length) onDeleteTasks(ids);
                  setSelected(new Set());
                }
              : undefined
          }
          onCopyToZones={onCopyToZones ? () => onCopyToZones(Array.from(selected)) : undefined}
          onClearSelection={() => {
            setSelected(new Set());
            setSelectedLink(null);
          }}
          onChangeLinkType={onChangeLinkType}
          onReverseLink={onReverseLink}
          onUnlink={
            onUnlink
              ? (pair) => {
                  onUnlink(pair);
                  setSelectedLink(null);
                }
              : undefined
          }
          layoutHint={layoutEditable}
        />
      )}
    </div>
  );
}

/** The bar under the diagram: what the selection is, and what can be done to it. */
function EditBar({
  selectedCount,
  task,
  pair,
  titleById,
  canEdit,
  readOnly,
  hasSubtasks,
  onRename,
  onChangeDays,
  onOpen,
  onDelete,
  onCopyToZones,
  onClearSelection,
  onChangeLinkType,
  onReverseLink,
  onUnlink,
  layoutHint,
}: {
  selectedCount: number;
  task: TaskRow | null;
  pair: DependencyPair | null;
  titleById: (id: string) => string;
  canEdit: boolean;
  readOnly: boolean;
  hasSubtasks: boolean;
  onRename?: (taskId: string, title: string) => void;
  onChangeDays?: (taskId: string, days: number) => void;
  onOpen: (taskId: string) => void;
  onDelete?: () => void;
  onCopyToZones?: () => void;
  onClearSelection: () => void;
  onChangeLinkType?: (pair: DependencyPair, linkType: LinkType) => void;
  onReverseLink?: (pair: DependencyPair) => void;
  onUnlink?: (pair: DependencyPair) => void;
  layoutHint: boolean;
}) {
  const [name, setName] = useState(task?.title ?? "");
  const [days, setDays] = useState(String(task?.duration_days ?? ""));
  useEffect(() => {
    setName(task?.title ?? "");
    setDays(String(task?.duration_days ?? ""));
  }, [task?.id, task?.title, task?.duration_days]);

  const btn = "flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50";
  let body: React.ReactNode;
  if (pair) {
    body = (
      <>
        <span className="truncate text-xs text-gray-700">
          «{titleById(pair.blocked_task_id)}» {pair.link_type === "ss" ? "تبدأ مع" : "تبدأ بعد"} «{titleById(pair.blocking_task_id)}»
          {pair.zone_chain && <span className="mr-1 rounded-full bg-gray-100 px-1.5 text-[10px] text-gray-500">ربط المناطق</span>}
        </span>
        {canEdit && onChangeLinkType && (
          <select
            value={pair.link_type ?? "fs"}
            onChange={(e) => onChangeLinkType(pair, e.target.value as LinkType)}
            className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs outline-none"
          >
            <option value="fs">تبدأ بعد انتهاء الأولى</option>
            <option value="ss">تبدأ معها</option>
          </select>
        )}
        {canEdit && onReverseLink && (
          <button onClick={() => onReverseLink(pair)} className={btn}>
            <Repeat className="h-3.5 w-3.5" />
            عكس الاتجاه
          </button>
        )}
        {canEdit && onUnlink && (
          <button onClick={() => onUnlink(pair)} className={`${btn} text-red-600`}>
            <Trash2 className="h-3.5 w-3.5" />
            إزالة الربط
          </button>
        )}
      </>
    );
  } else if (task) {
    const commitName = () => {
      if (name.trim() && name.trim() !== task.title) onRename?.(task.id, name);
      else setName(task.title);
    };
    const commitDays = () => {
      const n = Number(days);
      if (Number.isInteger(n) && n >= 1 && n <= 3650 && n !== task.duration_days) onChangeDays?.(task.id, n);
      else setDays(String(task.duration_days ?? ""));
    };
    body = (
      <>
        <label className="text-xs text-gray-400">المهمة</label>
        <input
          dir="auto"
          value={name}
          disabled={!canEdit || !onRename}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="min-w-[180px] flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-primary disabled:bg-gray-50"
        />
        <label className="text-xs text-gray-400">الأيام</label>
        <input
          type="number"
          min={1}
          value={days}
          disabled={!canEdit || !onChangeDays || hasSubtasks}
          title={hasSubtasks ? "أيام المهمة الرئيسية تُحسب من مهامها الفرعية" : undefined}
          onChange={(e) => setDays(e.target.value)}
          onBlur={commitDays}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-primary disabled:bg-gray-50"
        />
        <button onClick={() => onOpen(task.id)} className={btn}>
          <ExternalLink className="h-3.5 w-3.5" />
          التفاصيل
        </button>
        {onCopyToZones && canEdit && (
          <button onClick={onCopyToZones} className={btn}>
            <CopyPlus className="h-3.5 w-3.5" />
            نسخ إلى مناطق
          </button>
        )}
        {onDelete && canEdit && (
          <button onClick={onDelete} className={`${btn} text-red-600`}>
            <Trash2 className="h-3.5 w-3.5" />
            حذف
          </button>
        )}
      </>
    );
  } else if (selectedCount > 1) {
    body = (
      <>
        <span className="text-xs text-gray-700">
          {tasksCount(selectedCount)} محددة{layoutHint ? " — اسحب أياً منها لتحريكها معاً" : ""}
        </span>
        {onCopyToZones && (
          <button onClick={onCopyToZones} className={btn}>
            <CopyPlus className="h-3.5 w-3.5" />
            نسخ إلى مناطق
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className={`${btn} text-red-600`}>
            <Trash2 className="h-3.5 w-3.5" />
            حذف المحدد
          </button>
        )}
        <button onClick={onClearSelection} className={btn}>
          إلغاء التحديد
        </button>
      </>
    );
  } else {
    body = (
      <span className="text-[11px] leading-relaxed text-gray-400">
        {readOnly
          ? "انقر مهمة لفتحها · العجلة للتكبير · اسحب الخلفية للتحريك"
          : "اسحب مهمة لتحريكها · اسحب النقطة على حافتها إلى مهمة أخرى لربطهما · Shift+نقر لتحديد عدة مهام · أفلت مهمة فوق أخرى لتصبح بنداً فيها · نقر مزدوج لفتح المهمة · Delete للحذف (Ctrl+Z للتراجع) · العجلة للتكبير · اسحب الخلفية أو Space+سحب للتحريك"}
      </span>
    );
  }
  return (
    <div data-flow-control className="flex min-h-[46px] flex-wrap items-center gap-2 border-t border-gray-100 bg-white px-4 py-2">
      {body}
    </div>
  );
}

/** One task's box. */
function FlowBox({
  task,
  x,
  y,
  color,
  done,
  fill,
  subtitle,
  externalWait,
  badge,
  ancestors,
  subtasks,
  selected,
  picked,
  unavailable,
  dropTarget,
  lifted,
  movable,
  items,
  listOpen,
  onToggleList,
  onToggleItem,
  onItemToTask,
  onPress,
  onClick,
  onOpen,
  onHover,
  onLinkStart,
  onAddAfter,
  linkTarget,
  tone,
  note,
}: {
  task: TaskRow;
  x: number;
  y: number;
  color: string;
  done: boolean;
  /** Highlight colour fill, or null. */
  fill: string | null;
  subtitle: string;
  externalWait: boolean;
  badge: TypeBadge | null;
  /** Titles from the main task down to this task's parent; empty for a main task. */
  ancestors: string[];
  subtasks: number;
  selected: boolean;
  /** Chosen in the import picker. */
  picked: boolean;
  /** Can't be picked (already in the target zone). */
  unavailable: boolean;
  dropTarget: boolean;
  lifted: boolean;
  movable: boolean;
  items: FlowChecklistItem[];
  listOpen: boolean;
  onToggleList: () => void;
  onToggleItem?: (item: FlowChecklistItem) => void;
  onItemToTask?: (item: FlowChecklistItem) => void;
  onPress: (e: ReactPointerEvent<HTMLElement>) => void;
  onClick: (e: ReactMouseEvent) => void;
  onOpen: () => void;
  onHover: (on: boolean) => void;
  onLinkStart?: (e: ReactPointerEvent<HTMLElement>) => void;
  onAddAfter?: () => void;
  linkTarget: boolean;
  tone: "critical" | "dim" | null;
  note: string | null;
}) {
  const [hovered, setHovered] = useState(false);
  const ring = dropTarget
    ? "ring-4 ring-orange-400"
    : linkTarget
      ? "ring-2 ring-blue-500 ring-offset-2"
      : selected
        ? "ring-2 ring-primary ring-offset-1"
        : tone === "critical"
          ? "ring-2 ring-red-600"
          : task.is_overdue && !done
            ? "ring-2 ring-red-300"
            : "";
  const edge = done ? "#9CA3AF" : color;
  const parentTitle = ancestors[ancestors.length - 1] ?? null;
  const doneItems = items.filter((i) => i.is_checked).length;
  return (
    <>
      <div
        data-flow-box
        onMouseEnter={() => {
          setHovered(true);
          onHover(true);
        }}
        onMouseLeave={() => {
          setHovered(false);
          onHover(false);
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-flow-handle],[data-flow-inner]")) return;
          onPress(e);
        }}
        onClick={onClick}
        onDoubleClick={onOpen}
        className={`group absolute rounded-lg border shadow-sm transition-shadow hover:shadow-md ${ring} ${
          movable ? "cursor-move" : "cursor-pointer"
        }`}
        style={{
          left: x,
          top: y,
          width: NODE_W,
          height: NODE_H,
          opacity: unavailable ? 0.4 : tone === "dim" ? 0.35 : lifted ? 0.85 : 1,
          zIndex: lifted ? 20 : undefined,
          borderColor: "#E5E7EB",
          borderRightWidth: 5,
          borderRightColor: edge,
          // a parent gets both edges, like the Gantt's summary brackets
          ...(subtasks > 0 && { borderLeftWidth: 3, borderLeftColor: edge }),
          background: picked ? "#E0F2F1" : fill ?? (done ? "#F9FAFB" : "white"),
        }}
        title={[[...ancestors, task.title].join(" ← "), note, unavailable ? "موجودة في هذه المنطقة" : null].filter(Boolean).join(" · ")}
      >
        <div className="flex h-full w-full flex-col justify-center gap-0.5 px-3 text-right">
          <span className={`flex min-w-0 items-center gap-1 text-[13px] font-semibold ${done ? "text-gray-500" : "text-gray-900"}`}>
            {externalWait && (
              <span title="تنتظر مهمة في منطقة أو لوحة أخرى" className="inline-flex shrink-0">
                <WAIT_STYLE.Icon className={`h-3.5 w-3.5 ${WAIT_STYLE.text}`} />
              </span>
            )}
            {done && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
            <span className={`truncate ${done ? "line-through decoration-gray-400" : ""}`}>{task.title}</span>
          </span>
          <span className="truncate text-[11px] text-gray-500">{unavailable ? "موجودة في هذه المنطقة" : subtitle}</span>
          {(subtasks > 0 || parentTitle) && (
            <span className="flex min-w-0 items-center gap-1 text-[11px] text-gray-500">
              {subtasks > 0 && (
                <span className="flex shrink-0 items-center gap-0.5">
                  <ListTree className="h-3 w-3" />
                  {arabicCount(subtasks, { one: "مهمة فرعية", two: "مهمتان فرعيتان", few: "مهام فرعية", many: "مهمة فرعية" })}
                </span>
              )}
              {subtasks > 0 && parentTitle && <span className="shrink-0">·</span>}
              {parentTitle && <span className="truncate">ضمن: {parentTitle}</span>}
            </span>
          )}
        </div>
        {picked && (
          <span className="pointer-events-none absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow">
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
        {badge && !picked && (
          <span className="pointer-events-none absolute left-2 top-2">
            <Badge badge={badge} />
          </span>
        )}
        {items.length > 0 && (
          <button
            type="button"
            data-flow-inner
            onClick={(e) => {
              e.stopPropagation();
              onToggleList();
            }}
            title="بنود قائمة التحقق"
            className="absolute bottom-1.5 left-2 flex items-center gap-0.5 rounded px-1 text-[11px] text-gray-500 hover:bg-gray-100"
          >
            {listOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
            {doneItems}/{items.length}
          </button>
        )}
        {onLinkStart && hovered && (
          // the exit edge: the box's left side (the chart runs right → left)
          <span
            data-flow-handle
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              onLinkStart(e);
            }}
            title="اسحب إلى مهمة أخرى لربطهما"
            className="absolute -left-3 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-crosshair items-center justify-center"
          >
            <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 shadow transition-transform hover:scale-125" />
          </span>
        )}
        {onAddAfter && hovered && (
          <button
            type="button"
            data-flow-inner
            onClick={(e) => {
              e.stopPropagation();
              onAddAfter();
            }}
            title="إضافة مهمة بعد هذه"
            className="absolute -bottom-3 left-12 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {listOpen && items.length > 0 && (
        <div
          data-flow-box
          className="absolute z-10 rounded-lg border border-gray-200 bg-white py-1 shadow-md"
          style={{ left: x, top: y + NODE_H + 8, width: NODE_W }}
        >
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-1.5 px-2 py-1 text-[12px]">
              <button
                type="button"
                disabled={!onToggleItem}
                onClick={() => onToggleItem?.(item)}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  item.is_checked ? "border-primary bg-primary text-white" : "border-gray-300"
                }`}
              >
                {item.is_checked && <Check className="h-3 w-3" />}
              </button>
              <span className={`flex-1 truncate ${item.is_checked ? "text-gray-400 line-through" : "text-gray-700"}`} dir="auto">
                {item.content}
              </span>
              {onItemToTask && (
                <button
                  type="button"
                  onClick={() => onItemToTask(item)}
                  title={item.source_task_id ? "إرجاعها مهمة" : "تحويلها إلى مهمة"}
                  className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-primary"
                >
                  <ArrowUpLeft className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
