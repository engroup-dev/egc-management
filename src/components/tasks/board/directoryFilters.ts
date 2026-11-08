import type { Priority, TaskRow } from "../../../hooks/tasks/useTaskBoard";
import type { TaskDirectoryData } from "../../../hooks/tasks/useTaskDirectory";
import { isCompletedToday, parseLocalDateInput } from "./taskDates";

// Pure filter/sort logic shared by AssigneeViewPage.tsx, TaskTypeViewPage.tsx,
// and DirectoryFilterSortPopover.tsx — no JSX here so it's trivially unit-
// testable and so the popover and the two pages can't drift on what a given
// filter actually means.

export const PROJECT_NONE_KEY = "__no_project__";
export const ASSIGNEE_NONE_KEY = "__unassigned__";

export interface DirectoryFilterState {
  /** "open" = not_started/active categories (today's old includeClosed
   * default). "done" = the done category only — NOT `closed`, since the
   * trigger that stamps tasks.completed_at only fires for `done`, so a
   * combined mode would list cancelled tasks with no completion time.
   * "done_on" = done AND completed_at falls on `completedDate`
   * (device-local day; today when that is null).
   * "all" = no status filtering. "custom" = exactly customStatusIds. */
  statusMode: "open" | "done" | "done_on" | "all" | "custom";
  /** Local "YYYY-MM-DD" for the "done_on" mode. null = today, which
   * follows the clock rather than freezing the day the page was opened. */
  completedDate: string | null;
  customStatusIds: Set<string>;
  /** Empty = every priority, including unset. */
  priorities: Set<Priority | "none">;
  overdueOnly: boolean;
  delayedStartOnly?: boolean;
  /** Empty = every project. PROJECT_NONE_KEY = tasks with no project. */
  projectIds: Set<string>;
  /** Empty = every assignee. ASSIGNEE_NONE_KEY = unassigned tasks. */
  assigneeIds: Set<string>;
  /** Empty = every type. */
  taskTypeIds: Set<string>;
  /** Empty = every tag (and untagged tasks). */
  tagIds: Set<string>;
  hasAttachments: boolean;
  hasComments: boolean;
  hasDescription: boolean;
  isBlocked: boolean;
  hasUnmetRequirement: boolean;
}

export function createDefaultFilters(): DirectoryFilterState {
  return {
    statusMode: "open",
    completedDate: null,
    customStatusIds: new Set(),
    priorities: new Set(),
    overdueOnly: false,
    delayedStartOnly: false,
    projectIds: new Set(),
    assigneeIds: new Set(),
    taskTypeIds: new Set(),
    tagIds: new Set(),
    hasAttachments: false,
    hasComments: false,
    hasDescription: false,
    isBlocked: false,
    hasUnmetRequirement: false,
  };
}

export function countActiveFilters(filters: DirectoryFilterState): number {
  let n = 0;
  if (filters.statusMode !== "open") n++;
  if (filters.priorities.size > 0) n++;
  if (filters.overdueOnly) n++;
  if (filters.delayedStartOnly) n++;
  if (filters.projectIds.size > 0) n++;
  if (filters.assigneeIds.size > 0) n++;
  if (filters.taskTypeIds.size > 0) n++;
  if (filters.tagIds.size > 0) n++;
  if (filters.hasAttachments) n++;
  if (filters.hasComments) n++;
  if (filters.hasDescription) n++;
  if (filters.isBlocked) n++;
  if (filters.hasUnmetRequirement) n++;
  return n;
}

function hasDescriptionText(task: TaskRow): boolean {
  return !!(task.description as { text?: string } | null)?.text?.trim();
}

