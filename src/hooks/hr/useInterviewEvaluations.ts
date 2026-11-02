import { useCallback } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  listEvaluationsForApplicant,
  submitInterviewEvaluation,
  type SubmitInterviewEvaluationInput,
} from "../../services/hr/interviewEvaluationService";
import type { InterviewEvaluationWithRatings } from "../../types/hr.type";

export const hrInterviewEvaluationsKey = (applicantId: string | undefined) =>
  ["hr", "interview-evaluations", applicantId] as const;

async function fetchInterviewEvaluations(
  applicantId: string,
): Promise<InterviewEvaluationWithRatings[]> {
  const { data, error } = await listEvaluationsForApplicant(applicantId);
  if (error) throw error;
  return data;
}

export const hrInterviewEvaluationsQueryOptions = (
  applicantId: string | undefined,
) =>
  queryOptions({
    queryKey: hrInterviewEvaluationsKey(applicantId),
    queryFn: () => fetchInterviewEvaluations(applicantId as string),
    enabled: !!applicantId,
  });

export function useInterviewEvaluations(applicantId: string | undefined) {
  const query = useQuery(hrInterviewEvaluationsQueryOptions(applicantId));
  const { refetch: refetchQuery } = query;

  const refetch = useCallback(async () => {
    if (!applicantId) return;
    await refetchQuery();
  }, [applicantId, refetchQuery]);

  const submit = useCallback(
    async (input: SubmitInterviewEvaluationInput) => {
      const result = await submitInterviewEvaluation(input);
      if (result.success) await refetch();
      return result;
    },
    [refetch],
  );

  return {
    evaluations: query.data ?? [],
    loading: query.isPending,
    error: query.error ? "فشل في تحميل تقييمات المقابلة" : null,
    submit,
    refetch,
  };
}
