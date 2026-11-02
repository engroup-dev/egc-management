import { useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApplicantScore } from "../../services/hr/applicantScoresService";
import type { ApplicantScore } from "../../types/hr.type";
import { hrApplicantsKey } from "./useApplicants";

export const hrApplicantScoreKey = (applicantId: string | undefined) =>
  ["hr", "applicant-score", applicantId] as const;

async function fetchApplicantScore(
  applicantId: string,
): Promise<ApplicantScore | null> {
  const { data, error } = await getApplicantScore(applicantId);
  if (error) throw error;
  return data;
}

export const hrApplicantScoreQueryOptions = (applicantId: string | undefined) =>
  queryOptions({
    queryKey: hrApplicantScoreKey(applicantId),
    queryFn: () => fetchApplicantScore(applicantId as string),
    enabled: !!applicantId,
  });

export function useApplicantScore(applicantId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery(hrApplicantScoreQueryOptions(applicantId));
  const { refetch: refetchQuery } = query;

  // The applicants list shows each total, so a rescored applicant makes it stale.
  const refetch = useCallback(async () => {
    if (!applicantId) return;
    queryClient.invalidateQueries({ queryKey: hrApplicantsKey });
    await refetchQuery();
  }, [applicantId, queryClient, refetchQuery]);

  return { score: query.data ?? null, loading: query.isPending, refetch };
}
