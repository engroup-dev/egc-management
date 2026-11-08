import type { TaskDirectoryData } from "../../../hooks/tasks/useTaskDirectory";
import { ASSIGNEE_NONE_KEY, createDefaultFilters, type DirectoryFilterState } from "./directoryFilters";

// What each KPI card on the space page means as a filter. Every card is a
// preset of the same DirectoryFilterState the filter dialog edits, so the
// list under a card is produced by filterDirectoryTasks() like any other
// filter — no second definition of "overdue" or "unassigned".
//
// activeKpiKey() goes the other way: given whatever the filters are right
// now, which card (if any) do they exactly match? The highlighted card is
// derived from the filters rather than stored, so it stays right when the
// filter dialog changes them.

export type KpiKey = "total" | "open" | "not_started" | "in_progress" | "overdue" | "delayed_start" | "done" | "unassigned" | "blocked";

/** Display order of the cards. */
export const KPI_KEYS: KpiKey[] = ["total", "open", "in_progress", "delayed_start", "overdue", "done", "not_started", "unassigned", "blocked"];

export function notStartedStatusIds(data: TaskDirectoryData): string[] {
  return data.statuses.filter((s) => s.category === "not_started").map((s) => s.id);
}

/** Statuses in the "active" category — what the board calls in progress. */
export function inProgressStatusIds(data: TaskDirectoryData): string[] {
  return data.statuses.filter((s) => s.category === "active").map((s) => s.id);
}

export function kpiFilters(key: KpiKey, data: TaskDirectoryData): DirectoryFilterState {
  const f = createDefaultFilters(); // statusMode "open"
  switch (key) {
    case "total":
      f.statusMode = "all";
      break;
    case "open":
      break;
    case "not_started":
      f.statusMode = "custom";
      f.customStatusIds = new Set(notStartedStatusIds(data));
      break;
    case "in_progress":
      f.statusMode = "custom";
      f.customStatusIds = new Set(inProgressStatusIds(data));
      break;
    case "overdue":
      f.overdueOnly = true;
      break;
    case "delayed_start":
      f.delayedStartOnly = true;
      break;
    case "done":
      f.statusMode = "done";
      break;
    case "unassigned":
      f.assigneeIds = new Set([ASSIGNEE_NONE_KEY]);
      break;
    case "blocked":
      f.isBlocked = true;
      break;
  }
  return f;
}

function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// completedDate is ignored: it only matters in "done_on" mode, which no card uses.
function sameFilters(a: DirectoryFilterState, b: DirectoryFilterState): boolean {
  return (
    a.statusMode === b.statusMode &&
    a.overdueOnly === b.overdueOnly &&
    a.delayedStartOnly === b.delayedStartOnly &&
    a.isBlocked === b.isBlocked &&
    a.hasAttachments === b.hasAttachments &&
    a.hasComments === b.hasComments &&
    a.hasDescription === b.hasDescription &&
    a.hasUnmetRequirement === b.hasUnmetRequirement &&
    sameSet(a.customStatusIds, b.customStatusIds) &&
    sameSet(a.priorities, b.priorities) &&
    sameSet(a.projectIds, b.projectIds) &&
    sameSet(a.assigneeIds, b.assigneeIds) &&
    sameSet(a.taskTypeIds, b.taskTypeIds) &&
    sameSet(a.tagIds, b.tagIds)
  );
}

export function activeKpiKey(filters: DirectoryFilterState, data: TaskDirectoryData): KpiKey | null {
  for (const key of KPI_KEYS) {
    // A status preset with no such statuses would filter nothing, so it never counts as a match.
    if (key === "not_started" && notStartedStatusIds(data).length === 0) continue;
    if (key === "in_progress" && inProgressStatusIds(data).length === 0) continue;
    if (sameFilters(filters, kpiFilters(key, data))) return key;
  }
  return null;
}
