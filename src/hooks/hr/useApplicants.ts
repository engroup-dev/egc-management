import { useCallback } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { listApplicants } from "../../services/hr/applicantsService";
import { listApplicantScores } from "../../services/hr/applicantScoresService";
import type { Applicant } from "../../types/hr.type";

/** An applicant row plus its DB-computed total score (null = no score row). */
export type ApplicantWithScore = Applicant & { total_score: number | null };

export const hrApplicantsKey = ["hr", "applicants"] as const;

async function fetchApplicants(): Promise<ApplicantWithScore[]> {
  const [{ data, error }, scoresResult] = await Promise.all([
    listApplicants(),
    listApplicantScores(),
  ]);
  if (error) throw error;
  // A failed scores read must not hide the applicants themselves.
  if (scoresResult.error) {
    console.error("Error fetching applicant scores:", scoresResult.error);
  }
  const totals = new Map(
    (scoresResult.data ?? []).map((s) => [s.applicant_id, s.total_score]),
  );
  return (data ?? []).map((a) => ({
    ...a,
    total_score: totals.get(a.id) ?? null,
  }));
}

// Exported so the background prefetcher can warm this screen.
export const hrApplicantsQueryOptions = () =>
  queryOptions({ queryKey: hrApplicantsKey, queryFn: fetchApplicants });

export function useApplicants() {
  const query = useQuery(hrApplicantsQueryOptions());
  const { refetch: refetchQuery } = query;

  const refetch = useCallback(async () => {
    await refetchQuery();
  }, [refetchQuery]);

  return {
    applicants: query.data ?? [],
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    refetch,
  };
}
