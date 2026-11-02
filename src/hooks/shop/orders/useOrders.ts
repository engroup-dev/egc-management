import { queryOptions, useQuery } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import { OrdersWithVendors } from "../../../types/extended.type";

export const shopProjectOrdersKey = (projectId: string) =>
  ["shop", "orders", projectId] as const;

async function fetchShopProjectOrders(
  projectId: string,
): Promise<OrdersWithVendors[]> {
  const { data, error } = await supabase
    .from("shop_orders")
    .select("*, vendors(id, vendor_name)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching shop orders:", error);
    throw error;
  }
  return data ?? [];
}

export const shopProjectOrdersQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: shopProjectOrdersKey(projectId),
    queryFn: () => fetchShopProjectOrders(projectId),
    enabled: !!projectId,
  });

export function useOrders(projectId: string) {
  const query = useQuery(shopProjectOrdersQueryOptions(projectId));

  const refetch = async () => {
    if (!projectId) return;
    await query.refetch();
  };

  return {
    orders: query.data ?? [],
    loading: query.isPending && !!projectId,
    error: query.error as PostgrestError | null,
    refetch,
  };
}
