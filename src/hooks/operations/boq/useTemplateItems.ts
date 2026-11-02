import { PostgrestError } from "@supabase/supabase-js";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { TemplateItemRow } from "./types";
import { computeNextSortOrder } from "./sortOrder";

export interface TemplateItemFormValues {
  name: string;
  unit: string;
  default_quantity: number;
  default_unit_price: number | null;
}

/**
 * List-by-work query for template items, standalone (not nested through a
 * template type's works), for UIs that only have a template_work_id in
 * scope — e.g. an item dialog offering "create from template".
 */
export const boqTemplateWorkItemsKey = (templateWorkId: string) =>
  ["boq", "template-items", templateWorkId] as const;

async function fetchTemplateWorkItems(
  templateWorkId: string,
): Promise<TemplateItemRow[]> {
  const { data, error } = await supabase
    .schema("boq")
    .from("template_items")
    .select("id, name, unit, default_quantity, default_unit_price, sort_order")
    .eq("template_work_id", templateWorkId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("error fetching template work items", error);
    throw error;
  }
  return data ?? [];
}

export const boqTemplateWorkItemsQueryOptions = (templateWorkId: string) =>
  queryOptions({
    queryKey: boqTemplateWorkItemsKey(templateWorkId),
    queryFn: () => fetchTemplateWorkItems(templateWorkId),
    enabled: !!templateWorkId,
  });

export function useTemplateWorkItems(templateWorkId: string) {
  const query = useQuery(boqTemplateWorkItemsQueryOptions(templateWorkId));

  const refetch = async () => {
    if (!templateWorkId) return;
    await query.refetch();
  };

  return {
    items: query.data ?? [],
    // isLoading: a disabled query (no templateWorkId) must not read as loading.
    loading: query.isLoading,
    error: query.error as PostgrestError | null,
    refetch,
  };
}

export function useCreateTemplateItem() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function createTemplateItem(
    templateWorkId: string,
    values: TemplateItemFormValues,
    siblings: { sort_order: number }[],
  ) {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .schema("boq")
      .from("template_items")
      .insert({
        template_work_id: templateWorkId,
        name: values.name,
        unit: values.unit,
        default_quantity: values.default_quantity,
        default_unit_price: values.default_unit_price,
        sort_order: computeNextSortOrder(siblings),
      })
      .select("*")
      .single();

    setLoading(false);
    if (error) {
      console.error("error creating template item", error);
      setError(error);
      return { data: null, error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { data, error: null };
  }

  return { createTemplateItem, loading, error };
}

export function useUpdateTemplateItem() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function updateTemplateItem(
    templateItemId: string,
    values: TemplateItemFormValues,
  ) {
    setLoading(true);
    setError(null);

    const { error } = await supabase
      .schema("boq")
      .from("template_items")
      .update({
        name: values.name,
        unit: values.unit,
        default_quantity: values.default_quantity,
        default_unit_price: values.default_unit_price,
      })
      .eq("id", templateItemId);

    setLoading(false);
    if (error) {
      console.error("error updating template item", error);
      setError(error);
      return { error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { error: null };
  }

  return { updateTemplateItem, loading, error };
}

export function useDeleteTemplateItem() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function deleteTemplateItem(templateItemId: string) {
    setLoading(true);
    setError(null);

    const { error } = await supabase
      .schema("boq")
      .from("template_items")
      .delete()
      .eq("id", templateItemId);

    setLoading(false);
    if (error) {
      setError(error);
      return { error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { error: null };
  }

  return { deleteTemplateItem, loading, error };
}
