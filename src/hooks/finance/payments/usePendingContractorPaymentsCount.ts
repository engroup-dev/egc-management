import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabaseClient";
import { TIERS } from "../../../lib/queryClient";

export const pendingContractorPaymentsCountKey = [
  "finance",
  "pending-contractor-payments-count",
] as const;

async function fetchPendingContractorPaymentsCount(): Promise<number> {
  const { count, error } = await supabase
    .schema("contracts")
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) {
    console.error(error);
    throw error;
  }
  return count ?? 0;
}

// Exported so the background prefetcher can warm the finance menu badges.
export const pendingContractorPaymentsCountQueryOptions = () =>
  queryOptions({
    queryKey: pendingContractorPaymentsCountKey,
    queryFn: fetchPendingContractorPaymentsCount,
    ...TIERS.C,
  });

/** Lightweight count (no row data) of contractor payments awaiting review. */
export function usePendingContractorPaymentsCount() {
  const query = useQuery(pendingContractorPaymentsCountQueryOptions());
  return { count: query.data ?? 0, loading: query.isPending };
}
