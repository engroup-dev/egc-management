import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabaseClient";
import { TIERS } from "../../../lib/queryClient";

export const pendingOrdersCountKey = [
  "finance",
  "pending-orders-count",
] as const;

async function fetchPendingOrdersCount(): Promise<number> {
  const { count, error } = await supabase
    .from("shop_orders")
    .select("id", { count: "exact", head: true })
    .in("status", ["approved", "arrived"])
    .eq("finance_entered", false);
  if (error) {
    console.error(error);
    throw error;
  }
  return count ?? 0;
}

// Exported so the background prefetcher can warm the finance menu badges.
export const pendingOrdersCountQueryOptions = () =>
  queryOptions({
    queryKey: pendingOrdersCountKey,
    queryFn: fetchPendingOrdersCount,
    ...TIERS.C,
  });

/** Lightweight count (no row data) of purchase orders awaiting review. */
export function usePendingOrdersCount() {
  const query = useQuery(pendingOrdersCountQueryOptions());
  return { count: query.data ?? 0, loading: query.isPending };
}
