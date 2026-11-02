import { useCallback } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  listJobRequests,
  listOpenJobRequests,
} from "../../services/hr/jobRequestsService";
import type { JobRequest } from "../../types/hr.type";

/** Prefix for both the full and the open-only list. */
export const hrJobRequestsKey = ["hr", "job-requests"] as const;

async function fetchJobRequests(openOnly: boolean): Promise<JobRequest[]> {
  const { data, error } = openOnly
    ? await listOpenJobRequests()
    : await listJobRequests();
  if (error) throw error;
  return data ?? [];
}

// Exported so the background prefetcher can warm this screen.
export const hrJobRequestsQueryOptions = (openOnly = false) =>
  queryOptions({
    queryKey: [...hrJobRequestsKey, openOnly ? "open" : "all"],
    queryFn: () => fetchJobRequests(openOnly),
  });

export function useJobRequests(openOnly = false) {
  const query = useQuery(hrJobRequestsQueryOptions(openOnly));
  const { refetch: refetchQuery } = query;

  const refetch = useCallback(async () => {
    await refetchQuery();
  }, [refetchQuery]);

  return {
    jobRequests: query.data ?? [],
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    refetch,
  };
}
