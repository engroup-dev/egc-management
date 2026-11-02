import { useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addJobRequestQuestionOption,
  addFreeformQuestion,
  copyBankQuestionToJobRequest,
  deleteJobRequestQuestion,
  deleteJobRequestQuestionOption,
  listQuestionsForJobRequest,
  reorderJobRequestQuestions,
  updateJobRequestQuestion,
  updateJobRequestQuestionOption,
  type AddFreeformQuestionInput,
} from "../../services/hr/jobRequestQuestionsService";
import type { JobRequestQuestionWithOptions } from "../../types/hr.type";

export const hrJobRequestQuestionsKey = (jobRequestId: string | undefined) =>
  ["hr", "job-request-questions", jobRequestId] as const;

async function fetchJobRequestQuestions(
  jobRequestId: string,
): Promise<JobRequestQuestionWithOptions[]> {
  const { data, error } = await listQuestionsForJobRequest(jobRequestId);
  if (error) throw error;
  return data;
}

export const hrJobRequestQuestionsQueryOptions = (
  jobRequestId: string | undefined,
) =>
  queryOptions({
    queryKey: hrJobRequestQuestionsKey(jobRequestId),
    queryFn: () => fetchJobRequestQuestions(jobRequestId as string),
    enabled: !!jobRequestId,
  });

export function useJobRequestQuestions(jobRequestId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery(hrJobRequestQuestionsQueryOptions(jobRequestId));
  const { refetch: refetchQuery } = query;
  const questions = query.data ?? [];

  const setQuestions = useCallback(
    (
      updater: (
        prev: JobRequestQuestionWithOptions[],
      ) => JobRequestQuestionWithOptions[],
    ) => {
      queryClient.setQueryData<JobRequestQuestionWithOptions[]>(
        hrJobRequestQuestionsKey(jobRequestId),
        (prev) => updater(prev ?? []),
      );
    },
    [queryClient, jobRequestId],
  );

  const refetch = useCallback(async () => {
    if (!jobRequestId) return;
    await refetchQuery();
  }, [jobRequestId, refetchQuery]);

  const copyFromBank = useCallback(
    async (bankQuestionId: string) => {
      if (!jobRequestId) return { success: false };
      const { error } = await copyBankQuestionToJobRequest(
        jobRequestId,
        bankQuestionId,
      );
      if (error) {
        console.error("Error copying bank question:", error);
        return { success: false };
      }
      await refetch();
      return { success: true };
    },
    [jobRequestId, refetch],
  );

  const addFreeform = useCallback(
    async (input: Omit<AddFreeformQuestionInput, "jobRequestId">) => {
      if (!jobRequestId) return { success: false, message: "لا يوجد طلب توظيف" };
      const result = await addFreeformQuestion({ ...input, jobRequestId });
      if (result.success) await refetch();
      return result;
    },
    [jobRequestId, refetch],
  );

  const update = useCallback(
    async (id: string, fields: Parameters<typeof updateJobRequestQuestion>[1]) => {
      const { error } = await updateJobRequestQuestion(id, fields);
      if (error) return { success: false };
      await refetch();
      return { success: true };
    },
    [refetch],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await deleteJobRequestQuestion(id);
      if (error) return { success: false };
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      return { success: true };
    },
    [setQuestions],
  );

  const reorder = useCallback(
    async (next: JobRequestQuestionWithOptions[]) => {
      const withOrder = next.map((q, index) => ({ ...q, sort_order: index }));
      setQuestions(() => withOrder);
      const { error } = await reorderJobRequestQuestions(
        withOrder.map((q) => ({ id: q.id, sort_order: q.sort_order })),
      );
      if (error) {
        console.error("Error reordering job request questions:", error);
        refetch();
      }
    },
    [setQuestions, refetch],
  );

  const addOption = useCallback(
    async (
      jobRequestQuestionId: string,
      optionText: string,
      score: number,
    ) => {
      const question = questions.find((q) => q.id === jobRequestQuestionId);
      const nextSortOrder =
        (question?.job_request_question_options ?? []).reduce(
          (max, o) => Math.max(max, o.sort_order),
          0,
        ) + 1;
      const { error } = await addJobRequestQuestionOption(
        jobRequestQuestionId,
        optionText,
        nextSortOrder,
        score,
      );
      if (error) return { success: false };
      await refetch();
      return { success: true };
    },
    [questions, refetch],
  );

  const editOption = useCallback(
    async (optionId: string, optionText: string, score: number) => {
      const { error } = await updateJobRequestQuestionOption(
        optionId,
        optionText,
        score,
      );
      if (error) return { success: false };
      await refetch();
      return { success: true };
    },
    [refetch],
  );

  const removeOption = useCallback(
    async (optionId: string) => {
      const { error } = await deleteJobRequestQuestionOption(optionId);
      if (error) return { success: false };
      await refetch();
      return { success: true };
    },
    [refetch],
  );

  return {
    questions,
    loading: query.isPending,
    error: query.error ? "فشل في تحميل أسئلة الوظيفة" : null,
    refetch,
    copyFromBank,
    addFreeform,
    update,
    remove,
    reorder,
    addOption,
    editOption,
    removeOption,
  };
}
