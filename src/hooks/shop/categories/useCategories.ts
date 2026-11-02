// hooks/shop/categories/useCategories.ts
import { useState, useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { Categories } from "../../../types/global.type";
import { supabase } from "../../../lib/supabaseClient";
import { ShopCategoryFormValues } from "../../../types/schema/shop/category.schema";

export const shopCategoriesKey = ["shop", "categories"] as const;

async function fetchShopCategories(): Promise<Categories[]> {
  const { data, error } = await supabase.from("shop_categories").select("*");
  if (error) {
    console.error("Error fetching shop categories:", error);
    throw error;
  }
  return data ?? [];
}

// Exported so the background prefetcher can warm this screen.
export const shopCategoriesQueryOptions = () =>
  queryOptions({ queryKey: shopCategoriesKey, queryFn: fetchShopCategories });

export function useCategories() {
  const queryClient = useQueryClient();
  const query = useQuery(shopCategoriesQueryOptions());
  // Forms read `loading` / `error` for their own submit, so mutations keep
  // reporting through them like before.
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<PostgrestError | null>(
    null,
  );

  const setActive = useCallback(
    (id: string, isActive: boolean) =>
      queryClient.setQueryData<Categories[]>(shopCategoriesKey, (prev) =>
        prev?.map((c) => (c.id === id ? { ...c, is_active: isActive } : c)),
      ),
    [queryClient],
  );

  const addCategory = async (category: ShopCategoryFormValues) => {
    setMutating(true);
    setMutationError(null);

    try {
      const { data, error: insertError } = await supabase
        .from("shop_categories")
        .insert([category])
        .select()
        .single();

      if (insertError) {
        console.error("Error adding shop category:", insertError);
        setMutationError(insertError);
        return null;
      }

      queryClient.setQueryData<Categories[]>(shopCategoriesKey, (prev) =>
        prev ? [...prev, data] : prev,
      );
      queryClient.invalidateQueries({ queryKey: ["shop"] });
      return data;
    } catch (err) {
      console.error("Unexpected error adding shop category:", err);
      setMutationError(err as PostgrestError);
      return null;
    } finally {
      setMutating(false);
    }
  };

  const toggleCategoryActive = useCallback(
    async (id: string, isActive: boolean) => {
      setMutationError(null);
      setActive(id, isActive);

      try {
        const { data, error: updateError } = await supabase
          .from("shop_categories")
          .update({ is_active: isActive })
          .eq("id", id)
          .select()
          .single();

        if (updateError) {
          console.error("Error toggling category status:", updateError);
          setMutationError(updateError);
          setActive(id, !isActive);
          return null;
        }

        // Division detail lists categories under its own key.
        queryClient.invalidateQueries({ queryKey: ["shop"] });
        return data;
      } catch (err) {
        console.error("Unexpected error toggling category status:", err);
        setMutationError(err as PostgrestError);
        setActive(id, !isActive);
        return null;
      }
    },
    [queryClient, setActive],
  );

  return {
    categories: query.data ?? [],
    loading: query.isPending || mutating,
    error: mutationError ?? (query.error as PostgrestError | null),
    addCategory,
    toggleCategoryActive,
  };
}
