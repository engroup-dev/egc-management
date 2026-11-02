import { useState, useCallback, SetStateAction } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { Subcategories } from "../../../types/global.type";
import { supabase } from "../../../lib/supabaseClient";
import { shopSubcategoriesKey } from "./useSubcategories";

export const shopSubcategoryKey = (id: string) =>
  ["shop", "subcategory", id] as const;

async function fetchShopSubcategory(id: string): Promise<Subcategories | null> {
  const { data, error } = await supabase
    .from("shop_subcategories")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching shop subcategory:", error);
    throw error;
  }
  return data;
}

export const shopSubcategoryQueryOptions = (id: string) =>
  queryOptions({
    queryKey: shopSubcategoryKey(id),
    queryFn: () => fetchShopSubcategory(id),
    enabled: !!id,
  });

export function useSubcategory(id: string) {
  const queryClient = useQueryClient();
  const query = useQuery(shopSubcategoryQueryOptions(id));
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<PostgrestError | null>(
    null,
  );

  const setSubcategory = useCallback(
    (value: SetStateAction<Subcategories | null>) =>
      queryClient.setQueryData<Subcategories | null>(
        shopSubcategoryKey(id),
        (prev) => (typeof value === "function" ? value(prev ?? null) : value),
      ),
    [queryClient, id],
  );

  const updateSubcategory = async (
    updates: Partial<Omit<Subcategories, "id" | "created_at">>,
  ) => {
    setMutating(true);
    setMutationError(null);

    try {
      const { data, error: updateError } = await supabase
        .from("shop_subcategories")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating shop subcategory:", updateError);
        setMutationError(updateError);
        return null;
      }

      setSubcategory(data);
      queryClient.invalidateQueries({ queryKey: ["shop"] });
      return data;
    } catch (err) {
      console.error("Unexpected error updating shop subcategory:", err);
      setMutationError(err as PostgrestError);
      return null;
    } finally {
      setMutating(false);
    }
  };

  const deleteSubcategory = async () => {
    setMutating(true);
    setMutationError(null);

    try {
      const { error: deleteError } = await supabase
        .from("shop_subcategories")
        .delete()
        .eq("id", id);

      if (deleteError) {
        console.error("Error deleting shop subcategory:", deleteError);
        setMutationError(deleteError);
        return false;
      }

      setSubcategory(null);
      queryClient.setQueryData<Subcategories[]>(shopSubcategoriesKey, (prev) =>
        prev?.filter((s) => s.id !== id),
      );
      // Mark only: refetching the deleted row now would just error.
      queryClient.invalidateQueries({
        queryKey: ["shop"],
        refetchType: "none",
      });
      return true;
    } catch (err) {
      console.error("Unexpected error deleting shop subcategory:", err);
      setMutationError(err as PostgrestError);
      return false;
    } finally {
      setMutating(false);
    }
  };

  return {
    subcategory: query.data ?? null,
    loading: (query.isPending && !!id) || mutating,
    error: mutationError ?? (query.error as PostgrestError | null),
    setSubcategory,
    updateSubcategory,
    deleteSubcategory,
  };
}
