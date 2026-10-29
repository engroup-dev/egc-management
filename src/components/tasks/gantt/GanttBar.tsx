import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, ChevronDown, ChevronLeft } from "lucide-react";
import Tooltip from "../../ui/Tooltip";
import { WAIT_STYLE, holdingLabel, waitingLabel } from "../board/DependencyBadges";
import type { DependencyFlags } from "../../../hooks/tasks/dependencyFlags";
import type { TypeBadge } from "../board/taskTypeBadge";
import type { BarSpan } from "./ganttScale";
import { addWorkingDays, workingDayOnOrAfter, workingDaysBetween } from "../board/workingDays";

// One task's bar on the Gantt (TaskGantt.tsx). Redesigned 2026-10-17 after
// Construction Flow's "Days view" (plans/construction-flow-comparison/): there
// is no side panel any more, so the bar carries the task — title on the first
// line, dates and days on the second, the task type's badge at its end. A bar
// too short for that puts the same text just past its end.
//
// The page is dir="rtl", so time runs right → left: a bar's RIGHT edge is its
// start and its LEFT edge its end, and dragging leftward moves it later.
//
// Pointer events with capture on the bar itself (not native HTML5 drag): a
// resize needs continuous movement and no drag ghost. The bar previews the
// drag locally — its second line shows the new dates as you drag — and
// reports once, on release; the mutation behind onCommit is optimistic.
//
// A task is a start plus a number of working days (`scheduling`): the drag
// snaps to working days (Friday skipped; on a template every Day counts), a
// linked task can't be dragged before its predecessors end (`earliestDay`),
// and what's reported is what the gesture changed — move = new start (same
// days), right edge = new start and days, left edge = new days. The server
// works out the due date and moves the tasks linked after it. A summary (a
// parent with subtasks) isn't draggable; its chevron folds its subtasks.

export const ROW_H = 52;
export const BAR_H = 36;
/** Narrower than this and the resize handles would cover the whole bar. */
const RESIZE_MIN_W = 16;
/** A bar is never drawn thinner than this, even at month zoom (2px/day). */
export const MIN_BAR_W = 6;
/** Narrower than this, the text goes beside the bar instead of inside. */
const LABEL_INSIDE_MIN_W = 90;
/** Pointer travel below this is a click (open the task), not a drag. */
const CLICK_SLOP = 3;
/** Inside text stays this far from the scroller's right edge when the bar's
 * start is scrolled out of view. */
const LABEL_INSET = 6;

type DragMode = "move" | "start" | "end";

interface DragState {
  mode: DragMode;
  originX: number;
  delta: number;
  moved: boolean;
}

/** Which DB dates to write, as day indexes — a key is only present when
 * that column should change. A scheduled bar reports durationDays
 * (working days) instead of endDay. */
export interface BarChange {
  startDay?: number;
  endDay?: number;
  durationDays?: number;
}

/** A task: start + working days, maybe linked. */
export interface BarScheduling {
  durationDays: number;
  /** tasks.earliest_start as a day index; null = not linked. */
  earliestDay: number | null;
  /** A template board: every Day counts (no Friday). */
  plain?: boolean;
}

interface ScheduledDrag {
  startDay: number;
  endDay: number;
  durationDays: number;
  /** The start was held back at earliestDay. */
  clamped: boolean;
}

function applyScheduledDrag(span: BarSpan, sched: BarScheduling, mode: DragMode, delta: number): ScheduledDrag {
  const floor = sched.earliestDay;
  const plain = !!sched.plain;
  const clampStart = (day: number) => {
    const snapped = workingDayOnOrAfter(day, plain);
    return floor !== null && snapped < floor ? { day: floor, clamped: true } : { day: snapped, clamped: false };
  };
  if (mode === "move") {
    const { day, clamped } = clampStart(span.startDay + delta);
    return { startDay: day, endDay: addWorkingDays(day, sched.durationDays, plain), durationDays: sched.durationDays, clamped };
  }
  if (mode === "start") {
    const { day, clamped } = clampStart(Math.min(span.startDay + delta, span.endDay));
    const startDay = Math.min(day, span.endDay);
    const durationDays = Math.max(1, workingDaysBetween(startDay, span.endDay, plain));
    return { startDay, endDay: addWorkingDays(startDay, durationDays, plain), durationDays, clamped };
  }
  const durationDays = Math.max(1, workingDaysBetween(span.startDay, Math.max(span.endDay + delta, span.startDay), plain));
  return { startDay: span.startDay, endDay: addWorkingDays(span.startDay, durationDays, plain), durationDays, clamped: false };
}

