import { PostgrestError } from "@supabase/supabase-js";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dispatch, SetStateAction, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { computeNextSortOrder } from "./sortOrder";

export interface Zone {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export const boqZonesKey = (projectId: string) =>
  ["boq", "zones", projectId] as const;

async function fetchZones(projectId: string): Promise<Zone[]> {
  const { data, error } = await supabase
    .schema("boq")
    .from("zones")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("error fetching zones", error);
    throw error;
  }
  return data ?? [];
}

export const boqZonesQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: boqZonesKey(projectId),
    queryFn: () => fetchZones(projectId),
    enabled: !!projectId,
  });

export function useZones(projectId: string) {
  const queryClient = useQueryClient();
  const query = useQuery(boqZonesQueryOptions(projectId));

  // Callers apply optimistic reorders through this, so it writes the cache.
  const setZones: Dispatch<SetStateAction<Zone[]>> = (action) => {
    queryClient.setQueryData<Zone[]>(boqZonesKey(projectId), (prev) =>
      typeof action === "function" ? action(prev ?? []) : action,
    );
  };

  const refetch = async () => {
    if (!projectId) return;
    await query.refetch();
  };

  return {
    zones: query.data ?? [],
    setZones,
    // isLoading: a disabled query (no projectId) must not read as loading.
    loading: query.isLoading,
    error: query.error as PostgrestError | null,
    refetch,
  };
}

export function useCreateZone() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function createZone(
    projectId: string,
    values: { name: string },
    siblings: { sort_order: number }[],
  ) {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .schema("boq")
      .from("zones")
      .insert({
        project_id: projectId,
        name: values.name,
        sort_order: computeNextSortOrder(siblings),
      })
      .select("*")
      .single();

    setLoading(false);
    if (error) {
      console.error("error creating zone", error);
      setError(error);
      return { data: null, error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { data, error: null };
  }

  return { createZone, loading, error };
}

export function useUpdateZone() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function updateZone(zoneId: string, values: { name: string }) {
    setLoading(true);
    setError(null);

    const { error } = await supabase
      .schema("boq")
      .from("zones")
      .update({ name: values.name })
      .eq("id", zoneId);

    setLoading(false);
    if (error) {
      console.error("error updating zone", error);
      setError(error);
      return { error };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { error: null };
  }

  return { updateZone, loading, error };
}

const FOREIGN_KEY_VIOLATION = "23503";

export function useDeleteZone() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  async function deleteZone(zoneId: string) {
    setLoading(true);
    setError(null);

    const { error } = await supabase
      .schema("boq")
      .from("zones")
      .delete()
      .eq("id", zoneId);

    setLoading(false);
    if (error) {
      setError(error);
      if (error.code === FOREIGN_KEY_VIOLATION) {
        return {
          error,
          blocked: true as const,
          message: "هذه المنطقة مستخدمة في بنود قائمة، لا يمكن حذفها",
        };
      }
      return { error, blocked: false as const };
    }
    queryClient.invalidateQueries({ queryKey: ["boq"] });
    return { error: null, blocked: false as const };
  }

  return { deleteZone, loading, error };
}
