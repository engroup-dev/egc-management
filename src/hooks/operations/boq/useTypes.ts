import { PostgrestError } from "@supabase/supabase-js";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dispatch, SetStateAction, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { computeNextSortOrder } from "./sortOrder";

export interface BOQType {
  id: string;
  project_id: string;
  name: string;
  version: number;
  sort_order: number;
  created_at: string;
  template_type_id: string | null;
}

/**
 * Plain (non-hook) fetch for every version of a type name within a project,
 * callable on-demand (e.g. from a report dialog's submit handler).
 */
export async function fetchTypesByName(
  projectId: string,
  name: string,
): Promise<BOQType[]> {
  const { data, error } = await supabase
    .schema("boq")
    .from("types")
    .select("*")
    .eq("project_id", projectId)
    .eq("name", name)
    .order("version", { ascending: true });

  if (error) {
    console.error("error fetching type versions", error);
    throw error;
  }
  return data ?? [];
}

export const boqTypesKey = (projectId: string) =>
  ["boq", "types", projectId] as const;

async function fetchTypes(projectId: string): Promise<BOQType[]> {
  const { data, error } = await supabase
    .schema("boq")
    .from("types")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("error fetching types", error);
    throw error;
  }
  return data ?? [];
}

export const boqTypesQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: boqTypesKey(projectId),
    queryFn: () => fetchTypes(projectId),
    enabled: !!projectId,
  });

export function useTypes(projectId: string) {
  const queryClient = useQueryClient();
  const query = useQuery(boqTypesQueryOptions(projectId));

  // Callers apply optimistic reorders through this, so it writes the cache.
  const setTypes: Dispatch<SetStateAction<BOQType[]>> = (action) => {
    queryClient.setQueryData<BOQType[]>(boqTypesKey(projectId), (prev) =>
      typeof action === "function" ? action(prev ?? []) : action,
    );
  };

  const refetch = async () => {
    if (!projectId) return;
    await query.refetch();
  };

  return {
    types: query.data ?? [],
    setTypes,
    // isLoading, not isPending: a disabled query (no projectId) is pending
    // forever, and the old hook reported false there.
    loading: query.isLoading,
    error: query.error as PostgrestError | null,
    refetch,
  };
}

export function useCreateType() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function createType(
    projectId: string,
    values: { name: string; version: number },
    siblings: { sort_order: number }[],
  ) {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .schema("boq")
      .from("types")
      .insert({
        project_id: projectId,
        name: values.name,
        version: values.version,
        sort_order: computeNextSortOrder(siblings),
      })
      .select("*")
      .single();

    setLoading(false);
    if (error) {
      console.error("error creating type", error);
      setError(error);
      return { data: null, error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { data, error: null };
  }

  return { createType, loading, error };
}

export function useUpdateType() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function updateType(
    typeId: string,
    values: { name: string; version: number },
  ) {
    setLoading(true);
    setError(null);

    const { error } = await supabase
      .schema("boq")
      .from("types")
      .update({ name: values.name, version: values.version })
      .eq("id", typeId);

    setLoading(false);
    if (error) {
      console.error("error updating type", error);
      setError(error);
      return { error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { error: null };
  }

  return { updateType, loading, error };
}

export function useDeleteType() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function deleteType(typeId: string) {
    setLoading(true);
    setError(null);

    const { data: works, error: fetchError } = await supabase
      .schema("boq")
      .from("works")
      .select("id, items ( id )")
      .eq("type_id", typeId);

    if (fetchError) {
      setError(fetchError);
      setLoading(false);
      return { error: fetchError };
    }

    const rows = works ?? [];
    const itemIds = rows.flatMap((w) => w.items.map((i) => i.id));
    const workIds = rows.map((w) => w.id);

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

    if (workIds.length > 0) {
      const { error } = await supabase
        .schema("boq")
        .from("works")
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
      .from("types")
      .delete()
      .eq("id", typeId);

    setLoading(false);
    if (error) {
      setError(error);
      return { error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { error: null };
  }

  return { deleteType, loading, error };
}
