import { useCallback } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  listReviewsForEmployee,
  submitPerformanceReview,
  type SubmitPerformanceReviewInput,
} from "../../services/hr/performanceReviewService";
import type { PerformanceReviewWithRatings } from "../../types/hr.type";

export const hrPerformanceReviewsKey = (employeeId: string | undefined) =>
  ["hr", "performance-reviews", employeeId] as const;

async function fetchPerformanceReviews(
  employeeId: string,
): Promise<PerformanceReviewWithRatings[]> {
  const { data, error } = await listReviewsForEmployee(employeeId);
  if (error) throw error;
  return data;
}

export const hrPerformanceReviewsQueryOptions = (
  employeeId: string | undefined,
) =>
  queryOptions({
    queryKey: hrPerformanceReviewsKey(employeeId),
    queryFn: () => fetchPerformanceReviews(employeeId as string),
    enabled: !!employeeId,
  });

export function usePerformanceReviews(employeeId: string | undefined) {
  const query = useQuery(hrPerformanceReviewsQueryOptions(employeeId));
  const { refetch: refetchQuery } = query;

  const refetch = useCallback(async () => {
    if (!employeeId) return;
    await refetchQuery();
  }, [employeeId, refetchQuery]);

  const submit = useCallback(
    async (input: SubmitPerformanceReviewInput) => {
      const result = await submitPerformanceReview(input);
      if (result.success) await refetch();
      return result;
    },
    [refetch],
  );

  return {
    reviews: query.data ?? [],
    loading: query.isPending,
    error: query.error ? "فشل في تحميل تقييمات الأداء" : null,
    submit,
    refetch,
  };
}
