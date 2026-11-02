import { useState, useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { Subcategories } from "../../../types/global.type";
import { supabase } from "../../../lib/supabaseClient";
import { ShopSubcategoryFormValues } from "../../../types/schema/shop/subcategory.schema";

export const shopSubcategoriesKey = ["shop", "subcategories"] as const;

async function fetchShopSubcategories(): Promise<Subcategories[]> {
  const { data, error } = await supabase.from("shop_subcategories").select("*");
  if (error) {
    console.error("Error fetching shop subcategories:", error);
    throw error;
  }
  return data ?? [];
}

// Exported so the background prefetcher can warm this screen.
export const shopSubcategoriesQueryOptions = () =>
  queryOptions({
    queryKey: shopSubcategoriesKey,
    queryFn: fetchShopSubcategories,
  });

export function useSubcategories() {
  const queryClient = useQueryClient();
  const query = useQuery(shopSubcategoriesQueryOptions());
  // Forms read `loading` / `error` for their own submit.
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<PostgrestError | null>(
    null,
  );

  const setActive = useCallback(
    (id: string, isActive: boolean) =>
      queryClient.setQueryData<Subcategories[]>(shopSubcategoriesKey, (prev) =>
        prev?.map((s) => (s.id === id ? { ...s, is_active: isActive } : s)),
      ),
    [queryClient],
  );

  const addSubcategory = async (subcategory: ShopSubcategoryFormValues) => {
    setMutating(true);
    setMutationError(null);

    try {
      const { data, error: insertError } = await supabase
        .from("shop_subcategories")
        .insert([subcategory])
        .select()
        .single();

      if (insertError) {
        console.error("Error adding shop subcategory:", insertError);
        setMutationError(insertError);
        return null;
      }

      queryClient.setQueryData<Subcategories[]>(shopSubcategoriesKey, (prev) =>
        prev ? [...prev, data] : prev,
      );
      queryClient.invalidateQueries({ queryKey: ["shop"] });
      return data;
    } catch (err) {
      console.error("Unexpected error adding shop subcategory:", err);
      setMutationError(err as PostgrestError);
      return null;
    } finally {
      setMutating(false);
    }
  };

  const toggleSubcategoryActive = useCallback(
    async (id: string, isActive: boolean) => {
      setMutationError(null);
      setActive(id, isActive);

      try {
        const { data, error: updateError } = await supabase
          .from("shop_subcategories")
          .update({ is_active: isActive })
          .eq("id", id)
          .select()
          .single();

        if (updateError) {
          console.error("Error toggling subcategory status:", updateError);
          setMutationError(updateError);
          setActive(id, !isActive);
          return null;
        }

        // Category detail lists subcategories under its own key.
        queryClient.invalidateQueries({ queryKey: ["shop"] });
        return data;
      } catch (err) {
        console.error("Unexpected error toggling subcategory status:", err);
        setMutationError(err as PostgrestError);
        setActive(id, !isActive);
        return null;
      }
    },
    [queryClient, setActive],
  );

  return {
    subcategories: query.data ?? [],
    loading: query.isPending || mutating,
    error: mutationError ?? (query.error as PostgrestError | null),
    addSubcategory,
    toggleSubcategoryActive,
  };
}
