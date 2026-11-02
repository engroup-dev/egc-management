// hooks/shop/divisions/useDivision.ts
// Single-record fetch + update by id, used by the show/edit parent
import { useState, useCallback, SetStateAction } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { Categories, Divisions } from "../../../types/global.type";
import { supabase } from "../../../lib/supabaseClient";
import { shopDivisionsKey } from "./useDivisions";

type DivisionData = {
  division: Divisions | null;
  categories: Categories[] | null;
};

export const shopDivisionKey = (id: string) =>
  ["shop", "division", id] as const;

async function fetchShopDivision(id: string): Promise<DivisionData> {
  const { data, error } = await supabase
    .from("shop_divisions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching shop division:", error);
    throw error;
  }

  const { data: categories, error: categoryError } = await supabase
    .from("shop_categories")
    .select("*")
    .eq("division_id", id);

  if (categoryError) {
    console.error("Error fetching categories:", categoryError);
    throw categoryError;
  }

  return { division: data, categories };
}

export const shopDivisionQueryOptions = (id: string) =>
  queryOptions({
    queryKey: shopDivisionKey(id),
    queryFn: () => fetchShopDivision(id),
    enabled: !!id,
  });

export function useDivision(id: string) {
  const queryClient = useQueryClient();
  const query = useQuery(shopDivisionQueryOptions(id));
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<PostgrestError | null>(
    null,
  );

  const setDivision = useCallback(
    (value: SetStateAction<Divisions | null>) =>
      queryClient.setQueryData<DivisionData>(shopDivisionKey(id), (prev) => {
        const current = prev?.division ?? null;
        return {
          division: typeof value === "function" ? value(current) : value,
          categories: prev?.categories ?? null,
        };
      }),
    [queryClient, id],
  );

  const updateDivision = async (
    updates: Partial<Omit<Divisions, "id" | "created_at">>,
  ) => {
    setMutating(true);
    setMutationError(null);

    try {
      const { data, error: updateError } = await supabase
        .from("shop_divisions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating shop division:", updateError);
        setMutationError(updateError);
        return null;
      }

      setDivision(data);
      queryClient.invalidateQueries({ queryKey: ["shop"] });
      return data;
    } catch (err) {
      console.error("Unexpected error updating shop division:", err);
      setMutationError(err as PostgrestError);
      return null;
    } finally {
      setMutating(false);
    }
  };

  const deleteDivision = async () => {
    setMutating(true);
    setMutationError(null);

    try {
      const { error: deleteError } = await supabase
        .from("shop_divisions")
        .delete()
        .eq("id", id);

      if (deleteError) {
        console.error("Error deleting shop division:", deleteError);
        setMutationError(deleteError);
        return false;
      }

      setDivision(null);
      queryClient.setQueryData<Divisions[]>(shopDivisionsKey, (prev) =>
        prev?.filter((d) => d.id !== id),
      );
      // Mark only: refetching the deleted row now would just error.
      queryClient.invalidateQueries({
        queryKey: ["shop"],
        refetchType: "none",
      });
      return true;
    } catch (err) {
      console.error("Unexpected error deleting shop division:", err);
      setMutationError(err as PostgrestError);
      return false;
    } finally {
      setMutating(false);
    }
  };

  return {
    division: query.data?.division ?? null,
    categories: query.data?.categories ?? null,
    loading: (query.isPending && !!id) || mutating,
    error: mutationError ?? (query.error as PostgrestError | null),
    setDivision,
    updateDivision,
    deleteDivision,
  };
}
