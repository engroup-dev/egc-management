import { queryOptions, useQuery } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import { TIERS } from "../../lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BatchPeriod {
  id: string;
  project_id: string;
  project_name: string;
  project_serial: number | null;
  start_date: string;
  end_date: string;
  currency: string;
  type: "bank" | "cash" | "cheque" | "deposit" | "transfer";
  total_amount: number;
  status: string;
  company_percentage: number;
  bank_percentage: number;
  source_percentage_id: string | null;
  reversed_at: string | null;
  reversal_note: string | null;
  employee_ids: string[];
}

export interface DistributionBatch {
  date: string;
  periods: BatchPeriod[];
  // Aggregates across ACTIVE (non-reversed) periods only
  totalsByCurrency: Record<string, number>;
  employeeCount: number;
  hasReversed: boolean;
}

type RawItem = { item_type: string; user_id: string | null };

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const distributionBatchesKey = [
  "company",
  "distribution-batches",
] as const;

async function fetchDistributionBatches(): Promise<DistributionBatch[]> {
  const { data, error } = await supabase
    .from("project_percentage_periods")
    .select(
      `id, project_id, start_date, end_date, currency, type,
       total_amount, status, company_percentage, bank_percentage,
       source_percentage_id, reversed_at, reversal_note,
       project:projects(id, name, serial_number),
       items:project_percentage_period_items(user_id, item_type)`,
    )
    .order("end_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  const batchMap = new Map<string, BatchPeriod[]>();

  for (const row of data ?? []) {
    const date = row.end_date;

    const employeeIds = (row.items as RawItem[])
      .filter(
        (i): i is { item_type: string; user_id: string } =>
          i.item_type === "employee" && i.user_id !== null,
      )
      .map((i) => i.user_id);

    const period: BatchPeriod = {
      id: row.id,
      project_id: row.project_id,
      project_name: row.project?.name ?? "—",
      project_serial: row.project?.serial_number ?? null,
      start_date: row.start_date,
      end_date: row.end_date,
      currency: row.currency ?? "LYD",
      type: row.type,
      total_amount: Number(row.total_amount),
      status: row.status,
      company_percentage: Number(row.company_percentage),
      bank_percentage: Number(row.bank_percentage),
      source_percentage_id: row.source_percentage_id,
      reversed_at: row.reversed_at,
      reversal_note: row.reversal_note,
      employee_ids: employeeIds,
    };

    const datePeriods = batchMap.get(date);
    if (datePeriods) datePeriods.push(period);
    else batchMap.set(date, [period]);
  }

  // Build batch summaries — only count ACTIVE periods in totals
  const result: DistributionBatch[] = [];
  for (const [date, periods] of batchMap.entries()) {
    const totalsByCurrency: Record<string, number> = {};
    const allEmployeeIds = new Set<string>();

    for (const p of periods) {
      if (p.status === "reversed") continue; // skip reversed

      totalsByCurrency[p.currency] =
        (totalsByCurrency[p.currency] ?? 0) + p.total_amount;
      p.employee_ids.forEach((id) => allEmployeeIds.add(id));
    }

    result.push({
      date,
      periods, // keep all periods (including reversed) for display
      totalsByCurrency,
      employeeCount: allEmployeeIds.size,
      hasReversed: periods.some((p) => p.status === "reversed"),
    });
  }

  return result;
}

// Exported so the background prefetcher can warm this screen.
export const distributionBatchesQueryOptions = () =>
  queryOptions({
    queryKey: distributionBatchesKey,
    queryFn: fetchDistributionBatches,
    ...TIERS.C,
  });

export function useDistributionBatches() {
  const query = useQuery(distributionBatchesQueryOptions());
  return {
    batches: query.data ?? null,
    loading: query.isPending,
    refreshing: query.isFetching && !query.isPending,
    error: query.error as PostgrestError | null,
    refetch: async () => {
      await query.refetch();
    },
  };
}
