import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import { TIERS } from "../../lib/queryClient";

// =====================================================================
// Task performance dashboard — data hooks.
// =====================================================================
// The scoring lives in SQL (tasks/migrations/2026-10-08_task_performance.sql):
// every number on the page comes back from these RPCs, nothing is
// recomputed here. The RPCs check view_task_performance themselves.
//
// tasks.performance_* are newer than the generated types, hence the cast
// (same approach as tasksRpc() in useTaskAccess.ts).

export type PersonTypeFilter = "all" | "employee" | "contractor";

export interface PerformanceRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  is_contractor: boolean;
  department_id: string | null;
  scored_tasks: number;
  unscored_tasks: number;
  open_overdue: number;
  points: number;
  max_points: number;
  /** points / max_points, 0..~1.2 — null when nothing was scored */
  efficiency: number | null;
  /** share of finished scored tasks delivered by the due date — null when none */
  on_time_rate: number | null;
  /** average lateness (as a fraction of task length) over late tasks — null when none late */
  avg_late_ratio: number | null;
  /** enough scored tasks and a high enough efficiency to be named "best" */
  is_eligible: boolean;
}

export interface PerformanceTrendPoint {
  month: string;
  points: number;
  max_points: number;
  efficiency: number | null;
  scored_tasks: number;
}

export interface PerformanceTaskRow {
  task_id: string;
  title: string;
  /** 'done' = finished in the period, 'open_overdue' = still open and past due */
  kind: "done" | "open_overdue";
  scored: boolean;
  due_date: string | null;
  completed_at: string | null;
  planned_days: number | null;
  weight: number;
  share: number;
  lateness_ratio: number | null;
  multiplier: number | null;
  points: number;
  on_time: boolean | null;
}

type RpcResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;
const tasksRpc = () =>
  supabase.schema("tasks") as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => RpcResult };

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await tasksRpc().rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data as T[] | null) ?? [];
}

// ---------------------------------------------------------------------
// Period
// ---------------------------------------------------------------------

export type PeriodPreset = "this_month" | "last_month" | "this_quarter" | "last_quarter" | "custom";

export interface PeriodRange {
  /** inclusive, ISO timestamp */
  from: string;
  /** exclusive, ISO timestamp */
  to: string;
}

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  this_month: "هذا الشهر",
  last_month: "الشهر الماضي",
  this_quarter: "هذا الربع",
  last_quarter: "الربع الماضي",
  custom: "فترة مخصصة",
};

/** Local-time month/quarter boundaries; `custom` takes yyyy-mm-dd inputs (end day included). */
export function periodRange(preset: PeriodPreset, customFrom: string, customTo: string, now = new Date()): PeriodRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3) * 3;
  let from: Date;
  let to: Date;
  switch (preset) {
    case "this_month":
      from = new Date(y, m, 1);
      to = new Date(y, m + 1, 1);
      break;
    case "last_month":
      from = new Date(y, m - 1, 1);
      to = new Date(y, m, 1);
      break;
    case "this_quarter":
      from = new Date(y, q, 1);
      to = new Date(y, q + 3, 1);
      break;
    case "last_quarter":
      from = new Date(y, q - 3, 1);
      to = new Date(y, q, 1);
      break;
    case "custom": {
      from = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(y, m, 1);
      const end = customTo ? new Date(`${customTo}T00:00:00`) : new Date(y, m + 1, 0);
      to = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
      break;
    }
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Last 6 calendar months up to the end of the current one — for the trend bars. */
export function trendRange(now = new Date()): PeriodRange {
  return {
    from: new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString(),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
  };
}

// ---------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------

export interface PerformanceFilters {
  range: PeriodRange;
  personType: PersonTypeFilter;
  departmentId: string | null;
}

const filterArgs = ({ range, personType, departmentId }: PerformanceFilters) => ({
  p_from: range.from,
  p_to: range.to,
  p_person_type: personType,
  p_department_id: departmentId,
});

export function usePerformanceSummary(filters: PerformanceFilters) {
  return useQuery<PerformanceRow[]>({
    queryKey: ["tasks", "performance", "summary", filters.range, filters.personType, filters.departmentId],
    ...TIERS.B,
    queryFn: () => call<PerformanceRow>("performance_summary", filterArgs(filters)),
  });
}

export function usePerformanceTrend(filters: Omit<PerformanceFilters, "range">) {
  const range = trendRange();
  return useQuery<PerformanceTrendPoint[]>({
    queryKey: ["tasks", "performance", "trend", range.from, filters.personType, filters.departmentId],
    ...TIERS.B,
    queryFn: () => call<PerformanceTrendPoint>("performance_trend", filterArgs({ ...filters, range })),
  });
}

/** The drill-down: every task behind one person's score. Only fetched while a person is open. */
export function usePerformancePersonTasks(userId: string | null, range: PeriodRange) {
  return useQuery<PerformanceTaskRow[]>({
    queryKey: ["tasks", "performance", "person-tasks", userId, range],
    enabled: !!userId,
    ...TIERS.B,
    queryFn: () =>
      call<PerformanceTaskRow>("performance_person_tasks", {
        p_user_id: userId,
        p_from: range.from,
        p_to: range.to,
      }),
  });
}

export interface DepartmentOption {
  id: string;
  label: string;
}

export function usePerformanceDepartments() {
  return useQuery<DepartmentOption[]>({
    queryKey: ["tasks", "performance", "departments"],
    ...TIERS.A,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, name_ar")
        .eq("is_active", true)
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []).map((d) => ({ id: d.id, label: d.name_ar ?? d.name }));
    },
  });
}