export function filterDirectoryTasks(tasks: TaskRow[], filters: DirectoryFilterState, data: TaskDirectoryData): TaskRow[] {
  const openStatusIds = new Set(
    data.statuses.filter((s) => s.category === "not_started" || s.category === "active").map((s) => s.id),
  );
  const doneStatusIds = new Set(data.statuses.filter((s) => s.category === "done").map((s) => s.id));
  const completedDay = filters.completedDate ? parseLocalDateInput(filters.completedDate) : new Date();

  return tasks.filter((task) => {
    if (filters.statusMode === "open" && !openStatusIds.has(task.status_id)) return false;
    if (filters.statusMode === "done" && !doneStatusIds.has(task.status_id)) return false;
    if (filters.statusMode === "done_on") {
      // Both checks on purpose. completed_at alone would be enough while
      // the trigger behaves, but checking the category too means a stale
      // timestamp that somehow survived a reopen can't put an open task
      // in a "completed" list.
      if (!doneStatusIds.has(task.status_id)) return false;
      if (!isCompletedToday(task.completed_at, completedDay)) return false;
    }
    if (filters.statusMode === "custom" && filters.customStatusIds.size > 0 && !filters.customStatusIds.has(task.status_id)) {
      return false;
    }

    if (filters.priorities.size > 0 && !filters.priorities.has(task.priority ?? "none")) return false;

    if (filters.overdueOnly && !task.is_overdue) return false;

    if (filters.delayedStartOnly) {
      const today = new Date().toISOString().split("T")[0];
      const notStartedStatusIds = new Set(
        data.statuses.filter((s) => s.category === "not_started").map((s) => s.id),
      );
      if (!notStartedStatusIds.has(task.status_id) || !task.start_date || task.start_date > today) {
        return false;
      }
    }

    if (filters.projectIds.size > 0 && !filters.projectIds.has(task.project_id ?? PROJECT_NONE_KEY)) return false;

    if (filters.assigneeIds.size > 0) {
      const assignees = data.assigneesByTask.get(task.id) ?? [];
      const matches =
        assignees.length === 0
          ? filters.assigneeIds.has(ASSIGNEE_NONE_KEY)
          : assignees.some((id) => filters.assigneeIds.has(id));
      if (!matches) return false;
    }

    if (filters.taskTypeIds.size > 0 && !filters.taskTypeIds.has(task.task_type_id)) return false;

    if (filters.tagIds.size > 0) {
      const tags = data.tagsByTask.get(task.id) ?? [];
      if (!tags.some((t) => filters.tagIds.has(t.id))) return false;
    }

    if (filters.hasAttachments && !data.attachedTaskIds.has(task.id)) return false;
    if (filters.hasComments && !data.commentedTaskIds.has(task.id)) return false;
    if (filters.hasDescription && !hasDescriptionText(task)) return false;
    if (filters.isBlocked && !data.blockedTaskIds.has(task.id)) return false;
    if (filters.hasUnmetRequirement && !data.unmetRequirementTaskIds.has(task.id)) return false;

    return true;
  });
}

/** The free-text title match, extracted from the four pages' identical
 *  inline `if (term && !task.title.toLowerCase().includes(term)) continue;`.
 *
 *  Paired with filterDirectoryTasks() below, this is the single
 *  definition of "what the page is currently showing" — which the
 *  overdue-notify button depends on, since its whole promise is that it
 *  messages the people you can see. Deriving that list separately from
 *  the one the page renders would let the two drift silently. */
export function searchDirectoryTasks(tasks: TaskRow[], search: string): TaskRow[] {
  const term = search.trim().toLowerCase();
  if (!term) return tasks;
  return tasks.filter((task) => task.title.toLowerCase().includes(term));
}

// Task sort keys, shared by the board (TaskTable) and the directory
// views. "manual" is the board's own drag order (tasks.sort_order) and is
// only offered on a board — across boards it means nothing.
export type TaskSortKey =
  | "manual"
  | "created_at"
  | "updated_at"
  | "start_date"
  | "due_date"
  | "completed_at"
  | "priority"
  | "title"
  | "status";
export type SortDirection = "asc" | "desc";

interface TaskSortOption {
  key: TaskSortKey;
  label: string;
  /** the direction picking this sort starts in */
  defaultDir: SortDirection;
  ascLabel: string;
  descLabel: string;
}

const DATE_LABELS = { ascLabel: "الأقدم أولاً", descLabel: "الأحدث أولاً" };

export const TASK_SORT_OPTIONS: TaskSortOption[] = [
  { key: "manual", label: "الترتيب اليدوي", defaultDir: "asc", ascLabel: "من الأعلى", descLabel: "من الأسفل" },
  { key: "created_at", label: "تاريخ الإنشاء", defaultDir: "desc", ...DATE_LABELS },
  { key: "updated_at", label: "آخر تعديل", defaultDir: "desc", ...DATE_LABELS },
  { key: "start_date", label: "تاريخ البدء", defaultDir: "asc", ...DATE_LABELS },
  { key: "due_date", label: "تاريخ الاستحقاق", defaultDir: "asc", ...DATE_LABELS },
  { key: "completed_at", label: "تاريخ الإنجاز", defaultDir: "desc", ...DATE_LABELS },
  { key: "priority", label: "الأولوية", defaultDir: "asc", ascLabel: "الأعلى أولاً", descLabel: "الأدنى أولاً" },
  { key: "title", label: "العنوان", defaultDir: "asc", ascLabel: "أ ← ي", descLabel: "ي ← أ" },
  { key: "status", label: "الحالة", defaultDir: "asc", ascLabel: "بترتيب الحالات", descLabel: "عكس ترتيب الحالات" },
];