function scheduledChange(span: BarSpan, sched: BarScheduling, mode: DragMode, next: ScheduledDrag): BarChange {
  if (mode === "move") return next.startDay !== span.startDay ? { startDay: next.startDay } : {};
  if (mode === "end") return next.durationDays !== sched.durationDays ? { durationDays: next.durationDays } : {};
  return next.startDay !== span.startDay || next.durationDays !== sched.durationDays
    ? { startDay: next.startDay, durationDays: next.durationDays }
    : {};
}

/** The folding control on a parent's bar (or its unscheduled row). */
export interface BarFold {
  collapsed: boolean;
  onToggle: () => void;
}

interface GanttBarProps {
  span: BarSpan;
  rangeStart: number;
  pxPerDay: number;
  title: string;
  /** The second line for a (possibly mid-drag) range: "17/10 – 19/10 · 3 أيام". */
  subtitle: (startDay: number, endDay: number, days: number | null) => string;
  /** "من ... إلى ..." for the tooltip. */
  describe: (startDay: number, endDay: number) => string;
  /** The status colour — the bar's tint and its start edge. */
  color: string;
  /** A highlight colour (the diagram's 🖍️), shown as the bar's fill. */
  highlight?: string | null;
  /** done/closed status category — drawn grey with a tick. */
  done: boolean;
  overdue: boolean;
  /** What it waits on / what waits on it — named in the tooltip. */
  dependency?: DependencyFlags;
  /** Waits on an open task this chart doesn't draw (another board): the
   * stop icon before the title. Links drawn on the chart need no icon. */
  externalWait?: boolean;
  /** The task type's badge. */
  badge?: TypeBadge | null;
  /** Critical-path view: outlined red, or faded. */
  focus?: "critical" | "dim" | null;
  /** Critical-path view: "حرجة …" / "يمكن أن تتأخر …", added to the tooltip. */
  focusNote?: string | null;
  onOpen: () => void;
  onCommit: (change: BarChange) => void;
  /** No edit rights: the bar can be clicked open but never dragged. */
  readOnly?: boolean;
  /** Start + working days, respecting links. */
  scheduling?: BarScheduling | null;
  /** A parent with subtasks: its span over them, not draggable. */
  summary?: boolean;
  /** Parents: the chevron that folds their subtasks. */
  fold?: BarFold | null;
  /** "لا يمكن أن تبدأ قبل …" for a drag held back by the task's links. */
  describeFloor?: (day: number) => string;
  /** Hovering the bar highlights its chain of links. */
  onHover?: (hovering: boolean) => void;
  /** Editable: hovering shows a dot at the bar's end; dragging it onto
   * another row makes that task start after this one (TaskGantt). */
  onLinkStart?: (e: ReactPointerEvent<HTMLElement>) => void;
  /** The row a link drag is over — outlined. */
  linkTarget?: boolean;
}

