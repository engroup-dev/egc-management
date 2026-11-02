import { useState, useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Divisions } from "../../../types/global.type";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import { ShopDivisionFormValues } from "../../../types/schema/shop/division.schema";

export const shopDivisionsKey = ["shop", "divisions"] as const;

async function fetchShopDivisions(): Promise<Divisions[]> {
  const { data, error } = await supabase.from("shop_divisions").select("*");
  if (error) {
    console.error("Error fetching shop divisions:", error);
    throw error;
  }
  return data ?? [];
}

// Exported so the background prefetcher can warm this screen.
export const shopDivisionsQueryOptions = () =>
  queryOptions({ queryKey: shopDivisionsKey, queryFn: fetchShopDivisions });

export function useDivisions() {
  const queryClient = useQueryClient();
  const query = useQuery(shopDivisionsQueryOptions());
  // Forms read `loading` / `error` for their own submit.
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<PostgrestError | null>(
    null,
  );

  const setActive = useCallback(
    (id: string, isActive: boolean) =>
      queryClient.setQueryData<Divisions[]>(shopDivisionsKey, (prev) =>
        prev?.map((d) => (d.id === id ? { ...d, is_active: isActive } : d)),
      ),
    [queryClient],
  );

  const addDivision = async (division: ShopDivisionFormValues) => {
    setMutating(true);
    setMutationError(null);

    try {
      const { data, error: insertError } = await supabase
        .from("shop_divisions")
        .insert([division])
        .select()
        .single();

      if (insertError) {
        console.error("Error adding shop division:", insertError);
        setMutationError(insertError);
        return null;
      }

      queryClient.setQueryData<Divisions[]>(shopDivisionsKey, (prev) =>
        prev ? [...prev, data] : prev,
      );
      queryClient.invalidateQueries({ queryKey: ["shop"] });
      return data;
    } catch (err) {
      console.error("Unexpected error adding shop division:", err);
      setMutationError(err as PostgrestError);
      return null;
    } finally {
      setMutating(false);
    }
  };

  const toggleDivisionActive = async (id: string, isActive: boolean) => {
    setMutationError(null);

    // optimistic update
    setActive(id, isActive);

    try {
      const { data, error: updateError } = await supabase
        .from("shop_divisions")
        .update({ is_active: isActive })
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        console.error("Error toggling division status:", updateError);
        setMutationError(updateError);
        // revert on failure
        setActive(id, !isActive);
        return null;
      }

      queryClient.invalidateQueries({ queryKey: ["shop"] });
      return data;
    } catch (err) {
      console.error("Unexpected error toggling division status:", err);
      setMutationError(err as PostgrestError);
      setActive(id, !isActive);
      return null;
    }
  };

  return {
    divisions: query.data ?? [],
    loading: query.isPending || mutating,
    error: mutationError ?? (query.error as PostgrestError | null),
    addDivision,
    toggleDivisionActive,
  };
}
