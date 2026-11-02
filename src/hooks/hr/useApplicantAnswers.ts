import { useCallback } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { getAnswersForApplicant } from "../../services/hr/applicantAnswersService";
import type { ApplicantAnswerWithQuestion } from "../../types/hr.type";

export const hrApplicantAnswersKey = (applicantId: string | undefined) =>
  ["hr", "applicant-answers", applicantId] as const;

async function fetchApplicantAnswers(
  applicantId: string,
): Promise<ApplicantAnswerWithQuestion[]> {
  const { data, error } = await getAnswersForApplicant(applicantId);
  if (error) throw error;
  return data;
}

export const hrApplicantAnswersQueryOptions = (
  applicantId: string | undefined,
) =>
  queryOptions({
    queryKey: hrApplicantAnswersKey(applicantId),
    queryFn: () => fetchApplicantAnswers(applicantId as string),
    enabled: !!applicantId,
  });

export function useApplicantAnswers(applicantId: string | undefined) {
  const query = useQuery(hrApplicantAnswersQueryOptions(applicantId));
  const { refetch: refetchQuery } = query;

  const refetch = useCallback(async () => {
    if (!applicantId) return;
    await refetchQuery();
  }, [applicantId, refetchQuery]);

  return {
    answers: query.data ?? [],
    loading: query.isPending,
    error: query.error ? "فشل في تحميل إجابات الاستبيان" : null,
    refetch,
  };
}