export default function GanttBar({
  span,
  rangeStart,
  pxPerDay,
  title,
  subtitle,
  describe,
  color,
  highlight = null,
  done,
  overdue,
  dependency,
  externalWait = false,
  badge,
  focus = null,
  focusNote = null,
  onOpen,
  onCommit,
  readOnly: readOnlyProp = false,
  scheduling = null,
  summary = false,
  fold = null,
  describeFloor,
  onHover,
  onLinkStart,
  linkTarget = false,
}: GanttBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hovered, setHovered] = useState(false);
  const readOnly = readOnlyProp || summary;

  const scheduled = drag && scheduling ? applyScheduledDrag(span, scheduling, drag.mode, drag.delta) : null;
  const view = scheduled ?? span;
  const days = scheduled ? scheduled.durationDays : (scheduling?.durationDays ?? null);

  const hoverHandlers = {
    onMouseEnter: () => {
      setHovered(true);
      onHover?.(true);
    },
    onMouseLeave: () => {
      setHovered(false);
      onHover?.(false);
    },
  };
  // A DOM child of the bar (so hovering it still counts as hovering the
  // bar), drawn just past the bar's end — its left edge, RTL.
  const linkDot = onLinkStart && hovered && !drag && (
    // The hit area touches the bar's edge and is wider than the dot, so
    // moving from the bar onto the dot never leaves the hovered area.
    <span
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        onLinkStart(e);
      }}
      title="اسحب إلى مهمة أخرى لتبدأ بعد هذه"
      className="group/dot absolute top-1/2 z-[3] flex h-6 w-6 -translate-y-1/2 cursor-crosshair items-center justify-start"
      style={{ left: -22 }}
    >
      <span className="ml-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 shadow transition-transform group-hover/dot:scale-125" />
    </span>
  );

  const begin = (mode: DragMode) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    // A handle sits inside the bar — stop here so the bar's own "move"
    // handler doesn't also start.
    e.stopPropagation();
    e.preventDefault();
    barRef.current?.setPointerCapture(e.pointerId);
    setDrag({ mode, originX: e.clientX, delta: 0, moved: false });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    // Read-only: the pointer never counts as "moved", so release is a click.
    if (!drag || readOnly) return;
    const dx = e.clientX - drag.originX;
    const moved = drag.moved || Math.abs(dx) >= CLICK_SLOP;
    // RTL: a leftward drag (negative dx) is later in time.
    const delta = moved ? Math.round(-dx / pxPerDay) : 0;
    if (delta !== drag.delta || moved !== drag.moved) setDrag({ ...drag, delta, moved });
  };

  const onPointerUp = () => {
    if (!drag) return;
    const finished = drag;
    setDrag(null);
    if (!finished.moved) {
      onOpen();
      return;
    }
    if (finished.delta === 0 || !scheduling) return;
    const change = scheduledChange(span, scheduling, finished.mode, applyScheduledDrag(span, scheduling, finished.mode, finished.delta));
    if (Object.keys(change).length > 0) onCommit(change);
  };

  const tooltip = drag
    ? null
    : [
        `${title} · ${describe(span.startDay, span.endDay)}`,
        summary ? "محسوبة من المهام الفرعية" : null,
        dependency?.waitingOn.length ? waitingLabel(dependency.waitingOn) : null,
        dependency?.holding.length ? holdingLabel(dependency.holding) : null,
        focusNote,
      ]
        .filter(Boolean)
        .join(" · ");

  // Held back by its links: say why, above the bar.
  const floorLabel = drag?.moved && scheduled?.clamped && scheduling?.earliestDay != null && describeFloor && (
    <span className="pointer-events-none absolute -top-6 right-0 z-10 whitespace-nowrap rounded bg-red-600 px-1.5 py-0.5 text-[10px] text-white">
      {describeFloor(scheduling.earliestDay)}
    </span>
  );

  const right = (view.startDay - rangeStart) * pxPerDay;
  const width = Math.max((view.endDay - view.startDay + 1) * pxPerDay, MIN_BAR_W);
  const resizable = !readOnly && !!scheduling && width >= RESIZE_MIN_W;
  const labelInside = width >= LABEL_INSIDE_MIN_W;
  const second = subtitle(view.startDay, view.endDay, days);

  const tone = done
    ? { background: highlight ?? "#F3F4F6", borderColor: "#E5E7EB", borderRightColor: "#9CA3AF" }
    : summary
      ? { background: "color-mix(in srgb, #374151 9%, white)", borderColor: "#374151", borderRightColor: "#374151" }
      : {
          background: highlight ?? `color-mix(in srgb, ${color} 16%, white)`,
          borderColor: `color-mix(in srgb, ${color} 45%, white)`,
          borderRightColor: color,
        };
  const ring = linkTarget
    ? "outline outline-2 outline-offset-2 outline-blue-500"
    : focus === "critical"
      ? "outline outline-2 outline-offset-1 outline-red-600"
      : scheduled?.clamped
        ? "ring-2 ring-red-500"
        : overdue && !done
          ? "ring-2 ring-red-400 ring-offset-1"
          : "";
  const cursor = drag?.moved ? "z-[2] cursor-grabbing shadow-md" : readOnly ? "cursor-pointer" : "cursor-grab";

  const label = (
    <BarLabel
      title={title}
      second={second}
      done={done}
      externalWait={externalWait}
      fold={fold}
      badge={labelInside ? null : badge}
      onBar={labelInside}
    />
  );

  return (
    <>
      <div
        ref={barRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        {...hoverHandlers}
        onPointerDown={summary ? undefined : begin("move")}
        onClick={summary ? onOpen : undefined}
        className={`absolute select-none touch-none rounded-md border ${summary ? "border-x-[3px]" : "border-r-4"} ${ring} ${cursor}`}
        style={{ right, top: (ROW_H - BAR_H) / 2, width, height: BAR_H, opacity: focus === "dim" ? 0.35 : undefined, ...tone }}
      >
        <Tooltip label={tooltip} className="h-full w-full">
          {/* overflow-clip, not -hidden: hidden would make this span the
              nearest scroll container and the sticky text below would stop
              sticking to the real scroller. */}
          <span className="flex h-full w-full items-center overflow-clip pl-6">
            {labelInside && (
              // Sticky: a bar whose start is scrolled out of view keeps its
              // text at the visible edge instead of losing it.
              <span className="sticky min-w-0" style={{ right: LABEL_INSET }}>
                {label}
              </span>
            )}
          </span>
        </Tooltip>
        {labelInside && badge && (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2">
            <Badge badge={badge} />
          </span>
        )}
        {resizable && (
          <>
            {/* RTL: right edge = start, left edge = end. */}
            <span
              onPointerDown={begin("start")}
              className="absolute inset-y-0 -right-1 w-2 cursor-ew-resize rounded-r hover:bg-black/15"
            />
            <span
              onPointerDown={begin("end")}
              className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l hover:bg-black/15"
            />
          </>
        )}
        {floorLabel}
        {linkDot}
      </div>
      {!labelInside && (
        // Too short to hold its text: the same text just past its end,
        // still a way to open the task.
        <button
          type="button"
          onClick={onOpen}
          className="absolute flex max-w-[260px] items-center text-right"
          // past the link dot (22px beyond the bar's end)
          style={{ right: right + width + 24, top: 0, height: ROW_H, opacity: focus === "dim" ? 0.35 : undefined }}
        >
          {label}
        </button>
      )}
    </>
  );
}

