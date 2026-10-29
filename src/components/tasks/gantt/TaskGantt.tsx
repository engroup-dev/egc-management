import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, ChevronDown, ChevronLeft, ChevronsDown, ChevronsUp, Crosshair, Maximize2, Plus } from "lucide-react";
import type {
  DependencyPair,
  StatusRow,
  TaskRow,
  TaskTypeLite,
} from "../../../hooks/tasks/useTaskBoard";
import { externalWaitIds, type DependencyFlags } from "../../../hooks/tasks/dependencyFlags";
import { dayOffsetLabel } from "../board/templateDates";
import { PointMenu } from "../board/AnchoredMenu";
import { useTemplateMode } from "../TemplateModeContext";
import { typeBadges } from "../board/taskTypeBadge";
import { criticalPath, linkKey, type CriticalPathResult, type CriticalTask } from "../schedule/criticalPath";
import GanttBar, { BAR_H, FoldButton, MIN_BAR_W, ROW_H, type BarChange } from "./GanttBar";
import { formatDayWithWeekday, workingDaysBetween, dayString } from "../board/workingDays";
import {
  MAX_PX_PER_DAY,
  MIN_PX_PER_DAY,
  ZOOM_LABELS,
  ZOOM_PX_PER_DAY,
  barSpan,
  computeRange,
  criticalCount,
  dayAdapter,
  daysShort,
  fitRange,
  headerRows,
  spanLabel,
  spanShort,
  tasksCount,
  weekendDays,
  zoomForPxPerDay,
  type BarSpan,
  type GanttZoom,
} from "./ganttScale";

// Board Gantt view — the same board as TaskTable, on a timeline. Reached at
// /tasks/board/:id/gantt (TasksRoutes.tsx); reads the same ["task-board",
// boardId] query as the list, so edits made in the task panel show up here
// without any extra invalidation.
//
// Redesigned 2026-10-17 after Construction Flow's "Days view", which a client
// gave us as the model (plans/construction-flow-comparison/): no side panel
// of columns any more — the timeline fills the screen and each bar carries
// its own title, dates and days (GanttBar.tsx). Rows run as a staircase:
// every list of siblings is ordered by start date, subtasks under their
// parent, unscheduled ones last. Dates are typed in the task panel; here
// they are dragged.
//
// ONE scroll container in both axes, the two-row date header sticky to the
// top. Time runs right → left (the page is dir="rtl"), so every horizontal
// position is a `right:` offset from the start of the visible range. Zoom is
// continuous (pxPerDay): Ctrl/Cmd+scroll anywhere (a trackpad pinch arrives as
// Ctrl+wheel), or plain scroll over the date header; Day / Week / Month are
// presets of the same value, and "ملاءمة الكل" fits the whole plan.
//
// Scheduling (tasks/migrations/2026-10-13_task_scheduling_a.sql): on a real
// board a task is a start plus working days (Friday off), linked
// finish-to-start to the tasks before it. Dragging a bar or resizing it goes
// to the scheduler, which moves every task linked after it; the dragged bar
// moves at once, the rest when the board refetches. A linked bar can't be
// dragged before its predecessors end, and a parent with subtasks is a summary
// bar spanning them. Links are drawn between the bars (dashed with "انتظار N"
// where a task waits N working days; hovering a bar lights up its chain), new
// ones are dragged from a bar's end dot, and clicking one offers to reverse or
// remove it. Template boards count in "Day N" with every day counting.
//
// "المسار الحرج" (Construction Flow's "Focus on") colours the critical
// path — schedule/criticalPath.ts — and fades everything that can slip.
//
// The space page (SpaceTasksPage.tsx, /tasks/space/:id/gantt) shows every
// board of the space on one chart by passing `groups`: each board gets a band
// (name, count, "+", a summary bar) with the board's own tasks under it. The
// critical path is worked out per board there.

const HEADER_ROW_H = 24;
const HEADER_H = HEADER_ROW_H * 2;
const DEFAULT_STATUS_COLOR = "#6B7280"; // same fallback as StatusCell.tsx
const ARROW_STUB = 8;
/** Corner radius of the link lines. */
const LINK_RADIUS = 4;
const ZOOMS: GanttZoom[] = ["day", "week", "month"];
/** "Fit" leaves this much air at each end of the plan. */
const FIT_MARGIN = 24;

// localStorage — every access wrapped, since storage can be unreadable
// (private window, blocked site data) and none of this is worth failing
// the chart over. Same posture as TaskTable's loadBoardSort/saveBoardSort.
const PX_STORAGE_KEY = "tasks.ganttPxPerDay";
// Before scroll-zoom the saved choice was one of "day" | "week" | "month".
const LEGACY_ZOOM_STORAGE_KEY = "tasks.ganttZoom";

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable — the choice just won't be remembered
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function loadPxPerDay(): number {
  const raw = readStored(PX_STORAGE_KEY);
  if (raw !== null && Number.isFinite(Number(raw))) {
    return clamp(Number(raw), MIN_PX_PER_DAY, MAX_PX_PER_DAY);
  }
  const legacy = readStored(LEGACY_ZOOM_STORAGE_KEY);
  if (legacy && (ZOOMS as string[]).includes(legacy)) return ZOOM_PX_PER_DAY[legacy as GanttZoom];
  return ZOOM_PX_PER_DAY.day;
}

/** An SVG path through `points` with rounded corners — the link lines. */
function roundedPath(points: [number, number][], radius: number): string {
  if (points.length < 2) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r <= 0) {
      d += ` L ${cx} ${cy}`;
      continue;
    }
    const ax = cx - ((cx - px) / inLen) * r;
    const ay = cy - ((cy - py) / inLen) * r;
    const bx = cx + ((nx - cx) / outLen) * r;
    const by = cy + ((ny - cy) / outLen) * r;
    d += ` L ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d} L ${lx} ${ly}`;
}

export interface GanttDateChange {
  startDate?: string | null;
  dueDate?: string | null;
  /** Working days (calendar boards) — the scheduler derives the due date. */
  durationDays?: number;
}

// What a read-only Gantt calls instead of saving.
function ignoreDateChange(): void {
  return;
}

