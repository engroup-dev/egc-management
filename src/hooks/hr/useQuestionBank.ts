import { useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addBankOption,
  createBankQuestion,
  deleteBankOption,
  listQuestionBank,
  reorderBankQuestions,
  setBankQuestionActive,
  updateBankOption,
  updateBankQuestion,
  type CreateBankQuestionInput,
} from "../../services/hr/questionBankService";
import type { QuestionBankWithOptions } from "../../types/hr.type";

export const hrQuestionBankKey = ["hr", "question-bank"] as const;

async function fetchQuestionBank(): Promise<QuestionBankWithOptions[]> {
  const { data, error } = await listQuestionBank();
  if (error) throw error;
  return (data ?? []) as QuestionBankWithOptions[];
}

// Exported so the background prefetcher can warm this screen.
export const hrQuestionBankQueryOptions = () =>
  queryOptions({ queryKey: hrQuestionBankKey, queryFn: fetchQuestionBank });

export function useQuestionBank() {
  const queryClient = useQueryClient();
  const query = useQuery(hrQuestionBankQueryOptions());
  const { refetch: refetchQuery } = query;
  const questions = query.data ?? [];

  const setQuestions = useCallback(
    (
      updater: (prev: QuestionBankWithOptions[]) => QuestionBankWithOptions[],
    ) => {
      queryClient.setQueryData<QuestionBankWithOptions[]>(
        hrQuestionBankKey,
        (prev) => updater(prev ?? []),
      );
    },
    [queryClient],
  );

  const refetch = useCallback(async () => {
    await refetchQuery();
  }, [refetchQuery]);

  const create = useCallback(
    async (input: CreateBankQuestionInput) => {
      const result = await createBankQuestion(input);
      if (result.success) await refetch();
      return result;
    },
    [refetch],
  );

  const update = useCallback(
    async (id: string, fields: Parameters<typeof updateBankQuestion>[1]) => {
      const { error } = await updateBankQuestion(id, fields);
      if (error) return { success: false };
      await refetch();
      return { success: true };
    },
    [refetch],
  );

  const toggleActive = useCallback(
    async (id: string, isActive: boolean) => {
      const { error } = await setBankQuestionActive(id, isActive);
      if (error) return { success: false };
      setQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, is_active: isActive } : q)),
      );
      return { success: true };
    },
    [setQuestions],
  );

  const reorder = useCallback(
    async (next: QuestionBankWithOptions[]) => {
      const withOrder = next.map((q, index) => ({ ...q, sort_order: index }));
      setQuestions(() => withOrder);
      const { error } = await reorderBankQuestions(
        withOrder.map((q) => ({ id: q.id, sort_order: q.sort_order })),
      );
      if (error) {
        console.error("Error reordering question bank:", error);
        refetch();
      }
    },
    [setQuestions, refetch],
  );

  const addOption = useCallback(
    async (bankQuestionId: string, optionText: string, score: number) => {
      const question = questions.find((q) => q.id === bankQuestionId);
      const nextSortOrder =
        (question?.question_bank_options ?? []).reduce(
          (max, o) => Math.max(max, o.sort_order),
          0,
        ) + 1;
      const { error } = await addBankOption(
        bankQuestionId,
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
      const { error } = await updateBankOption(optionId, optionText, score);
      if (error) return { success: false };
      await refetch();
      return { success: true };
    },
    [refetch],
  );

  const removeOption = useCallback(
    async (optionId: string) => {
      const { error } = await deleteBankOption(optionId);
      if (error) return { success: false };
      await refetch();
      return { success: true };
    },
    [refetch],
  );

  return {
    questions,
    loading: query.isPending,
    error: query.error ? "فشل في تحميل بنك الأسئلة" : null,
    refetch,
    create,
    update,
    toggleActive,
    reorder,
    addOption,
    editOption,
    removeOption,
  };
}
