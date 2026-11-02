import { useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import { TIERS } from "../../../lib/queryClient";
import { OrdersWithVendors } from "../../../types/extended.type";

export interface FinanceOrderRow extends OrdersWithVendors {
  projects: { id: string; name: string } | null;
  finance_entered: boolean;
  finance_entered_at: string | null;
  finance_entered_by: string | null;
}

export const financeOrdersKey = ["finance", "orders"] as const;

async function fetchFinanceOrders(): Promise<FinanceOrderRow[]> {
  const { data, error } = await supabase
    .from("shop_orders")
    .select("*, vendors(id, vendor_name), projects(id, name)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching finance orders:", error);
    throw error;
  }
  return (data as FinanceOrderRow[]) || [];
}

// Exported so the background prefetcher can warm this screen.
export const financeOrdersQueryOptions = () =>
  queryOptions({
    queryKey: financeOrdersKey,
    queryFn: fetchFinanceOrders,
    ...TIERS.C,
  });

export function useFinanceOrders() {
  const queryClient = useQueryClient();
  const query = useQuery(financeOrdersQueryOptions());

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query.refetch]);

  const markOrdersEntered = useCallback(
    async (orderIds: string[], userId?: string | null) => {
      if (orderIds.length === 0) return { error: null };

      const { error: updateError } = await supabase
        .from("shop_orders")
        .update({
          finance_entered: true,
          finance_entered_at: new Date().toISOString(),
          finance_entered_by: userId ?? null,
        })
        .in("id", orderIds);

      if (updateError) {
        console.error("Error marking orders as entered:", updateError);
        return { error: updateError };
      }

      // Also refreshes the pending-orders badge count.
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      return { error: null };
    },
    [queryClient],
  );

  return {
    orders: query.data ?? [],
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    refetch,
    markOrdersEntered,
  };
}