/** Title on top, dates · days under it. */
function BarLabel({
  title,
  second,
  done,
  externalWait,
  fold,
  badge,
  onBar,
}: {
  title: string;
  second: string;
  done: boolean;
  externalWait: boolean;
  fold: BarFold | null;
  badge: TypeBadge | null | undefined;
  onBar: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {fold && <FoldButton fold={fold} />}
      {badge && <Badge badge={badge} />}
      <span className="flex min-w-0 flex-col leading-tight">
        <span
          className={`flex min-w-0 items-center gap-1 text-[12.5px] font-semibold ${done ? "text-gray-500" : "text-gray-900"}`}
        >
          {externalWait && (
            <span className={`inline-flex shrink-0 ${onBar ? "rounded-full bg-white/90 p-px" : ""} ${WAIT_STYLE.text}`} title="تنتظر مهمة في منطقة أو لوحة أخرى">
              <WAIT_STYLE.Icon className="h-3 w-3" />
            </span>
          )}
          {done && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
          <span className={`truncate ${done ? "line-through decoration-gray-400" : ""}`}>{title}</span>
        </span>
        <span className="truncate text-[11px] text-gray-500">{second}</span>
      </span>
    </span>
  );
}

export function FoldButton({ fold }: { fold: BarFold }) {
  return (
    <button
      type="button"
      // The bar opens the task on click — the chevron only folds.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        fold.onToggle();
      }}
      title={fold.collapsed ? "إظهار المهام الفرعية" : "إخفاء المهام الفرعية"}
      className="pointer-events-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-600 hover:bg-black/10"
    >
      {fold.collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </button>
  );
}

/** The task type's lettered circle. */
export function Badge({ badge, size = 18 }: { badge: TypeBadge; size?: number }) {
  return (
    <span
      title={badge.name}
      className="flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white"
      style={{ background: badge.color, width: size, height: size }}
    >
      {badge.label}
    </span>
  );
}