export function taskSortOption(key: TaskSortKey): TaskSortOption {
  return TASK_SORT_OPTIONS.find((o) => o.key === key) ?? TASK_SORT_OPTIONS[0];
}

// "order" = the groups' own saved order (boards.sort_order — the order
// set in space settings); only offered where groups are boards.
export type GroupSortKey = "count" | "name" | "order";

export interface DirectorySortState {
  taskSort: TaskSortKey;
  taskSortDir: SortDirection;
  groupSort: GroupSortKey;
}

export const DEFAULT_SORT: DirectorySortState = { taskSort: "due_date", taskSortDir: "asc", groupSort: "count" };

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

type SortableTask = Pick<
  TaskRow,
  | "sort_order"
  | "created_at"
  | "updated_at"
  | "start_date"
  | "due_date"
  | "completed_at"
  | "priority"
  | "title"
  | "status_id"
>;

function sortValue(task: SortableTask, key: TaskSortKey, statusOrderById: Map<string, number>): number | string | null {
  switch (key) {
    case "manual":
      return task.sort_order;
    case "created_at":
    case "updated_at":
    case "start_date":
    case "due_date":
    case "completed_at": {
      const v = task[key];
      return v ? new Date(v).getTime() : null;
    }
    case "priority":
      return task.priority ? PRIORITY_RANK[task.priority] : null;
    case "title":
      return task.title;
    case "status":
      return statusOrderById.get(task.status_id) ?? null;
  }
}

/** Sorts one list of sibling tasks. A task with no value for the key (no
 * due date, never finished, no priority...) always goes last, whichever
 * way the direction points; ties keep the manual order. */
export function sortTasks<T extends SortableTask>(
  tasks: T[],
  key: TaskSortKey,
  dir: SortDirection,
  statusOrderById: Map<string, number>,
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...tasks].sort((a, b) => {
    const av = sortValue(a, key, statusOrderById);
    const bv = sortValue(b, key, statusOrderById);
    if (av === null && bv === null) return a.sort_order - b.sort_order;
    if (av === null) return 1;
    if (bv === null) return -1;
    const diff = typeof av === "string" ? av.localeCompare(bv as string, "ar") : av - (bv as number);
    return diff !== 0 ? diff * sign : a.sort_order - b.sort_order;
  });
}

export function sortDirectoryTasks(
  tasks: TaskRow[],
  sort: Pick<DirectorySortState, "taskSort" | "taskSortDir">,
  data: TaskDirectoryData,
): TaskRow[] {
  const statusOrderById = new Map(data.statuses.map((s) => [s.id, s.sort_order]));
  return sortTasks(tasks, sort.taskSort, sort.taskSortDir, statusOrderById);
}

/** Generic over both AssigneeGroup and TaskTypeGroup — both carry a
 * stable `key`, a display `label`, and their bucketed `tasks`. Whichever
 * group's `key` matches `fallbackKey` (the "غير معين" bucket) always
 * sorts last, regardless of sort mode. */
export function sortDirectoryGroups<G extends { key: string; label: string; tasks: TaskRow[] }>(
  groups: G[],
  sortKey: GroupSortKey,
  fallbackKey?: string,
  /** group key -> saved position, for sortKey "order" */
  orderByKey?: Map<string, number>,
): G[] {
  const sorted = [...groups];
  sorted.sort((a, b) => {
    if (fallbackKey) {
      if (a.key === fallbackKey && b.key !== fallbackKey) return 1;
      if (b.key === fallbackKey && a.key !== fallbackKey) return -1;
    }
    if (sortKey === "order") {
      const diff =
        (orderByKey?.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (orderByKey?.get(b.key) ?? Number.MAX_SAFE_INTEGER);
      return diff !== 0 ? diff : a.label.localeCompare(b.label, "ar");
    }
    return sortKey === "count" ? b.tasks.length - a.tasks.length : a.label.localeCompare(b.label, "ar");
  });
  return sorted;
}
