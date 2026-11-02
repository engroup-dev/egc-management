import { useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { getJobRequest } from "../../services/hr/jobRequestsService";
import type { JobRequest } from "../../types/hr.type";
import { hrJobRequestsKey } from "./useJobRequests";

export const hrJobRequestKey = (id: string | undefined) =>
  ["hr", "job-request", id] as const;

async function fetchJobRequest(id: string): Promise<JobRequest> {
  const { data, error } = await getJobRequest(id);
  if (error) throw error;
  return data;
}

export const hrJobRequestQueryOptions = (id: string | undefined) =>
  queryOptions({
    queryKey: hrJobRequestKey(id),
    queryFn: () => fetchJobRequest(id as string),
    enabled: !!id,
  });

export function useJobRequest(id: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery(hrJobRequestQueryOptions(id));
  const { refetch: refetchQuery } = query;

  // Callers refetch after a status change, which also moves the request
  // in or out of the cached (open-only) lists.
  const refetch = useCallback(async () => {
    if (!id) return;
    queryClient.invalidateQueries({ queryKey: hrJobRequestsKey });
    await refetchQuery();
  }, [id, queryClient, refetchQuery]);

  return {
    jobRequest: query.data ?? null,
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    refetch,
  };
}
