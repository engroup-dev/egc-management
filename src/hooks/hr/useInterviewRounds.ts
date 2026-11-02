import { useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRound,
  listRoundsForApplicant,
  updateRoundStatus,
} from "../../services/hr/interviewRoundsService";
import type { InterviewRound, InterviewRoundStatus } from "../../types/hr.type";
import type { InterviewRoundFormValues } from "../../types/schema/interviewRound.schema";

export const hrInterviewRoundsKey = (applicantId: string | undefined) =>
  ["hr", "interview-rounds", applicantId] as const;

async function fetchInterviewRounds(
  applicantId: string,
): Promise<InterviewRound[]> {
  const { data, error } = await listRoundsForApplicant(applicantId);
  if (error) throw error;
  return data ?? [];
}

export const hrInterviewRoundsQueryOptions = (applicantId: string | undefined) =>
  queryOptions({
    queryKey: hrInterviewRoundsKey(applicantId),
    queryFn: () => fetchInterviewRounds(applicantId as string),
    enabled: !!applicantId,
  });

export function useInterviewRounds(applicantId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery(hrInterviewRoundsQueryOptions(applicantId));
  const { refetch: refetchQuery } = query;
  const rounds = query.data ?? [];

  const refetch = useCallback(async () => {
    if (!applicantId) return;
    await refetchQuery();
  }, [applicantId, refetchQuery]);

  const addRound = useCallback(
    async (values: InterviewRoundFormValues) => {
      if (!applicantId) return { success: false, message: "لا يوجد متقدم" };
      const nextRoundNumber =
        rounds.reduce((max, r) => Math.max(max, r.round_number), 0) + 1;
      const { data, error } = await createRound(
        applicantId,
        nextRoundNumber,
        values,
      );
      if (error || !data) {
        console.error("Error creating interview round:", error);
        return { success: false, message: "فشل في إضافة جولة المقابلة" };
      }
      queryClient.setQueryData<InterviewRound[]>(
        hrInterviewRoundsKey(applicantId),
        (prev) => [...(prev ?? []), data],
      );
      return { success: true };
    },
    [applicantId, rounds, queryClient],
  );

  const setStatus = useCallback(
    async (id: string, status: InterviewRoundStatus) => {
      const { error } = await updateRoundStatus(id, status);
      if (error) {
        console.error("Error updating round status:", error);
        return { success: false };
      }
      queryClient.setQueryData<InterviewRound[]>(
        hrInterviewRoundsKey(applicantId),
        (prev) => prev?.map((r) => (r.id === id ? { ...r, status } : r)),
      );
      return { success: true };
    },
    [applicantId, queryClient],
  );

  return {
    rounds,
    loading: query.isPending,
    error: query.error ? "فشل في تحميل جولات المقابلة" : null,
    addRound,
    setStatus,
    refetch,
  };
}
