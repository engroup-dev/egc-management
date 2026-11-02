import { useCallback } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  createGpaTier,
  createUniversity,
  createUniversityTier,
  deleteUniversity,
  listExperienceLevelScores,
  listGpaTiers,
  listUniversities,
  listUniversityTiers,
  updateExperienceLevelScore,
  updateGpaTier,
  updateUniversity,
  updateUniversityTier,
} from "../../services/hr/scoringConfigService";
import type {
  ExperienceLevelScore,
  GpaTier,
  University,
  UniversityTier,
} from "../../types/hr.type";

interface ScoringConfig {
  universityTiers: UniversityTier[];
  universities: University[];
  gpaTiers: GpaTier[];
  experienceScores: ExperienceLevelScore[];
}

export const hrScoringConfigKey = ["hr", "scoring-config"] as const;

async function fetchScoringConfig(): Promise<ScoringConfig> {
  const [tiers, unis, gpa, exp] = await Promise.all([
    listUniversityTiers(),
    listUniversities(),
    listGpaTiers(),
    listExperienceLevelScores(),
  ]);
  const firstError = tiers.error ?? unis.error ?? gpa.error ?? exp.error;
  if (firstError) {
    console.error("Error fetching scoring config:", firstError);
    throw firstError;
  }
  return {
    universityTiers: tiers.data ?? [],
    universities: unis.data ?? [],
    gpaTiers: gpa.data ?? [],
    experienceScores: exp.data ?? [],
  };
}

// Exported so the background prefetcher can warm this screen.
export const hrScoringConfigQueryOptions = () =>
  queryOptions({ queryKey: hrScoringConfigKey, queryFn: fetchScoringConfig });

/** Loads every scoring lookup once; each mutation refetches so the editors stay simple. */
export function useScoringConfig() {
  const query = useQuery(hrScoringConfigQueryOptions());
  const { refetch: refetchQuery } = query;
  const universityTiers = query.data?.universityTiers ?? [];
  const universities = query.data?.universities ?? [];
  const gpaTiers = query.data?.gpaTiers ?? [];
  const experienceScores = query.data?.experienceScores ?? [];

  const refetch = useCallback(async () => {
    await refetchQuery();
  }, [refetchQuery]);

  /** Runs a mutation, refetches on success, and reports success to the caller. */
  const run = useCallback(
    async (mutation: Promise<{ error: unknown }>) => {
      const { error } = await mutation;
      if (error) {
        console.error("Error saving scoring config:", error);
        return { success: false };
      }
      await refetch();
      return { success: true };
    },
    [refetch],
  );

  const nextOrder = (rows: { sort_order: number }[]) =>
    rows.reduce((max, r) => Math.max(max, r.sort_order), 0) + 1;

  return {
    universityTiers,
    universities,
    gpaTiers,
    experienceScores,
    loading: query.isPending,
    refetch,
    addUniversityTier: (name: string, score: number) =>
      run(createUniversityTier(name, score, nextOrder(universityTiers))),
    editUniversityTier: (
      id: string,
      fields: { tier_name?: string; score?: number },
    ) => run(updateUniversityTier(id, fields)),
    addUniversity: (name: string, tierId: string | null) =>
      run(createUniversity(name, tierId)),
    editUniversity: (
      id: string,
      fields: { name?: string; tier_id?: string | null },
    ) => run(updateUniversity(id, fields)),
    removeUniversity: (id: string) => run(deleteUniversity(id)),
    addGpaTier: (label: string, score: number) =>
      run(createGpaTier(label, score, nextOrder(gpaTiers))),
    editGpaTier: (id: string, fields: { label?: string; score?: number }) =>
      run(updateGpaTier(id, fields)),
    editExperienceScore: (level: string, score: number) =>
      run(updateExperienceLevelScore(level, score)),
  };
}
