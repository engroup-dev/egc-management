import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import { TIERS } from "../../lib/queryClient";
import type { PeriodRange } from "./usePerformance";

// =====================================================================
// Tasks dashboard — data hook.
// =====================================================================
// Every number comes back from one RPC (tasks/migrations/2026-10-11_task_dashboard.sql),
// nothing is recomputed here. The RPC checks view_task_dashboard itself.
//
// tasks.dashboard_summary is newer than the generated types, hence the cast
// (same approach as usePerformance.ts).

export interface DashboardTrendPoint {
  /** first day of the month, yyyy-mm-dd */
  month: string;
  created: number;
  completed: number;
}

export interface TaskDashboard {
  total: number;
  open: number;
  overdue: number;
  /** created inside the period */
  created: number;
  /** finished inside the period */
  completed: number;
  /** done / (total - closed), 0..1 — null when there is nothing countable */
  completion_rate: number | null;
  /** share of the period's finished tasks delivered by the due date — null when none had one */
  on_time_rate: number | null;
  /** finished in the period with a due date: the on_time_rate denominator */
  completed_with_due: number;
  by_status: { not_started: number; active: number; done: number; closed: number };
  /** last 6 calendar months, oldest first */
  trend: DashboardTrendPoint[];
}

type RpcResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;
const tasksRpc = () =>
  supabase.schema("tasks") as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => RpcResult };

export function useTaskDashboard(range: PeriodRange) {
  return useQuery<TaskDashboard>({
    queryKey: ["tasks", "dashboard", range.from, range.to],
    ...TIERS.B,
    queryFn: async () => {
      const { data, error } = await tasksRpc().rpc("dashboard_summary", { p_from: range.from, p_to: range.to });
      if (error) throw new Error(error.message);
      return data as TaskDashboard;
    },
  });
}