/** A band on a chart that spans several boards — one per board. */
export interface GanttGroup {
  id: string;
  label: string;
  /** Where the group's name links to (the board's own Gantt). */
  href?: string;
}

interface TaskGanttProps {
  tasks: TaskRow[];
  /** Highlight colour fills (the diagram's 🖍️), by task. */
  highlights?: Map<string, string>;
  statuses: StatusRow[];
  taskTypes: Map<string, TaskTypeLite>;
  dependencies: DependencyPair[];
  dependencyFlags: Map<string, DependencyFlags>;
  onChangeDates: (taskId: string, change: GanttDateChange) => void;
  /** Drag from a bar's end dot onto another row: that task starts after this one. */
  onLink?: (pair: DependencyPair) => void;
  /** Click a link line → remove it. */
  onUnlink?: (pair: DependencyPair) => void;
  /** Click a link line → turn it around. */
  onReverseLink?: (pair: DependencyPair) => void;
  /** Opens the create dialog (real boards, with create rights). */
  onAddTask?: () => void;
  /** No edit rights: bars open the task but cannot be dragged. */
  readOnly?: boolean;
  /** Opens a task's detail panel (the page's nested task/:taskId route). */
  onOpenTask: (taskId: string) => void;
  /** Several boards on one chart: a band per group, in this order, with the
   * group's tasks (groupOf) under it. */
  groups?: GanttGroup[];
  groupOf?: (task: TaskRow) => string;
  /** The "+" on a group's band (with create rights). */
  onAddToGroup?: (groupId: string) => void;
  emptyLabel?: string;
}

type VisibleRow =
  | { kind: "task"; task: TaskRow; depth: number; hasChildren: boolean }
  | { kind: "group"; group: GanttGroup; count: number };

// Groups fold in the same set as parent tasks; the prefix keeps the keys apart.
const groupKey = (groupId: string) => `group:${groupId}`;

const isFinished = (category: string | undefined) => category === "done" || category === "closed";

