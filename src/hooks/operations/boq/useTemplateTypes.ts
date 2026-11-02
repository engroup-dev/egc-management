import { PostgrestError } from "@supabase/supabase-js";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dispatch, SetStateAction, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { computeNextSortOrder } from "./sortOrder";

export interface TemplateType {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export const boqTemplateTypesKey = ["boq", "template-types"] as const;

async function fetchTemplateTypes(): Promise<TemplateType[]> {
  const { data, error } = await supabase
    .schema("boq")
    .from("template_types")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("error fetching template types", error);
    throw error;
  }
  return data ?? [];
}

// Exported so the background prefetcher can warm this screen.
export const boqTemplateTypesQueryOptions = () =>
  queryOptions({
    queryKey: boqTemplateTypesKey,
    queryFn: fetchTemplateTypes,
  });

export function useTemplateTypes() {
  const queryClient = useQueryClient();
  const query = useQuery(boqTemplateTypesQueryOptions());

  // Callers apply optimistic reorders through this, so it writes the cache.
  const setTemplateTypes: Dispatch<SetStateAction<TemplateType[]>> = (
    action,
  ) => {
    queryClient.setQueryData<TemplateType[]>(boqTemplateTypesKey, (prev) =>
      typeof action === "function" ? action(prev ?? []) : action,
    );
  };

  return {
    templateTypes: query.data ?? [],
    setTemplateTypes,
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export function useCreateTemplateType() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function createTemplateType(
    values: { name: string },
    siblings: { sort_order: number }[],
  ) {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .schema("boq")
      .from("template_types")
      .insert({
        name: values.name,
        sort_order: computeNextSortOrder(siblings),
      })
      .select("*")
      .single();

    setLoading(false);
    if (error) {
      console.error("error creating template type", error);
      setError(error);
      return { data: null, error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { data, error: null };
  }

  return { createTemplateType, loading, error };
}

export function useUpdateTemplateType() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function updateTemplateType(
    templateTypeId: string,
    values: { name: string },
  ) {
    setLoading(true);
    setError(null);

    const { error } = await supabase
      .schema("boq")
      .from("template_types")
      .update({ name: values.name })
      .eq("id", templateTypeId);

    setLoading(false);
    if (error) {
      console.error("error updating template type", error);
      setError(error);
      return { error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { error: null };
  }

  return { updateTemplateType, loading, error };
}

export function useDeleteTemplateType() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function deleteTemplateType(templateTypeId: string) {
    setLoading(true);
    setError(null);

    const { data: works, error: fetchError } = await supabase
      .schema("boq")
      .from("template_works")
      .select("id, template_items ( id )")
      .eq("template_type_id", templateTypeId);

    if (fetchError) {
      setError(fetchError);
      setLoading(false);
      return { error: fetchError };
    }

    const rows = works ?? [];
    const itemIds = rows.flatMap((w) => w.template_items.map((i) => i.id));
    const workIds = rows.map((w) => w.id);

    if (itemIds.length > 0) {
      const { error } = await supabase
        .schema("boq")
        .from("template_items")
        .delete()
        .in("id", itemIds);
      if (error) {
        setError(error);
        setLoading(false);
        return { error };
      }
    }

    if (workIds.length > 0) {
      const { error } = await supabase
        .schema("boq")
        .from("template_works")
        .delete()
        .in("id", workIds);
      if (error) {
        setError(error);
        setLoading(false);
        return { error };
      }
    }

    const { error } = await supabase
      .schema("boq")
      .from("template_types")
      .delete()
      .eq("id", templateTypeId);

    setLoading(false);
    if (error) {
      setError(error);
      return { error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { error: null };
  }

  return { deleteTemplateType, loading, error };
}
