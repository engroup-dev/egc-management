// hooks/shop/vendors/useVendors.ts
import { useState, useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import { VendorsWithSpecializations } from "../../../types/extended.type";

const VENDORS_SELECT = `
  *,
  vendor_specialities (
    speciality_id,
    speciality:specialities (id, name)
  )
`;

type ActionError = { message: string };

// Not ["vendors"]: that key belongs to src/hooks/useVendors.tsx, which
// selects different columns.
export const shopVendorsKey = ["shop", "vendors"] as const;

async function fetchShopVendors(): Promise<VendorsWithSpecializations[]> {
  const { data, error } = await supabase
    .from("vendors")
    .select(VENDORS_SELECT)
    .order("vendor_name", { ascending: true });

  if (error) {
    console.error("Error fetching vendors:", error);
    throw error;
  }
  return (data as unknown as VendorsWithSpecializations[]) ?? [];
}

// Exported so the background prefetcher can warm this screen.
export const shopVendorsQueryOptions = () =>
  queryOptions({ queryKey: shopVendorsKey, queryFn: fetchShopVendors });

export function useVendors() {
  const queryClient = useQueryClient();
  const query = useQuery(shopVendorsQueryOptions());
  const vendors = query.data ?? [];

  // Separate from `error` on purpose: `error` = page can't load data (blocking).
  // `actionError` = a single mutation (toggle/edit) failed (non-blocking, transient).
  const [actionError, setActionError] = useState<ActionError | null>(null);

  const clearActionError = useCallback(() => setActionError(null), []);

  const setVendors = useCallback(
    (
      updater: (
        prev: VendorsWithSpecializations[],
      ) => VendorsWithSpecializations[],
    ) =>
      queryClient.setQueryData<VendorsWithSpecializations[]>(
        shopVendorsKey,
        (prev) => (prev ? updater(prev) : prev),
      ),
    [queryClient],
  );

  const { refetch: refetchQuery } = query;
  const refetch = useCallback(async () => {
    await refetchQuery();
  }, [refetchQuery]);

  const toggleVendorShop = useCallback(
    async (id: string, isShop: boolean) => {
      setActionError(null);

      if (isShop) {
        const vendor = queryClient
          .getQueryData<VendorsWithSpecializations[]>(shopVendorsKey)
          ?.find((v) => v.id === id);
        if (!vendor?.flow) {
          setActionError({
            message: "يجب اختيار مسار العمل أولاً قبل تفعيل المتجر",
          });
          return { success: false as const };
        }
      }

      setVendors((prev) =>
        prev.map((v) => (v.id === id ? { ...v, is_shop: isShop } : v)),
      );

      try {
        const { data, error: updateError } = await supabase
          .from("vendors")
          .update({ is_shop: isShop })
          .eq("id", id)
          .select(VENDORS_SELECT)
          .single();

        if (updateError) {
          console.error("Error toggling vendor shop status:", updateError);
          setActionError({ message: "تعذر تحديث حالة المتجر" });
          setVendors((prev) =>
            prev.map((v) => (v.id === id ? { ...v, is_shop: !isShop } : v)),
          );
          return { success: false as const };
        }

        setVendors((prev) =>
          prev.map((v) =>
            v.id === id ? (data as unknown as VendorsWithSpecializations) : v,
          ),
        );
        // The supply-chain vendor detail shows the same row.
        queryClient.invalidateQueries({
          queryKey: ["supply-chain", "vendor", id],
        });
        return { success: true as const, data };
      } catch (err) {
        console.error("Unexpected error toggling vendor shop status:", err);
        setActionError({ message: "تعذر تحديث حالة المتجر" });
        setVendors((prev) =>
          prev.map((v) => (v.id === id ? { ...v, is_shop: !isShop } : v)),
        );
        return { success: false as const };
      }
    },
    [queryClient, setVendors],
  );

  const updateVendorLimitFlow = useCallback(
    async (
      id: string,
      payload: { price_limit: number | null; flow: 1 | 2 },
    ) => {
      setActionError(null);

      const prevVendor = queryClient
        .getQueryData<VendorsWithSpecializations[]>(shopVendorsKey)
        ?.find((v) => v.id === id);

      setVendors((prev) =>
        prev.map((v) =>
          v.id === id
            ? { ...v, price_limit: payload.price_limit, flow: payload.flow }
            : v,
        ),
      );

      try {
        const { data, error: updateError } = await supabase
          .from("vendors")
          .update({
            price_limit: payload.price_limit,
            flow: payload.flow,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select(VENDORS_SELECT)
          .single();

        if (updateError) {
          console.error("Error updating vendor limit/flow:", updateError);
          setActionError({ message: "تعذر حفظ التعديلات" });
          if (prevVendor) {
            setVendors((prev) =>
              prev.map((v) => (v.id === id ? prevVendor : v)),
            );
          }
          return { success: false as const, error: updateError };
        }

        setVendors((prev) =>
          prev.map((v) =>
            v.id === id ? (data as unknown as VendorsWithSpecializations) : v,
          ),
        );
        queryClient.invalidateQueries({
          queryKey: ["supply-chain", "vendor", id],
        });
        return { success: true as const, data };
      } catch (err) {
        console.error("Unexpected error updating vendor limit/flow:", err);
        setActionError({ message: "تعذر حفظ التعديلات" });
        if (prevVendor) {
          setVendors((prev) => prev.map((v) => (v.id === id ? prevVendor : v)));
        }
        return { success: false as const, error: err as PostgrestError };
      }
    },
    [queryClient, setVendors],
  );

  return {
    vendors,
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    actionError,
    clearActionError,
    refetch,
    toggleVendorShop,
    updateVendorLimitFlow,
  };
}
