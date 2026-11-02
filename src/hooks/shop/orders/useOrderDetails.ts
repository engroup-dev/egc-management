import { queryOptions, useQuery } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";

export interface OrderDetails {
  id: string;
  status: string;
  note: string | null;
  total_price: number | null;
  vendor_ref: string | null;
  created_at: string;
  quoted_at: string | null;
  approved_at: string | null;
  arrived_at: string | null;
  cancelled_at: string | null;
  rejected_at: string | null;
  project: { id: string; name: string; code: string } | null;
  created_by_user: { first_name: string; last_name: string | null } | null;
  approved_by_user: { first_name: string; last_name: string | null } | null;
  vendor: { id: string; vendor_name: string } | null;
  items: {
    id: string;
    name: string | null;
    quantity: number;
    quoted_unit_price: number | null;
    quoted_total: number | null;
    notes: string | null;
  }[];
}

export const shopOrderKey = (orderId: string | undefined) =>
  ["shop", "order", orderId ?? ""] as const;

async function fetchShopOrder(orderId: string): Promise<OrderDetails> {
  const { data, error } = await supabase
    .from("shop_orders")
    .select(
      `
      id, status, note, total_price, vendor_ref, created_at,
      quoted_at, approved_at, arrived_at, cancelled_at, rejected_at,
      project:projects ( id, name, code ),
      created_by_user:users!shop_orders_created_by_fkey ( first_name, last_name ),
      approved_by_user:users!shop_orders_approved_by_fkey ( first_name, last_name ),
      vendor:vendors ( id, vendor_name ),
      items:shop_order_items ( id, name, quantity, quoted_unit_price, quoted_total, notes )
    `,
    )
    .eq("id", orderId)
    .single();

  if (error) {
    console.error("Error fetching order details:", error);
    throw error;
  }
  return data as unknown as OrderDetails;
}

export const shopOrderQueryOptions = (orderId: string | undefined) =>
  queryOptions({
    queryKey: shopOrderKey(orderId),
    queryFn: () => fetchShopOrder(orderId as string),
    enabled: !!orderId,
  });

export function useOrderDetails(orderId: string | undefined) {
  const query = useQuery(shopOrderQueryOptions(orderId));

  const refetch = async () => {
    if (!orderId) return;
    await query.refetch();
  };

  // Stays true without an id, as before.
  return {
    order: query.data ?? null,
    loading: query.isPending,
    error: query.error as PostgrestError | Error | null,
    refetch,
  };
}