export default function TaskGantt({
  tasks,
  highlights,
  statuses,
  taskTypes,
  dependencies,
  dependencyFlags,
  onChangeDates: onChangeDatesProp,
  onLink,
  onUnlink,
  onReverseLink,
  onAddTask,
  readOnly = false,
  onOpenTask,
  groups,
  groupOf,
  onAddToGroup,
  emptyLabel = "لا توجد مهام في هذه اللوحة بعد",
}: TaskGanttProps) {
  const onChangeDates = readOnly ? ignoreDateChange : onChangeDatesProp;
  const isTemplate = useTemplateMode();
  const adapter = useMemo(() => dayAdapter(isTemplate), [isTemplate]);
  const todayRef = useRef<HTMLDivElement>(null);
  const badges = useMemo(() => typeBadges(taskTypes), [taskTypes]);

  // Continuous zoom. `zoom` (which header cells to draw) is derived from it.
  const [pxPerDay, setPxPerDay] = useState(loadPxPerDay);
  const zoom = zoomForPxPerDay(pxPerDay);
  useEffect(() => {
    // Debounced: a scroll-zoom changes this on every wheel tick.
    const timer = setTimeout(() => writeStored(PX_STORAGE_KEY, String(Math.round(pxPerDay * 100) / 100)), 250);
    return () => clearTimeout(timer);
  }, [pxPerDay]);

  // The Day / Week / Month buttons. Unlike a scroll-zoom they re-center on
  // today (the effect further down), since a preset is a jump, not a nudge.
  const recenterRef = useRef(true); // true once at mount: open on today
  const setPreset = (z: GanttZoom) => {
    if (ZOOM_PX_PER_DAY[z] === pxPerDay) {
      scrollToToday();
      return;
    }
    recenterRef.current = true;
    setPxPerDay(ZOOM_PX_PER_DAY[z]);
  };

  // The scroll area's visible size — the timeline and its grid stretch to
  // fill it rather than ending partway across (or down) the screen.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!scrollEl) return;
    const measure = () =>
      setViewport((prev) =>
        prev.width === scrollEl.clientWidth && prev.height === scrollEl.clientHeight
          ? prev
          : { width: scrollEl.clientWidth, height: scrollEl.clientHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [scrollEl]);

  // Same tree as TaskTable.tsx: tasks arrive in sort_order, children
  // keyed by parent_task_id, top level under null.
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, TaskRow[]>();
    for (const t of tasks) {
      const list = map.get(t.parent_task_id) ?? [];
      list.push(t);
      map.set(t.parent_task_id, list);
    }
    return map;
  }, [tasks]);

  // Every parent starts folded, like the list view. Lazy init is enough:
  // this component only mounts once the board has loaded.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(tasks.filter((t) => childrenByParent.has(t.id)).map((t) => t.id)),
  );
  const toggleCollapse = (key: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const parentIds = useMemo(() => tasks.filter((t) => childrenByParent.has(t.id)).map((t) => t.id), [tasks, childrenByParent]);
  const anyCollapsed = parentIds.some((id) => collapsedIds.has(id)) || (groups ?? []).some((g) => collapsedIds.has(groupKey(g.id)));
  // With groups this folds the boards too: one summary bar per board.
  const collapseAll = () => setCollapsedIds(new Set([...parentIds, ...(groups ?? []).map((g) => groupKey(g.id))]));
  const expandAll = () => setCollapsedIds(new Set());

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);

  const spans = useMemo(() => {
    const map = new Map<string, BarSpan>();
    for (const t of tasks) map.set(t.id, barSpan(t, adapter));
    return map;
  }, [tasks, adapter]);

  // A parent with no dates of its own still shows where its subtree sits:
  // its earliest descendant start to its latest descendant end.
  const rollups = useMemo(() => {
    const map = new Map<string, { startDay: number; endDay: number }>();
    const visit = (taskId: string): { startDay: number; endDay: number } | null => {
      let acc: { startDay: number; endDay: number } | null = null;
      for (const child of childrenByParent.get(taskId) ?? []) {
        const own = spans.get(child.id);
        const parts = [own && own.kind !== "none" ? own : null, visit(child.id)];
        for (const p of parts) {
          if (!p) continue;
          acc = acc
            ? { startDay: Math.min(acc.startDay, p.startDay), endDay: Math.max(acc.endDay, p.endDay) }
            : { startDay: p.startDay, endDay: p.endDay };
        }
      }
      if (acc) map.set(taskId, acc);
      return acc;
    };
    for (const t of childrenByParent.get(null) ?? []) visit(t.id);
    return map;
  }, [childrenByParent, spans]);

  const minDays = viewport.width > 0 ? Math.ceil(viewport.width / pxPerDay) : 0;
  const range = useMemo(
    () => fitRange(computeRange(Array.from(spans.values()), adapter), zoom, adapter, minDays),
    [spans, adapter, zoom, minDays],
  );
  const header = useMemo(() => headerRows(range, zoom, adapter), [range, zoom, adapter]);
  const weekends = useMemo(() => weekendDays(range, zoom, adapter), [range, zoom, adapter]);
  const trackWidth = (range.endDay - range.startDay + 1) * pxPerDay;
  const xOf = (day: number) => (day - range.startDay) * pxPerDay;

  // A group's span: its first start to its last end, over every task in it.
  const groupSpans = useMemo(() => {
    const map = new Map<string, { startDay: number; endDay: number }>();
    if (!groups || !groupOf) return map;
    for (const t of tasks) {
      const s = spans.get(t.id);
      if (!s || s.kind === "none") continue;
      const id = groupOf(t);
      const acc = map.get(id);
      map.set(id, acc ? { startDay: Math.min(acc.startDay, s.startDay), endDay: Math.max(acc.endDay, s.endDay) } : { startDay: s.startDay, endDay: s.endDay });
    }
    return map;
  }, [groups, groupOf, tasks, spans]);

  // The staircase: each list of siblings by start date (a parent by its
  // subtree's start), unscheduled last, otherwise in the board's own order.
  const rows = useMemo(() => {
    const startOf = (t: TaskRow) => {
      const own = spans.get(t.id);
      if (own && own.kind !== "none") return own.startDay;
      return rollups.get(t.id)?.startDay ?? Number.POSITIVE_INFINITY;
    };
    const ordered = (list: TaskRow[]) =>
      list
        .map((task, index) => ({ task, index, start: startOf(task) }))
        .sort((a, b) => (a.start === b.start ? a.index - b.index : a.start < b.start ? -1 : 1))
        .map((x) => x.task);
    const out: VisibleRow[] = [];
    const walk = (list: TaskRow[], depth: number) => {
      for (const task of ordered(list)) {
        const hasChildren = childrenByParent.has(task.id);
        out.push({ kind: "task", task, depth, hasChildren });
        if (hasChildren && !collapsedIds.has(task.id)) walk(childrenByParent.get(task.id) ?? [], depth + 1);
      }
    };
    const top = childrenByParent.get(null) ?? [];
    if (groups && groupOf) {
      for (const group of groups) {
        out.push({ kind: "group", group, count: tasks.filter((t) => groupOf(t) === group.id).length });
        if (!collapsedIds.has(groupKey(group.id))) walk(top.filter((t) => groupOf(t) === group.id), 0);
      }
    } else {
      walk(top, 0);
    }
    return out;
  }, [childrenByParent, collapsedIds, groups, groupOf, tasks, spans, rollups]);

  const datedCount = useMemo(
    () => Array.from(spans.values()).filter((s) => s.kind !== "none").length,
    [spans],
  );
  const undatedCount = tasks.length - datedCount;

  // The planned span: first start to last end, in working days (on a
  // template, in Days).
  const plan = useMemo(() => {
    let first: string | null = null;
    let last: string | null = null;
    for (const t of tasks) {
      if (!t.start_date || !t.due_date) continue;
      const s = t.start_date.slice(0, 10);
      const e = t.due_date.slice(0, 10);
      if (!first || s < first) first = s;
      if (!last || e > last) last = e;
    }
    if (!first || !last) return null;
    return {
      end: last,
      startDay: adapter.toDay(first),
      endDay: adapter.toDay(last),
      workingDays: workingDaysBetween(adapter.toDay(first), adapter.toDay(last), isTemplate),
    };
  }, [tasks, isTemplate, adapter]);

  // --- Critical path ("المسار الحرج") ------------------------------
  const [focus, setFocus] = useState(false);
  const critical = useMemo((): { ok: boolean; result: CriticalPathResult | null } | null => {
    if (!focus) return null;
    const toInput = (t: TaskRow): CriticalTask => ({
      id: t.id,
      parent_task_id: t.parent_task_id,
      start_date: t.start_date,
      due_date: t.due_date,
      start_lag_days: t.start_lag_days,
      frozen: isFinished(statusById.get(t.status_id)?.category),
    });
    // On the space chart each board is its own schedule: links between
    // boards never move dates, so they never make anything critical.
    const buckets = new Map<string, TaskRow[]>();
    for (const t of tasks) {
      const key = groups && groupOf ? groupOf(t) : "";
      const list = buckets.get(key) ?? [];
      list.push(t);
      buckets.set(key, list);
    }
    const merged: CriticalPathResult = { slack: new Map(), critical: new Set(), criticalLinks: new Set(), count: 0 };
    let ok = true;
    for (const list of buckets.values()) {
      const ids = new Set(list.map((t) => t.id));
      const pairs = dependencies.filter((d) => ids.has(d.blocking_task_id) && ids.has(d.blocked_task_id));
      const outcome = criticalPath(list.map(toInput), pairs, { plain: isTemplate });
      if (!outcome.ok) {
        ok = false;
        continue;
      }
      outcome.result.slack.forEach((v, k) => merged.slack.set(k, v));
      outcome.result.critical.forEach((k) => merged.critical.add(k));
      outcome.result.criticalLinks.forEach((k) => merged.criticalLinks.add(k));
      merged.count += outcome.result.count;
    }
    return { ok, result: ok || merged.slack.size > 0 ? merged : null };
  }, [focus, tasks, dependencies, groups, groupOf, statusById, isTemplate]);
  const criticalResult = critical?.result ?? null;
  const unit = isTemplate ? "يوم" : "يوم عمل";
  const focusOf = (taskId: string): "critical" | "dim" | null => {
    if (!criticalResult) return null;
    return criticalResult.critical.has(taskId) ? "critical" : "dim";
  };
  const focusNoteOf = (taskId: string): string | null => {
    if (!criticalResult) return null;
    if (criticalResult.critical.has(taskId)) return "حرجة — أي تأخير فيها يؤخر النهاية";
    const slack = criticalResult.slack.get(taskId);
    return slack !== undefined ? `يمكن أن تتأخر ${slack} ${unit} دون تأخير النهاية` : null;
  };

  // Hovering a bar lights up its whole chain: everything it waits for and
  // everything that waits for it.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const chain = useMemo(() => {
    if (!hoveredId) return null;
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
  }, [hoveredId, dependencies]);
  const lagById = useMemo(() => new Map(tasks.map((t) => [t.id, t.start_lag_days ?? 0])), [tasks]);

  // Waits on a task this chart doesn't show (another board): the only waits
  // that keep an icon — every other link is drawn.
  const externalWaits = useMemo(
    () => externalWaitIds(tasks, dependencies, dependencyFlags, (id) => statusById.get(id)?.category),
    [tasks, dependencies, dependencyFlags, statusById],
  );
  const titleById = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);

  // Drag-to-link: from a bar's end dot (GanttBar's onLinkStart) to any
  // other row — the whole row is the target, not just its bar. Points
  // are in the arrows SVG's own coordinates.
  const canLink = !readOnly && !!onLink;
  const arrowsRef = useRef<SVGSVGElement>(null);
  const [linking, setLinking] = useState<{
    fromId: string;
    x0: number;
    y0: number;
    x: number;
    y: number;
    targetId: string | null;
  } | null>(null);
  const linkingRef = useRef(linking);
  linkingRef.current = linking;
  const linkActive = !!linking;
  useEffect(() => {
    if (!linkActive) return;
    const move = (e: PointerEvent) => {
      const box = arrowsRef.current?.getBoundingClientRect();
      if (!box) return;
      const row = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-gantt-row]");
      const hit = row?.getAttribute("data-gantt-row") ?? null;
      setLinking((prev) =>
        prev && { ...prev, x: e.clientX - box.left, y: e.clientY - box.top, targetId: hit === prev.fromId ? null : hit },
      );
    };
    const up = () => {
      const done = linkingRef.current;
      setLinking(null);
      if (done?.targetId) onLink?.({ blocking_task_id: done.fromId, blocked_task_id: done.targetId });
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
  }, [linkActive, onLink]);
  const startLink = (fromId: string) => (e: ReactPointerEvent<HTMLElement>) => {
    const box = arrowsRef.current?.getBoundingClientRect();
    if (!box) return;
    const dot = e.currentTarget.getBoundingClientRect();
    const x0 = dot.left + dot.width / 2 - box.left;
    const y0 = dot.top + dot.height / 2 - box.top;
    setLinking({ fromId, x0, y0, x: x0, y: y0, targetId: null });
  };

  // Click a link line: a small menu to reverse or remove it.
  const [linkMenu, setLinkMenu] = useState<{ x: number; y: number; pair: DependencyPair } | null>(null);
  const [hoveredArrow, setHoveredArrow] = useState<string | null>(null);

  // Dependency arrows, finish → start: from the blocker's end edge (its LEFT
  // edge, RTL) to the blocked task's start edge (its RIGHT edge). Only edges
  // with both ends on visible rows are drawn — a blocker on another board is
  // already shown by the stop icon. Red when the blocked task starts before
  // its blocker ends.
  const arrows = useMemo(() => {
    const rowIndexById = new Map<string, number>();
    rows.forEach((r, i) => {
      if (r.kind === "task") rowIndexById.set(r.task.id, i);
    });
    const x = (day: number) => (day - range.startDay) * pxPerDay;
    const spanOf = (id: string) => {
      const own = spans.get(id);
      if (own && own.kind !== "none") return own;
      const rollup = rollups.get(id);
      return rollup ? { ...rollup, kind: "range" as const } : null;
    };

    const out: {
      key: string;
      pair: DependencyPair;
      d: string;
      conflict: boolean;
      lag: number;
      label: { x: number; y: number } | null;
      inChain: boolean;
    }[] = [];
    // Several links out of one bar leave it a few pixels apart.
    const visible = dependencies.filter(
      (d) => rowIndexById.has(d.blocking_task_id) && rowIndexById.has(d.blocked_task_id) && d.blocking_task_id !== d.blocked_task_id,
    );
    const outIndex = new Map<string, number>();
    const byBlocker = new Map<string, DependencyPair[]>();
    for (const d of visible) byBlocker.set(d.blocking_task_id, [...(byBlocker.get(d.blocking_task_id) ?? []), d]);
    for (const list of byBlocker.values()) {
      list
        .slice()
        .sort((p, q) => (rowIndexById.get(p.blocked_task_id) as number) - (rowIndexById.get(q.blocked_task_id) as number))
        .forEach((d, i) => outIndex.set(linkKey(d), i));
    }
    const barTop = (ROW_H - BAR_H) / 2;

    for (const dep of visible) {
      const from = rowIndexById.get(dep.blocking_task_id) as number;
      const to = rowIndexById.get(dep.blocked_task_id) as number;
      const a = spanOf(dep.blocking_task_id);
      const b = spanOf(dep.blocked_task_id);
      if (!a || !b || from === to) continue;

      // SVG coordinates run left → right; convert from right-offsets.
      const aStart = trackWidth - x(a.startDay);
      const x1 = trackWidth - (x(a.startDay) + Math.max((a.endDay - a.startDay + 1) * pxPerDay, MIN_BAR_W));
      const x2 = trackWidth - x(b.startDay);
      const y2 = to * ROW_H + ROW_H / 2;
      const down = to > from;
      // Construction Flow's line: out of the blocker just inside its end,
      // straight down (or up) to the waiting task's row, then across into
      // its start.
      const xv = Math.min(x1 + 10 + (outIndex.get(linkKey(dep)) ?? 0) * 6, aStart - 4);
      let points: [number, number][];
      if (x2 <= xv - ARROW_STUB) {
        points = [[xv, from * ROW_H + (down ? barTop + BAR_H : barTop)], [xv, y2], [x2, y2]];
      } else {
        // The waiting task starts before the blocker ends (a conflict):
        // out of the blocker's end, along the row boundary next to the
        // waiting row, and back in from its start side.
        const y1 = from * ROW_H + ROW_H / 2;
        const midY = down ? to * ROW_H : (to + 1) * ROW_H;
        points = [[x1, y1], [x1 - ARROW_STUB, y1], [x1 - ARROW_STUB, midY], [x2 + ARROW_STUB, midY], [x2 + ARROW_STUB, y2], [x2, y2]];
      }
      const lag = lagById.get(dep.blocked_task_id) ?? 0;
      out.push({
        key: linkKey(dep),
        pair: { blocking_task_id: dep.blocking_task_id, blocked_task_id: dep.blocked_task_id },
        d: roundedPath(points, LINK_RADIUS),
        conflict: b.startDay < a.endDay,
        lag,
        // the wait label sits on the last stretch, just before the task starts
        label: lag > 0 && points.length === 3 && xv - x2 > 40 ? { x: (xv + x2) / 2, y: y2 - 4 } : null,
        inChain: !!chain && chain.has(dep.blocking_task_id) && chain.has(dep.blocked_task_id),
      });
    }
    return out;
  }, [rows, dependencies, spans, rollups, trackWidth, range, pxPerDay, lagById, chain]);

  const scrollToToday = () =>
    todayRef.current?.scrollIntoView({ inline: "center", block: "nearest" });

  // Open on today rather than on the start of the range, and re-center
  // after a preset button — but not after a scroll-zoom or "fit", which
  // place a chosen day instead (below). scrollIntoView rather than setting
  // scrollLeft: in an RTL scroller scrollLeft runs negative, which is easy
  // to get backwards.
  useEffect(() => {
    if (!recenterRef.current) return;
    recenterRef.current = false;
    scrollToToday();
  }, [pxPerDay]);

  // --- Zoom that keeps a day in place -------------------------------------
  // Ctrl/Cmd+wheel anywhere on the chart (Chromium delivers a trackpad pinch
  // as Ctrl+wheel), or a plain wheel over the date header. Anything else is
  // left alone, so scrolling over the rows still scrolls them.
  //
  // A native non-passive listener, not React's onWheel (passive, so its
  // preventDefault is silently ignored). It is attached once, so it reads
  // the current layout through `latest`.
  const latest = useRef({ rangeStart: 0, pxPerDay });
  const pxTarget = useRef(pxPerDay); // where zoom is headed, ahead of React's render
  // The day to keep in place, and how far from the scroller's right edge it
  // should sit. Held (not recomputed) until the render lands, so several
  // wheel ticks in one frame share one anchor. "Fit" sets it too.
  const anchorRef = useRef<{ day: number; fromRight: number } | null>(null);

  useLayoutEffect(() => {
    latest.current = { rangeStart: range.startDay, pxPerDay };
  });

  useEffect(() => {
    if (!scrollEl) return;
    const onWheel = (e: WheelEvent) => {
      const overHeader = (e.target as HTMLElement).closest("[data-gantt-header]") !== null;
      if (!e.ctrlKey && !e.metaKey && !overHeader) return;
      e.preventDefault();

      // deltaMode 1 = lines (Firefox-style); 16px a line. Up / pinch-out
      // (negative deltaY) zooms in.
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const factor = clamp(Math.exp(-delta * 0.002), 0.8, 1.25);
      const next = clamp(pxTarget.current * factor, MIN_PX_PER_DAY, MAX_PX_PER_DAY);
      if (next === pxTarget.current) return;

      if (!anchorRef.current) {
        const current = latest.current;
        const fromRight = scrollEl.getBoundingClientRect().right - e.clientX;
        // scrollLeft is 0 at the right edge and negative scrolling left
        // (an RTL scroller in Electron's Chromium).
        anchorRef.current = {
          day: current.rangeStart + (-scrollEl.scrollLeft + fromRight) / current.pxPerDay,
          fromRight,
        };
      }
      pxTarget.current = next;
      setPxPerDay(next);
    };
    scrollEl.addEventListener("wheel", onWheel, { passive: false });
    return () => scrollEl.removeEventListener("wheel", onWheel);
  }, [scrollEl]);

  // After the new scale has rendered, scroll so the anchored day sits where
  // it should. Placed by absolute day, not by offset: a change of header
  // granularity re-snaps the range (fitRange), moving where it starts.
  const placeAnchor = () => {
    const anchor = anchorRef.current;
    anchorRef.current = null;
    if (!anchor || !scrollEl) return;
    scrollEl.scrollLeft = -((anchor.day - latest.current.rangeStart) * latest.current.pxPerDay - anchor.fromRight);
  };
  useLayoutEffect(() => {
    pxTarget.current = pxPerDay;
    placeAnchor();
  }, [pxPerDay]);

  // "ملاءمة الكل": the whole plan across the visible width, its start at
  // the right edge.
  const fitAll = () => {
    let first = Number.POSITIVE_INFINITY;
    let last = Number.NEGATIVE_INFINITY;
    for (const s of spans.values()) {
      if (s.kind === "none") continue;
      first = Math.min(first, s.startDay);
      last = Math.max(last, s.endDay);
    }
    if (!Number.isFinite(first) || viewport.width === 0) return;
    const next = clamp((viewport.width - FIT_MARGIN * 2) / (last - first + 1), MIN_PX_PER_DAY, MAX_PX_PER_DAY);
    anchorRef.current = { day: first, fromRight: FIT_MARGIN };
    if (next === pxPerDay) {
      placeAnchor();
      return;
    }
    pxTarget.current = next;
    setPxPerDay(next);
  };

  const commit = (taskId: string, change: BarChange) =>
    onChangeDates(taskId, {
      ...(change.startDay !== undefined ? { startDate: adapter.fromDay(change.startDay) } : {}),
      ...(change.endDay !== undefined ? { dueDate: adapter.fromDay(change.endDay) } : {}),
      ...(change.durationDays !== undefined ? { durationDays: change.durationDays } : {}),
    });
  const describe = (s: number, e: number) => spanLabel(s, e, adapter);
  const subtitle = (s: number, e: number, days: number | null) =>
    `${spanShort(s, e, adapter)} · ${daysShort(days ?? workingDaysBetween(s, e, isTemplate))}`;
  const describeFloor = (day: number) => `لا يمكن أن تبدأ قبل ${spanLabel(day, day, adapter)} — مرتبطة بمهام سابقة`;

  const today = adapter.today;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {onAddTask && (
            <button
              onClick={onAddTask}
              className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              إضافة مهمة
            </button>
          )}
          <div
            className="flex overflow-hidden rounded-md border border-gray-200"
            title="Ctrl + عجلة التمرير للتكبير والتصغير"
          >
            {ZOOMS.map((z) => (
              <button
                key={z}
                onClick={() => setPreset(z)}
                className={`px-2.5 py-1 text-xs ${
                  zoom === z ? "bg-primary-superLight font-medium text-primary" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {ZOOM_LABELS[z]}
              </button>
            ))}
          </div>
          {today !== null && (
            <ToolbarButton onClick={scrollToToday}>اليوم</ToolbarButton>
          )}
          <ToolbarButton onClick={fitAll} title="عرض الخطة كاملة">
            <Maximize2 className="h-3.5 w-3.5" />
            ملاءمة الكل
          </ToolbarButton>
          <ToolbarButton
            onClick={() => setFocus((v) => !v)}
            active={focus}
            title="المهام التي يؤخر أي تأخير فيها نهاية اللوحة"
          >
            <Crosshair className="h-3.5 w-3.5" />
            المسار الحرج
          </ToolbarButton>
          {(parentIds.length > 0 || (groups?.length ?? 0) > 0) && (
            <ToolbarButton onClick={anyCollapsed ? expandAll : collapseAll}>
              {anyCollapsed ? <ChevronsDown className="h-3.5 w-3.5" /> : <ChevronsUp className="h-3.5 w-3.5" />}
              {anyCollapsed ? "توسيع الكل" : "طي الكل"}
            </ToolbarButton>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {critical &&
            (critical.ok ? (
              <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">
                {criticalCount(criticalResult?.count ?? 0)} — أي تأخير فيها يؤخر النهاية
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                {criticalResult ? "تعذّر حساب بعض اللوحات — " : "تعذّر حساب المسار الحرج — "}أعد تحميل الصفحة
              </span>
            ))}
          <span>
            {tasksCount(tasks.length)}
            {plan &&
              (isTemplate
                ? ` · ${plan.workingDays} يوم · آخر يوم: ${dayOffsetLabel(plan.endDay)}`
                : ` · ${plan.workingDays} يوم عمل · النهاية ${formatDayWithWeekday(plan.end)}`)}
            {undatedCount > 0 && ` · ${undatedCount} غير مجدولة`}
          </span>
        </div>
      </div>

      {tasks.length === 0 && !groups?.length ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
          {emptyLabel}
        </div>
      ) : (
        <div ref={setScrollEl} className="flex-1 overflow-auto">
          <div className="relative" style={{ width: trackWidth }}>
            {/* Date header — a plain wheel over it zooms (see the wheel
                listener); data-gantt-header is what that looks for. */}
            <div
              data-gantt-header
              className="sticky top-0 z-20 border-b border-gray-200 bg-white"
              style={{ width: trackWidth, height: HEADER_H }}
            >
              {header.top.map((c) => {
                const width = (c.endDay - c.startDay) * pxPerDay;
                return (
                  <div
                    key={`t${c.startDay}`}
                    className="absolute top-0 flex items-center border-l border-gray-200 px-2 text-xs font-semibold text-gray-700"
                    style={{ right: xOf(c.startDay), width, height: HEADER_ROW_H }}
                  >
                    {/* A sliver of a month at the range's edge: no label
                        rather than a clipped one. Sticky, so the label stays
                        in view while its month is scrolled partly away. */}
                    {width >= 40 && (
                      <span className="sticky right-1.5 max-w-full truncate">{c.label}</span>
                    )}
                  </div>
                );
              })}
              {header.bottom.map((c) => {
                const isCurrent = today !== null && today >= c.startDay && today < c.endDay;
                return (
                  <div
                    key={`b${c.startDay}`}
                    className={`absolute flex items-center justify-center overflow-hidden whitespace-nowrap border-l border-t border-gray-100 text-[11px] ${
                      isCurrent
                        ? "bg-blue-50 font-semibold text-blue-600"
                        : c.weekend
                          ? "bg-gray-50 text-gray-400"
                          : "text-gray-500"
                    }`}
                    style={{
                      top: HEADER_ROW_H,
                      right: xOf(c.startDay),
                      width: (c.endDay - c.startDay) * pxPerDay,
                      height: HEADER_ROW_H,
                    }}
                  >
                    {c.label}
                  </div>
                );
              })}
              {today !== null && (
                <div
                  ref={todayRef}
                  className={`pointer-events-none absolute w-0.5 ${zoom === "day" ? "" : "bg-blue-400"}`}
                  style={{ right: xOf(today) + pxPerDay / 2 - 1, top: HEADER_ROW_H, height: HEADER_ROW_H }}
                />
              )}
            </div>

            {/* Body — at least as tall as the visible area, so the grid
                doesn't stop under the last row. */}
            <div
              className="relative"
              style={{ height: Math.max(rows.length * ROW_H, viewport.height - HEADER_H) }}
            >
              {/* Friday shading, grid lines, today and finish lines — behind
                  the rows. Period boundaries (week/month) are darker than the
                  per-cell lines so the scale reads at a glance. */}
              <div className="pointer-events-none absolute inset-0">
                {weekends.map((day) => (
                  <div key={`w${day}`} className="absolute inset-y-0 bg-gray-50" style={{ right: xOf(day), width: pxPerDay }} />
                ))}
                {header.bottom.map((c) => (
                  <div
                    key={`b${c.startDay}`}
                    className="absolute inset-y-0 border-l border-gray-100"
                    style={{ right: xOf(c.startDay), width: (c.endDay - c.startDay) * pxPerDay }}
                  />
                ))}
                {header.top.map((c) => (
                  <div
                    key={`t${c.startDay}`}
                    className="absolute inset-y-0 border-l border-gray-200"
                    style={{ right: xOf(c.startDay), width: (c.endDay - c.startDay) * pxPerDay }}
                  />
                ))}
                {today !== null && (
                  <div
                    className="absolute inset-y-0 border-r-2 border-dashed border-blue-300"
                    style={{ right: xOf(today) + pxPerDay / 2 - 1 }}
                  />
                )}
                {/* finish line: the end of the last task */}
                {plan && (
                  <div
                    className="absolute inset-y-0 border-r-2 border-emerald-400/70"
                    style={{ right: xOf(plan.endDay + 1) }}
                    title={
                      isTemplate
                        ? `آخر يوم: ${dayOffsetLabel(plan.endDay)}`
                        : `النهاية المخططة ${formatDayWithWeekday(dayString(plan.endDay))}`
                    }
                  />
                )}
              </div>

              {rows.map((row) => {
                if (row.kind === "group") {
                  const key = groupKey(row.group.id);
                  return (
                    <GroupBand
                      key={key}
                      group={row.group}
                      count={row.count}
                      span={groupSpans.get(row.group.id) ?? null}
                      collapsed={collapsedIds.has(key)}
                      onToggle={() => toggleCollapse(key)}
                      onAdd={onAddToGroup ? () => onAddToGroup(row.group.id) : undefined}
                      trackWidth={trackWidth}
                      xOf={xOf}
                      pxPerDay={pxPerDay}
                      describe={(s, e) => `${spanShort(s, e, adapter)} · ${daysShort(workingDaysBetween(s, e, isTemplate))}`}
                    />
                  );
                }
                const { task, hasChildren } = row;
                const own = spans.get(task.id);
                const rollup = rollups.get(task.id);
                const span: BarSpan | null =
                  own && own.kind !== "none"
                    ? own
                    : rollup
                      ? { kind: "range", startDay: rollup.startDay, endDay: rollup.endDay, hasStart: false, hasDue: false }
                      : null;
                const status = statusById.get(task.status_id);
                const fold = hasChildren ? { collapsed: collapsedIds.has(task.id), onToggle: () => toggleCollapse(task.id) } : null;
                // The server's summary (dates = span of scheduled subtasks), or
                // a parent drawn from its subtasks because it has no dates of
                // its own. A parent whose subtasks are all unscheduled is an
                // ordinary task and can be dragged.
                const summary = task.is_summary || !(own && own.kind !== "none");
                return (
                  <div
                    key={task.id}
                    data-gantt-row={task.id}
                    className={`relative border-b border-gray-50 hover:bg-gray-50/60 ${linking?.targetId === task.id ? "bg-blue-50" : ""}`}
                    style={{ height: ROW_H, width: trackWidth }}
                  >
                    {span ? (
                      <GanttBar
                        span={span}
                        rangeStart={range.startDay}
                        pxPerDay={pxPerDay}
                        title={task.title}
                        subtitle={subtitle}
                        describe={describe}
                        color={status?.color ?? DEFAULT_STATUS_COLOR}
                        highlight={highlights?.get(task.id) ?? null}
                        done={isFinished(status?.category)}
                        overdue={task.is_overdue}
                        dependency={dependencyFlags.get(task.id)}
                        externalWait={externalWaits.has(task.id)}
                        badge={badges.get(task.task_type_id) ?? null}
                        focus={focusOf(task.id)}
                        focusNote={focusNoteOf(task.id)}
                        onOpen={() => onOpenTask(task.id)}
                        onCommit={(change) => commit(task.id, change)}
                        readOnly={readOnly}
                        scheduling={
                          summary
                            ? null
                            : {
                                durationDays: task.duration_days ?? workingDaysBetween(span.startDay, span.endDay, isTemplate),
                                earliestDay: task.earliest_start ? adapter.toDay(task.earliest_start) : null,
                                plain: isTemplate,
                              }
                        }
                        summary={summary}
                        fold={fold}
                        describeFloor={describeFloor}
                        onHover={(on) => setHoveredId(on ? task.id : null)}
                        onLinkStart={canLink && !linking ? startLink(task.id) : undefined}
                        linkTarget={linking?.targetId === task.id}
                      />
                    ) : (
                      <UndatedRow
                        title={task.title}
                        fold={fold}
                        rangeStart={range.startDay}
                        pxPerDay={pxPerDay}
                        readOnly={readOnly}
                        onOpen={() => onOpenTask(task.id)}
                        onPick={(day) => onChangeDates(task.id, { startDate: adapter.fromDay(day) })}
                      />
                    )}
                  </div>
                );
              })}

              {/* Dependency arrows — above the bars. */}
              <svg
                ref={arrowsRef}
                className="pointer-events-none absolute right-0 top-0 z-[1]"
                width={trackWidth}
                height={rows.length * ROW_H}
              >
                <defs>
                  <marker id="gantt-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,0 L6,3 L0,6 z" fill="#9CA3AF" />
                  </marker>
                  <marker id="gantt-arrow-red" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,0 L6,3 L0,6 z" fill="#DC2626" />
                  </marker>
                  <marker id="gantt-arrow-chain" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,0 L6,3 L0,6 z" fill="#2563EB" />
                  </marker>
                </defs>
                {arrows.map((a) => {
                  const onPath = !!criticalResult && criticalResult.criticalLinks.has(a.key);
                  const dim = (!!chain && !a.inChain) || (!!criticalResult && !onPath);
                  const hot = hoveredArrow === a.key;
                  const red = a.conflict || onPath;
                  const stroke = red ? "#DC2626" : a.inChain || hot ? "#2563EB" : "#9CA3AF";
                  return (
                    <g key={a.key} opacity={dim ? 0.25 : 1}>
                      <path
                        d={a.d}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={hot ? 2.5 : a.inChain || onPath ? 2 : 1.5}
                        strokeDasharray={a.lag > 0 ? "4 3" : undefined}
                        strokeLinejoin="round"
                        markerEnd={`url(#${red ? "gantt-arrow-red" : a.inChain ? "gantt-arrow-chain" : "gantt-arrow"})`}
                      />
                      {a.label && (
                        <text x={a.label.x} y={a.label.y} textAnchor="middle" fontSize={10} fill="#B45309">
                          انتظار {a.lag}
                        </text>
                      )}
                      {/* a wide invisible stroke to click — the drawn line is too thin to hit */}
                      {!readOnly && (onUnlink || onReverseLink) && !linking && (
                        <path
                          d={a.d}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={10}
                          style={{ pointerEvents: "stroke", cursor: "pointer" }}
                          onMouseEnter={() => setHoveredArrow(a.key)}
                          onMouseLeave={() => setHoveredArrow(null)}
                          onClick={(e) => setLinkMenu({ x: e.clientX, y: e.clientY, pair: a.pair })}
                        />
                      )}
                    </g>
                  );
                })}
                {linking && (
                  <g pointerEvents="none">
                    <line
                      x1={linking.x0}
                      y1={linking.y0}
                      x2={linking.x}
                      y2={linking.y}
                      stroke="#2563EB"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                    />
                    <circle cx={linking.x} cy={linking.y} r={4} fill="#2563EB" />
                  </g>
                )}
              </svg>
            </div>
          </div>
        </div>
      )}
      <LinkMenu
        menu={linkMenu}
        titleById={titleById}
        onClose={() => setLinkMenu(null)}
        onUnlink={onUnlink}
        onReverse={onReverseLink}
      />
    </div>
  );
}

