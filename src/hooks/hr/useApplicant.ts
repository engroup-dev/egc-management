import { useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { getApplicant } from "../../services/hr/applicantsService";
import type { Applicant } from "../../types/hr.type";
import { hrApplicantsKey } from "./useApplicants";

export const hrApplicantKey = (id: string | undefined) =>
  ["hr", "applicant", id] as const;

async function fetchApplicant(id: string): Promise<Applicant> {
  const { data, error } = await getApplicant(id);
  if (error) throw error;
  return data;
}

export const hrApplicantQueryOptions = (id: string | undefined) =>
  queryOptions({
    queryKey: hrApplicantKey(id),
    queryFn: () => fetchApplicant(id as string),
    enabled: !!id,
  });

export function useApplicant(id: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery(hrApplicantQueryOptions(id));
  const { refetch: refetchQuery } = query;

  // Callers refetch after changing the applicant (status, CV), so the
  // cached applicants list is out of date too.
  const refetch = useCallback(async () => {
    if (!id) return;
    queryClient.invalidateQueries({ queryKey: hrApplicantsKey });
    await refetchQuery();
  }, [id, queryClient, refetchQuery]);

  return {
    applicant: query.data ?? null,
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    refetch,
  };
}
