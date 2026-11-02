import { useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addCriterion,
  addRatingLevel,
  getCriteria,
  getRatingScale,
  reorderCriteria,
  reorderRatingScale,
  setCriterionActive,
  setRatingLevelActive,
  updateCriterion,
  updateRatingLevel,
} from "../../services/hr/evaluationConfigService";
import type { EvaluationCategory, EvaluationCriteria, RatingScale } from "../../types/hr.type";

interface EvaluationConfig {
  criteria: EvaluationCriteria[];
  ratingScale: RatingScale[];
}

export const hrEvaluationConfigKey = (
  category: EvaluationCategory,
  activeOnly: boolean,
) => ["hr", "evaluation-config", category, activeOnly] as const;

async function fetchEvaluationConfig(
  category: EvaluationCategory,
  activeOnly: boolean,
): Promise<EvaluationConfig> {
  const [
    { data: criteriaData, error: criteriaError },
    { data: ratingData, error: ratingError },
  ] = await Promise.all([
    getCriteria(category, { activeOnly }),
    getRatingScale(category, { activeOnly }),
  ]);
  if (criteriaError) throw criteriaError;
  if (ratingError) throw ratingError;
  return { criteria: criteriaData ?? [], ratingScale: ratingData ?? [] };
}

export const hrEvaluationConfigQueryOptions = (
  category: EvaluationCategory,
  activeOnly = true,
) =>
  queryOptions({
    queryKey: hrEvaluationConfigKey(category, activeOnly),
    queryFn: () => fetchEvaluationConfig(category, activeOnly),
  });

/**
 * Criteria + rating scale for one category ('interview' | 'performance'),
 * with CRUD + reorder. Used by both the rating forms (activeOnly: true,
 * the default) and the settings/admin screen (activeOnly: false, so
 * deactivated rows stay visible to be re-activated).
 */
export function useEvaluationConfig(
  category: EvaluationCategory,
  activeOnly = true,
) {
  const queryClient = useQueryClient();
  const query = useQuery(hrEvaluationConfigQueryOptions(category, activeOnly));
  const { refetch: refetchQuery } = query;
  const criteria = query.data?.criteria ?? [];
  const ratingScale = query.data?.ratingScale ?? [];

  const refetch = useCallback(async () => {
    await refetchQuery();
  }, [refetchQuery]);

  // Patch this variant in place; the other activeOnly variant of the same
  // category (forms vs. settings screen) is refetched when next needed.
  const patch = useCallback(
    (updater: (prev: EvaluationConfig) => EvaluationConfig) => {
      queryClient.setQueryData<EvaluationConfig>(
        hrEvaluationConfigKey(category, activeOnly),
        (prev) => (prev ? updater(prev) : prev),
      );
      queryClient.invalidateQueries({
        queryKey: hrEvaluationConfigKey(category, !activeOnly),
      });
    },
    [queryClient, category, activeOnly],
  );

  const createCriterion = useCallback(
    async (nameAr: string) => {
      const nextSortOrder =
        criteria.reduce((max, c) => Math.max(max, c.sort_order), 0) + 1;
      const { data, error } = await addCriterion(category, nameAr, nextSortOrder);
      if (error || !data) return { success: false };
      patch((prev) => ({ ...prev, criteria: [...prev.criteria, data] }));
      return { success: true };
    },
    [category, criteria, patch],
  );

  const editCriterion = useCallback(
    async (id: string, nameAr: string) => {
      const { error } = await updateCriterion(id, { name_ar: nameAr.trim() });
      if (error) return { success: false };
      patch((prev) => ({
        ...prev,
        criteria: prev.criteria.map((c) =>
          c.id === id ? { ...c, name_ar: nameAr.trim() } : c,
        ),
      }));
      return { success: true };
    },
    [patch],
  );

  const toggleCriterionActive = useCallback(
    async (id: string, isActive: boolean) => {
      const { error } = await setCriterionActive(id, isActive);
      if (error) return { success: false };
      patch((prev) => ({
        ...prev,
        criteria: prev.criteria.map((c) =>
          c.id === id ? { ...c, is_active: isActive } : c,
        ),
      }));
      return { success: true };
    },
    [patch],
  );

  const reorderCriteriaList = useCallback(
    async (next: EvaluationCriteria[]) => {
      const withOrder = next.map((c, index) => ({ ...c, sort_order: index }));
      patch((prev) => ({ ...prev, criteria: withOrder }));
      const { error } = await reorderCriteria(
        withOrder.map((c) => ({ id: c.id, sort_order: c.sort_order })),
      );
      if (error) {
        console.error("Error reordering criteria:", error);
        refetch();
      }
    },
    [patch, refetch],
  );

  const createRatingLevel = useCallback(
    async (labelAr: string, score: number) => {
      const nextSortOrder =
        ratingScale.reduce((max, r) => Math.max(max, r.sort_order), 0) + 1;
      const { data, error } = await addRatingLevel(
        category,
        labelAr,
        score,
        nextSortOrder,
      );
      if (error || !data) return { success: false };
      patch((prev) => ({ ...prev, ratingScale: [...prev.ratingScale, data] }));
      return { success: true };
    },
    [category, ratingScale, patch],
  );

  const editRatingLevel = useCallback(
    async (id: string, labelAr: string, score: number) => {
      const { error } = await updateRatingLevel(id, {
        label_ar: labelAr.trim(),
        score,
      });
      if (error) return { success: false };
      patch((prev) => ({
        ...prev,
        ratingScale: prev.ratingScale.map((r) =>
          r.id === id ? { ...r, label_ar: labelAr.trim(), score } : r,
        ),
      }));
      return { success: true };
    },
    [patch],
  );

  const toggleRatingLevelActive = useCallback(
    async (id: string, isActive: boolean) => {
      const { error } = await setRatingLevelActive(id, isActive);
      if (error) return { success: false };
      patch((prev) => ({
        ...prev,
        ratingScale: prev.ratingScale.map((r) =>
          r.id === id ? { ...r, is_active: isActive } : r,
        ),
      }));
      return { success: true };
    },
    [patch],
  );

  const reorderRatingScaleList = useCallback(
    async (next: RatingScale[]) => {
      const withOrder = next.map((r, index) => ({ ...r, sort_order: index }));
      patch((prev) => ({ ...prev, ratingScale: withOrder }));
      const { error } = await reorderRatingScale(
        withOrder.map((r) => ({ id: r.id, sort_order: r.sort_order })),
      );
      if (error) {
        console.error("Error reordering rating scale:", error);
        refetch();
      }
    },
    [patch, refetch],
  );

  return {
    criteria,
    ratingScale,
    loading: query.isPending,
    error: query.error ? "فشل في تحميل بنود التقييم" : null,
    refetch,
    createCriterion,
    editCriterion,
    toggleCriterionActive,
    reorderCriteriaList,
    createRatingLevel,
    editRatingLevel,
    toggleRatingLevelActive,
    reorderRatingScaleList,
  };
}