/** The menu a clicked link line opens — shared with the link diagram. */
export function LinkMenu({
  menu,
  titleById,
  onClose,
  onUnlink,
  onReverse,
}: {
  menu: { x: number; y: number; pair: DependencyPair } | null;
  titleById: Map<string, string>;
  onClose: () => void;
  onUnlink?: (pair: DependencyPair) => void;
  onReverse?: (pair: DependencyPair) => void;
}) {
  return (
    <PointMenu point={menu} onClose={onClose} width={240} className="space-y-1.5 p-2">
      {menu && (
        <>
          <div className="text-xs text-gray-600">
            <span className="font-semibold">{titleById.get(menu.pair.blocked_task_id)}</span> تبدأ بعد انتهاء{" "}
            <span className="font-semibold">{titleById.get(menu.pair.blocking_task_id)}</span>
          </div>
          {onReverse && (
            <button
              type="button"
              onClick={() => {
                onReverse(menu.pair);
                onClose();
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              عكس الاتجاه
            </button>
          )}
          {onUnlink && (
            <button
              type="button"
              onClick={() => {
                onUnlink(menu.pair);
                onClose();
              }}
              className="w-full rounded-md bg-red-50 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
            >
              إزالة الربط
            </button>
          )}
        </>
      )}
    </PointMenu>
  );
}

function ToolbarButton({
  onClick,
  active = false,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
        active ? "border-red-200 bg-red-50 font-medium text-red-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

/** A board's band on the space chart: its name (opens the board), task
 * count, "+", and a bar from its first start to its last end. */
function GroupBand({
  group,
  count,
  span,
  collapsed,
  onToggle,
  onAdd,
  trackWidth,
  xOf,
  pxPerDay,
  describe,
}: {
  group: GanttGroup;
  count: number;
  span: { startDay: number; endDay: number } | null;
  collapsed: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  trackWidth: number;
  xOf: (day: number) => number;
  pxPerDay: number;
  describe: (startDay: number, endDay: number) => string;
}) {
  return (
    <div className="relative flex items-center border-b border-gray-200 bg-gray-100/80" style={{ height: ROW_H, width: trackWidth }}>
      {span && (
        <div
          className="pointer-events-none absolute rounded border-x-[3px] border-gray-700 bg-gray-600/15"
          style={{ right: xOf(span.startDay), width: Math.max((span.endDay - span.startDay + 1) * pxPerDay, MIN_BAR_W), top: ROW_H / 2 - 5, height: 10 }}
        />
      )}
      {/* sticky: the board's name stays at the visible right edge */}
      <div className="sticky right-0 z-[2] flex items-center gap-1.5 rounded-l-md bg-gray-100 px-2 py-1 shadow-sm">
        <button onClick={onToggle} className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-200" title={collapsed ? "توسيع" : "طي"}>
          {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {group.href ? (
          <Link to={group.href} className="truncate text-sm font-semibold text-gray-800 hover:text-primary hover:underline" title="فتح اللوحة">
            {group.label}
          </Link>
        ) : (
          <span className="truncate text-sm font-semibold text-gray-800">{group.label}</span>
        )}
        <span className="shrink-0 text-xs text-gray-400">({count})</span>
        {span && <span className="shrink-0 text-xs text-gray-500">· {describe(span.startDay, span.endDay)}</span>}
        {onAdd && (
          <button
            onClick={onAdd}
            className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
            title="إضافة مهمة إلى هذه اللوحة"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** A task with no dates: its name at the visible right edge, and hovering
 * the row shows which day a click would give it as a start. */
function UndatedRow({
  title,
  fold,
  rangeStart,
  pxPerDay,
  readOnly,
  onOpen,
  onPick,
}: {
  title: string;
  fold: { collapsed: boolean; onToggle: () => void } | null;
  rangeStart: number;
  pxPerDay: number;
  readOnly: boolean;
  onOpen: () => void;
  onPick: (day: number) => void;
}) {
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  // RTL: day 0 of the range is at the track's right edge.
  const dayAt = (e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return rangeStart + Math.floor((rect.right - e.clientX) / pxPerDay);
  };
  return (
    <>
      {!readOnly && (
        <div
          className="absolute inset-0 cursor-pointer"
          onMouseMove={(e) => setHoverDay(dayAt(e))}
          onMouseLeave={() => setHoverDay(null)}
          onClick={(e) => onPick(dayAt(e))}
          title="انقر لتحديد تاريخ البدء"
        >
          {hoverDay !== null && (
            <div
              className="pointer-events-none absolute flex items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-100 text-gray-400"
              style={{ right: (hoverDay - rangeStart) * pxPerDay, width: Math.max(pxPerDay, MIN_BAR_W), top: 10, height: ROW_H - 20 }}
            >
              {pxPerDay >= 14 && <Plus className="h-3 w-3" />}
            </div>
          )}
        </div>
      )}
      <div className="pointer-events-none sticky right-2 flex h-full w-max items-center">
        <span className="pointer-events-auto relative z-[2] flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white/90 px-2 py-1 text-xs text-gray-500">
          {fold && <FoldButton fold={fold} />}
          <button type="button" onClick={onOpen} className="max-w-[240px] truncate font-medium text-gray-700 hover:underline">
            {title}
          </button>
          <span className="shrink-0">· غير مجدولة</span>
        </span>
      </div>
    </>
  );
}
