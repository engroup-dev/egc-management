// hooks/useMaps.ts
import { useCallback, useMemo, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { TIERS } from "../lib/queryClient";
import { MapType } from "../types/global.type";
import { drawingKeys } from "./operations/drawings/useProjectDrawings";

export function normalizeError(e: unknown, fallback: string) {
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === "string") return e || fallback;
  if (typeof e === "object" && e && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m || fallback;
  }
  return fallback;
}

// Same key, columns and order as useAllMapTypes (drawings folder picker)
// and prefetchAppCatalogs, so this page and the picker share one cache
// entry and an edit here shows up there. The cache is name-ascending;
// this page has always listed name-descending, so it reads it reversed.
async function fetchMapTypes(): Promise<MapType[]> {
  const { data, error } = await supabase
    .from("map_types")
    .select("*")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

// Exported so the background prefetcher can warm this screen.
export const mapTypesQueryOptions = () =>
  queryOptions({
    queryKey: drawingKeys.mapTypes,
    queryFn: fetchMapTypes,
    ...TIERS.A,
  });

export function useMaps() {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<
    { message: string } | null
  >(null);

  const {
    data,
    isPending: loading,
    error: fetchError,
    refetch: refetchBase,
  } = useQuery(mapTypesQueryOptions());

  const maps = useMemo(() => [...(data ?? [])].reverse(), [data]);

  const error = useMemo(
    () =>
      mutationError ??
      (fetchError
        ? { message: normalizeError(fetchError, "فشل في تحميل أنواع الخرائط") }
        : null),
    [mutationError, fetchError],
  );

  const refetch = useCallback(async () => {
    setMutationError(null);
    await refetchBase();
  }, [refetchBase]);

  const addNew = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("الاسم مطلوب");

      try {
        setMutationError(null);

        const { data, error } = await supabase
          .from("map_types")
          .insert([{ name: trimmed }])
          .select("id,name,created_at")
          .single();

        if (error) throw error;

        const row = data as MapType;

        // Appended to the ascending cache = first in this page's reversed view.
        queryClient.setQueryData<MapType[]>(drawingKeys.mapTypes, (prev) =>
          prev ? [...prev, row] : [row],
        );
        return row;
      } catch (e: unknown) {
        const msg = normalizeError(e, "فشل في إضافة نوع خريطة");
        setMutationError({ message: msg });
        throw new Error(msg);
      }
    },
    [queryClient],
  );

  const edit = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("الاسم مطلوب");

      try {
        setMutationError(null);

        const { error } = await supabase
          .from("map_types")
          .update({ name: trimmed })
          .eq("id", id);

        if (error) throw error;

        queryClient.setQueryData<MapType[]>(drawingKeys.mapTypes, (prev) =>
          prev?.map((m) => (m.id === id ? { ...m, name: trimmed } : m)),
        );
      } catch (e: unknown) {
        const msg = normalizeError(e, "فشل في تعديل نوع الخريطة");
        setMutationError({ message: msg });
        throw new Error(msg);
      }
    },
    [queryClient],
  );

  return useMemo(
    () => ({
      maps,
      loading,
      error,
      refetch,
      addNew,
      edit,
    }),
    [maps, loading, error, refetch, addNew, edit],
  );
}
