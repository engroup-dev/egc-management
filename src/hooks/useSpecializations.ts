// hooks/useSpecializations.ts
import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { Specializations } from "../types/global.type";

export type Specialization = { id: string; name: string };

export const specialitiesKey = ["settings", "specialities"] as const;

async function fetchSpecialities(): Promise<Specializations[]> {
  const { data, error } = await supabase
    .from("specialities")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Shared with useUtils: both read the same list, so one cache entry.
// Default tier, not A: the settings page inserts specialities without
// touching this cache, so it must not stay fresh for an hour.
// Exported so the background prefetcher can warm this screen.
export const specialitiesQueryOptions = () =>
  queryOptions({ queryKey: specialitiesKey, queryFn: fetchSpecialities });

export function useSpecializations() {
  const query = useQuery(specialitiesQueryOptions());

  return {
    data: (query.data ?? []) as Specialization[],
    loading: query.isPending,
    error: query.error as Error | null,
  };
}
