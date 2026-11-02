// hooks/shop/categories/useCategory.ts
import { useState, useCallback, SetStateAction } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { Categories, Subcategories } from "../../../types/global.type";
import { supabase } from "../../../lib/supabaseClient";
import { shopCategoriesKey } from "./useCategories";

type CategoryData = {
  category: Categories | null;
  subcategories: Subcategories[] | null;
};

export const shopCategoryKey = (id: string) =>
  ["shop", "category", id] as const;

async function fetchShopCategory(id: string): Promise<CategoryData> {
  const { data, error } = await supabase
    .from("shop_categories")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching shop category:", error);
    throw error;
  }

  const { data: subcategories, error: subcategoriesError } = await supabase
    .from("shop_subcategories")
    .select("*")
    .eq("category_id", id);

  if (subcategoriesError) {
    console.error("Error fetching subcategories:", subcategoriesError);
    throw subcategoriesError;
  }

  return { category: data, subcategories };
}

export const shopCategoryQueryOptions = (id: string) =>
  queryOptions({
    queryKey: shopCategoryKey(id),
    queryFn: () => fetchShopCategory(id),
    enabled: !!id,
  });

export function useCategory(id: string) {
  const queryClient = useQueryClient();
  const query = useQuery(shopCategoryQueryOptions(id));
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<PostgrestError | null>(
    null,
  );

  const setCategory = useCallback(
    (value: SetStateAction<Categories | null>) =>
      queryClient.setQueryData<CategoryData>(shopCategoryKey(id), (prev) => {
        const current = prev?.category ?? null;
        return {
          category: typeof value === "function" ? value(current) : value,
          subcategories: prev?.subcategories ?? null,
        };
      }),
    [queryClient, id],
  );

  const updateCategory = async (
    updates: Partial<Omit<Categories, "id" | "created_at">>,
  ) => {
    setMutating(true);
    setMutationError(null);

    try {
      const { data, error: updateError } = await supabase
        .from("shop_categories")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating shop category:", updateError);
        setMutationError(updateError);
        return null;
      }

      setCategory(data);
      queryClient.invalidateQueries({ queryKey: ["shop"] });
      return data;
    } catch (err) {
      console.error("Unexpected error updating shop category:", err);
      setMutationError(err as PostgrestError);
      return null;
    } finally {
      setMutating(false);
    }
  };

  const deleteCategory = async () => {
    setMutating(true);
    setMutationError(null);

    try {
      const { error: deleteError } = await supabase
        .from("shop_categories")
        .delete()
        .eq("id", id);

      if (deleteError) {
        console.error("Error deleting shop category:", deleteError);
        setMutationError(deleteError);
        return false;
      }

      setCategory(null);
      queryClient.setQueryData<Categories[]>(shopCategoriesKey, (prev) =>
        prev?.filter((c) => c.id !== id),
      );
      // Mark only: refetching the deleted row now would just error.
      queryClient.invalidateQueries({
        queryKey: ["shop"],
        refetchType: "none",
      });
      return true;
    } catch (err) {
      console.error("Unexpected error deleting shop category:", err);
      setMutationError(err as PostgrestError);
      return false;
    } finally {
      setMutating(false);
    }
  };

  return {
    category: query.data?.category ?? null,
    subcategories: query.data?.subcategories ?? null,
    loading: (query.isPending && !!id) || mutating,
    error: mutationError ?? (query.error as PostgrestError | null),
    setCategory,
    updateCategory,
    deleteCategory,
  };
}
