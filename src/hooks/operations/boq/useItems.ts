import { PostgrestError } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../useAuth";
import { supabase } from "../../../lib/supabaseClient";
import { computeNextSortOrder } from "./sortOrder";
import { ItemRow } from "./types";

export interface Item {
  id: string;
  work_id: string;
  name: string;
  unit: string;
  quantity: number;
  unit_price: number | null;
  sort_order: number;
  created_at: string;
  created_by: string;
}

export interface ItemFormValues {
  name: string;
  unit: string;
  quantity: number;
  unit_price: number | null;
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);
  const { user } = useAuth();

  async function createItem(
    workId: string,
    values: ItemFormValues,
    siblings: { sort_order: number }[],
  ) {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .schema("boq")
      .from("items")
      .insert({
        work_id: workId,
        name: values.name,
        unit: values.unit,
        quantity: values.quantity,
        unit_price: values.unit_price,
        sort_order: computeNextSortOrder(siblings),
        created_by: user?.id ?? "",
      })
      .select("*")
      .single();

    setLoading(false);
    if (error) {
      console.error("error creating item", error);
      setError(error);
      return { data: null, error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { data, error: null };
  }

  return { createItem, loading, error };
}

export function useUpdateItem() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function updateItem(itemId: string, values: ItemFormValues) {
    setLoading(true);
    setError(null);

    const { error } = await supabase
      .schema("boq")
      .from("items")
      .update({
        name: values.name,
        unit: values.unit,
        quantity: values.quantity,
        unit_price: values.unit_price,
      })
      .eq("id", itemId);

    setLoading(false);
    if (error) {
      console.error("error updating item", error);
      setError(error);
      return { error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { error: null };
  }

  return { updateItem, loading, error };
}

export interface QuantityUpdate {
  id: string;
  quantity: number;
}

/**
 * Bulk-persists inline quantity edits made directly in the BOQ tree.
 * Upserts full rows (not just id/quantity) because Postgres validates
 * NOT NULL columns on the candidate row before checking for a conflict.
 */
export function useBulkUpdateQuantities() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function bulkUpdateQuantities(workId: string, items: ItemRow[]) {
    if (items.length === 0) return { error: null };

    setLoading(true);
    setError(null);

    const { error } = await supabase
      .schema("boq")
      .from("items")
      .upsert(
        items.map((item) => ({
          id: item.id,
          work_id: workId,
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          unit_price: item.unit_price,
          sort_order: item.sort_order,
          created_by: item.created_by,
        })),
        { onConflict: "id" },
      );

    setLoading(false);
    if (error) {
      console.error("error bulk updating item quantities", error);
      setError(error);
      return { error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { error: null };
  }

  return { bulkUpdateQuantities, loading, error };
}

export interface BulkItemInput {
  name: string;
  unit: string;
  quantity: number;
  unit_price: number | null;
  sort_order: number;
}

export function useBulkCreateItems() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);
  const { user } = useAuth();

  async function bulkCreateItems(workId: string, items: BulkItemInput[]) {
    if (items.length === 0) return { data: [], error: null };

    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .schema("boq")
      .from("items")
      .insert(
        items.map((item) => ({
          work_id: workId,
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          unit_price: item.unit_price,
          sort_order: item.sort_order,
          created_by: user?.id ?? "",
        })),
      )
      .select("*");

    setLoading(false);
    if (error) {
      console.error("error bulk creating items", error);
      setError(error);
      return { data: null, error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { data, error: null };
  }

  return { bulkCreateItems, loading, error };
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function deleteItem(itemId: string) {
    setLoading(true);
    setError(null);

    const { error } = await supabase
      .schema("boq")
      .from("items")
      .delete()
      .eq("id", itemId);

    setLoading(false);
    if (error) {
      setError(error);
      return { error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { error: null };
  }

  return { deleteItem, loading, error };
}
