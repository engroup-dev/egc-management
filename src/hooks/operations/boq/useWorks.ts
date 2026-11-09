import { PostgrestError } from "@supabase/supabase-js";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dispatch, SetStateAction, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { TemplateWorkFull, WorkFull } from "./types";
import { useBulkCreateItems } from "./useItems";
import { computeNextSortOrder } from "./sortOrder";

export interface Work {
  id: string;
  type_id: string;
  zone_id: string;
  name: string;
  sort_order: number;
  template_work_id: string | null;
  created_at: string;
}

/**
 * Plain (non-hook) fetch for a single type's works + items, callable
 * on-demand outside of render (e.g. in parallel for several types/versions).
 */
export async function fetchWorksForType(typeId: string): Promise<WorkFull[]> {
  const { data, error } = await supabase
    .schema("boq")
    .from("works")
    .select(
      `id, type_id, zone_id, name, sort_order, template_work_id,
      items ( id, name, unit, quantity, unit_price, sort_order, created_by )`,
    )
    .eq("type_id", typeId)
    .order("sort_order", { ascending: true })
    .order("sort_order", { ascending: true, referencedTable: "items" });

  if (error) {
    console.error("error fetching works", error);
    throw error;
  }
  return (data ?? []) as unknown as WorkFull[];
}

export const boqTypeWorksKey = (typeId: string) =>
  ["boq", "works", typeId] as const;

export const boqTypeWorksQueryOptions = (typeId: string) =>
  queryOptions({
    queryKey: boqTypeWorksKey(typeId),
    queryFn: () => fetchWorksForType(typeId),
    enabled: !!typeId,
  });

const EMPTY_WORKS: WorkFull[] = [];

export function useTypeWorks(typeId: string) {
  const queryClient = useQueryClient();
  const query = useQuery(boqTypeWorksQueryOptions(typeId));

  // Callers apply optimistic reorders / quantity edits through this.
  const setWorks: Dispatch<SetStateAction<WorkFull[]>> = (action) => {
    queryClient.setQueryData<WorkFull[]>(boqTypeWorksKey(typeId), (prev) =>
      typeof action === "function" ? action(prev ?? []) : action,
    );
  };

  const refetch = async () => {
    if (!typeId) return;
    await query.refetch();
  };

  return {
    works: query.data ?? EMPTY_WORKS,
    setWorks,
    // isLoading: a disabled query (no typeId) must not read as loading.
    loading: query.isLoading,
    error: query.error as PostgrestError | null,
    refetch,
  };
}

export function useCreateWork() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function createWork(
    typeId: string,
    zoneId: string,
    values: { name: string },
    siblings: { sort_order: number }[],
  ) {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .schema("boq")
      .from("works")
      .insert({
        type_id: typeId,
        zone_id: zoneId,
        name: values.name,
        sort_order: computeNextSortOrder(siblings),
      })
      .select("*")
      .single();

    setLoading(false);
    if (error) {
      console.error("error creating work", error);
      setError(error);
      return { data: null, error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { data, error: null };
  }

  return { createWork, loading, error };
}

export function useCreateWorkFromTemplate() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);
  const { bulkCreateItems } = useBulkCreateItems();

  async function createWorkFromTemplate(
    typeId: string,
    zoneId: string,
    templateWork: TemplateWorkFull,
    siblings: { sort_order: number }[],
  ) {
    setLoading(true);
    setError(null);

    const { data: work, error: workError } = await supabase
      .schema("boq")
      .from("works")
      .insert({
        type_id: typeId,
        zone_id: zoneId,
        name: templateWork.name,
        template_work_id: templateWork.id,
        sort_order: computeNextSortOrder(siblings),
      })
      .select("*")
      .single();

    if (workError || !work) {
      console.error("error creating work from template", workError);
      setError(workError);
      setLoading(false);
      return { data: null, error: workError };
    }

    const { error: itemsError } = await bulkCreateItems(
      work.id,
      templateWork.items.map((item) => ({
        name: item.name,
        unit: item.unit,
        quantity: item.default_quantity,
        unit_price: item.default_unit_price,
        sort_order: item.sort_order,
      })),
    );

    setLoading(false);
    // The work row exists either way, so refresh even if items failed.
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    if (itemsError) {
      setError(itemsError);
      return { data: work, error: itemsError };
    }
    return { data: work, error: null };
  }

  return { createWorkFromTemplate, loading, error };
}

export function useUpdateWork() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function updateWork(workId: string, values: { name: string }) {
    setLoading(true);
    setError(null);

    const { error } = await supabase
      .schema("boq")
      .from("works")
      .update({ name: values.name })
      .eq("id", workId);

    setLoading(false);
    if (error) {
      console.error("error updating work", error);
      setError(error);
      return { error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { error: null };
  }

  return { updateWork, loading, error };
}

export function useDeleteWork() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function deleteWork(work: WorkFull) {
    setLoading(true);
    setError(null);

    const itemIds = work.items.map((i) => i.id);

    if (itemIds.length > 0) {
      const { error } = await supabase
        .schema("boq")
        .from("items")
        .delete()
        .in("id", itemIds);
      if (error) {
        setError(error);
        setLoading(false);
        return { error };
      }
    }

    const { error } = await supabase
      .schema("boq")
      .from("works")
      .delete()
      .eq("id", work.id);

    setLoading(false);
    if (error) {
      setError(error);
      return { error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { error: null };
  }

  return { deleteWork, loading, error };
}
