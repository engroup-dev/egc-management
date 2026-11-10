import type { TaskDirectoryData } from "../../../hooks/tasks/useTaskDirectory";
import type { TaskRow } from "../../../hooks/tasks/useTaskBoard";
import { sortDirectoryTasks } from "../board/directoryFilters";

// =====================================================================
// Space tour — which task goes on which slide. Pure functions, no React,
// so the rules live in one readable place (SpaceTourDialog only renders).
// =====================================================================
// Every open task is organized across slides for the site tour:
//
//   1. overdue       open and tasks.is_overdue (same flag as the KPI strip)
//   2. in progress   status category "active" OR start date has arrived/passed (isDueToStart)
//   3. not started   status category "not_started" (future or unscheduled)
//   4. unassigned    open, nobody assigned
//
// Plus a last slide of what was finished in the last 7 days.

export type TourSlideKey = "overdue" | "in_progress" | "not_started" | "unassigned" | "recent_done";

export interface TourSlideMeta {
  key: TourSlideKey;
  label: string;
  /** one line under the slide title */
  subtitle: string;
  /** shown when the slide has no tasks */
  empty: string;
  tone: string;
}

/** Display order. */
export const TOUR_SLIDES: TourSlideMeta[] = [
  {
    key: "overdue",
    label: "متأخرة",
    subtitle: "تجاوزت تاريخ الاستحقاق ولم تُنجز بعد — ابدأ بها",
    empty: "لا توجد مهام متأخرة",
    tone: "#EF4444",
  },
  {
    key: "in_progress",
    label: "قيد التنفيذ",
    subtitle: "بدأ العمل عليها أو حان موعد بدئها — تابع الإنجاز",
    empty: "لا توجد مهام قيد التنفيذ أو مستحقة البدء",
    tone: "#8B5CF6",
  },
  {
    key: "not_started",
    label: "لم تبدأ",
    subtitle: "مهام مجدولة لم يحن موعدها بعد أو بانتظار الانطلاق",
    empty: "لا توجد مهام بانتظار البدء",
    tone: "#64748B",
  },
  {
    key: "unassigned",
    label: "غير معينة",
    subtitle: "لا يوجد مسؤول عنها — عيّن أحداً",
    empty: "كل المهام المفتوحة لها مسؤول",
    tone: "#F59E0B",
  },
  {
    key: "recent_done",
    label: "أُنجزت مؤخراً",
    subtitle: "ما تم إنجازه خلال آخر 7 أيام",
    empty: "لم تُنجز أي مهمة خلال آخر 7 أيام",
    tone: "#10B981",
  },
];

export const TOUR_SLIDE_BY_KEY = Object.fromEntries(TOUR_SLIDES.map((s) => [s.key, s])) as Record<
  TourSlideKey,
  TourSlideMeta
>;

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 7;
const DUE_SOON_DAYS = 7;

export type TourSnapshot = Record<TourSlideKey, string[]>;

export function categoryOf(task: TaskRow, data: TaskDirectoryData): string | null {
  return data.statuses.find((s) => s.id === task.status_id)?.category ?? null;
}

export const isOpenCategory = (c: string | null) => c === "not_started" || c === "active";

/** Whether task is not_started but its scheduled start_date has arrived or passed. */
export function isDueToStart(task: TaskRow, data: TaskDirectoryData, now: number): boolean {
  const category = categoryOf(task, data);
  if (category !== "not_started" || !task.start_date) return false;
  const d = new Date(now);
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return task.start_date.slice(0, 10) <= todayStr;
}

/** Whether task fits a given slide. */
export function fitsSlide(key: TourSlideKey, task: TaskRow, data: TaskDirectoryData, now: number): boolean {
  const category = categoryOf(task, data);
  if (category === "done") {
    if (key !== "recent_done") return false;
    const at = task.completed_at ? new Date(task.completed_at).getTime() : 0;
    return at >= now - RECENT_DAYS * DAY_MS;
  }
  if (!isOpenCategory(category)) return false;

  switch (key) {
    case "overdue":
      return !!task.is_overdue;
    case "in_progress":
      return category === "active" || isDueToStart(task, data, now);
    case "not_started":
      return category === "not_started" && !isDueToStart(task, data, now);
    case "unassigned":
      return (data.assigneesByTask.get(task.id) ?? []).length === 0;
    case "recent_done":
      return false;
  }
}

/** Primary slide a task belongs on right now — null when it belongs on none */
export function slideOf(task: TaskRow, data: TaskDirectoryData, now: number): TourSlideKey | null {
  const category = categoryOf(task, data);
  if (category === "done") {
    const at = task.completed_at ? new Date(task.completed_at).getTime() : 0;
    return at >= now - RECENT_DAYS * DAY_MS ? "recent_done" : null;
  }
  if (!isOpenCategory(category)) return null;
  if (category === "active" || isDueToStart(task, data, now)) return "in_progress";
  if (task.is_overdue) return "overdue";
  if ((data.assigneesByTask.get(task.id) ?? []).length === 0) return "unassigned";
  return "not_started";
}

/** Which tasks go on which slide, taken once when the tour opens. Kept as
 * ids so the rows still render live data: editing a task updates its row
 * in place instead of making it jump to another slide mid-edit. */
export function buildTourSnapshot(data: TaskDirectoryData, now: number): TourSnapshot {
  const buckets: Record<TourSlideKey, TaskRow[]> = {
    overdue: [],
    in_progress: [],
    not_started: [],
    unassigned: [],
    recent_done: [],
  };

  for (const task of data.tasks) {
    const category = categoryOf(task, data);
    if (category === "done") {
      const at = task.completed_at ? new Date(task.completed_at).getTime() : 0;
      if (at >= now - RECENT_DAYS * DAY_MS) buckets.recent_done.push(task);
      continue;
    }
    if (!isOpenCategory(category)) continue;

    if (task.is_overdue) {
      buckets.overdue.push(task);
    }
    if (category === "active" || isDueToStart(task, data, now)) {
      buckets.in_progress.push(task);
    }
    if (category === "not_started" && !isDueToStart(task, data, now)) {
      buckets.not_started.push(task);
    }
    if ((data.assigneesByTask.get(task.id) ?? []).length === 0) {
      buckets.unassigned.push(task);
    }
  }

  const ids = (tasks: TaskRow[]) => tasks.map((t) => t.id);
  // Open slides: soonest (or most overdue) due date first, no due date last.
  const byDue = (tasks: TaskRow[]) => ids(sortDirectoryTasks(tasks, { taskSort: "due_date", taskSortDir: "asc" }, data));
  return {
    overdue: byDue(buckets.overdue),
    in_progress: byDue(buckets.in_progress),
    not_started: byDue(buckets.not_started),
    unassigned: byDue(buckets.unassigned),
    recent_done: ids(sortDirectoryTasks(buckets.recent_done, { taskSort: "completed_at", taskSortDir: "desc" }, data)),
  };
}

export interface TourBoardGroup {
  boardId: string;
  label: string;
  tasks: TaskRow[];
}

/** One slide's tasks under their boards, boards in the space's saved order
 * (boards.sort_order — the same order the space page uses). Task order
 * inside a board is kept from the snapshot. */
export function groupByBoard(tasks: TaskRow[], data: TaskDirectoryData): TourBoardGroup[] {
  const byBoard = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    const list = byBoard.get(task.board_id) ?? [];
    list.push(task);
    byBoard.set(task.board_id, list);
  }
  return Array.from(byBoard.entries())
    .map(([boardId, list]) => ({ boardId, label: data.boardNamesById.get(boardId) ?? "لوحة", tasks: list }))
    .sort(
      (a, b) =>
        (data.boardOrderById.get(a.boardId) ?? Number.MAX_SAFE_INTEGER) -
          (data.boardOrderById.get(b.boardId) ?? Number.MAX_SAFE_INTEGER) || a.label.localeCompare(b.label, "ar"),
    );
}

/** Open, not overdue, due within the next 7 days. */
export function isDueThisWeek(task: TaskRow, data: TaskDirectoryData, now: number): boolean {
  if (!task.due_date || task.is_overdue || !isOpenCategory(categoryOf(task, data))) return false;
  const due = new Date(task.due_date).getTime();
  return due >= now - DAY_MS && due <= now + DUE_SOON_DAYS * DAY_MS;
}

/** Same rule as SpaceKpiStrip: cancelled/closed tasks are out of the
 * denominator — they were never going to be done. */
export function completionStats(data: TaskDirectoryData): { done: number; countable: number; rate: number } {
  let done = 0;
  let closed = 0;
  for (const task of data.tasks) {
    const category = categoryOf(task, data);
    if (category === "done") done++;
    else if (category === "closed") closed++;
  }
  const countable = data.tasks.length - closed;
  return { done, countable, rate: countable > 0 ? done / countable : 0 };
}
