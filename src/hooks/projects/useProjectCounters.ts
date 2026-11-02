import { PostgrestError } from "@supabase/supabase-js";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import type { Database } from "../../lib/supabase";
import { TIERS } from "../../lib/queryClient";

export type NegativePeriod =
  Database["app"]["Tables"]["project_negative_periods"]["Row"];
export type AccountNegativePeriod =
  Database["app"]["Tables"]["account_negative_periods"]["Row"];

const countersKey = ["projects", "counters"] as const;

function countByProject(rows: { project_id: string | null }[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    if (row.project_id) acc[row.project_id] = (acc[row.project_id] ?? 0) + 1;
    return acc;
  }, {});
}

export const projectNegativePeriodsQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: [...countersKey, "project-periods", projectId],
    queryFn: async (): Promise<NegativePeriod[]> => {
      const { data, error } = await supabase
        .schema("app")
        .from("project_negative_periods")
        .select("*")
        .eq("project_id", projectId)
        .order("started_on", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
    ...TIERS.C,
  });

/** Full history of negative-balance counters (periods) for a single project. */
export function useProjectNegativePeriods(projectId: string) {
  const query = useQuery(projectNegativePeriodsQueryOptions(projectId));
  return {
    periods: query.data ?? [],
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export const openProjectNegativePeriodsQueryOptions = () =>
  queryOptions({
    queryKey: [...countersKey, "open-project"],
    queryFn: async (): Promise<NegativePeriod[]> => {
      const { data, error } = await supabase
        .schema("app")
        .from("project_negative_periods")
        .select("*")
        .is("ended_on", null)
        .order("days_count", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    ...TIERS.C,
  });

/**
 * Currently open (not yet ended) negative-balance periods for every project,
 * read straight from app.project_negative_periods — the same source of truth
 * used by the per-project counters page — so days/min-balance figures always
 * match between the summary table and the project details page.
 */
export function useOpenProjectNegativePeriods() {
  const query = useQuery(openProjectNegativePeriodsQueryOptions());
  return {
    rows: query.data ?? [],
    loading: query.isPending,
    refreshing: query.isFetching && !query.isPending,
    error: query.error as PostgrestError | null,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export const openAccountNegativePeriodsQueryOptions = () =>
  queryOptions({
    queryKey: [...countersKey, "open-account"],
    queryFn: async (): Promise<AccountNegativePeriod[]> => {
      const { data, error } = await supabase
        .schema("app")
        .from("account_negative_periods")
        .select("*")
        .is("ended_on", null)
        .order("days_count", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    ...TIERS.C,
  });

/**
 * Currently open (not yet ended) negative-balance periods for every
 * project's account, read straight from app.account_negative_periods — see
 * useOpenProjectNegativePeriods for why this replaces the snapshot view.
 */
export function useOpenAccountNegativePeriods() {
  const query = useQuery(openAccountNegativePeriodsQueryOptions());
  return {
    rows: query.data ?? [],
    loading: query.isPending,
    refreshing: query.isFetching && !query.isPending,
    error: query.error as PostgrestError | null,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export const projectNegativePeriodCountsQueryOptions = () =>
  queryOptions({
    queryKey: [...countersKey, "project-counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .schema("app")
        .from("project_negative_periods")
        .select("project_id");
      if (error) throw error;
      return countByProject(data ?? []);
    },
    ...TIERS.C,
  });

/** Total count of negative-balance counters (all history) per project, for the summary page. */
export function useProjectNegativePeriodCountsByProject() {
  const query = useQuery(projectNegativePeriodCountsQueryOptions());
  return {
    countsByProject: query.data ?? {},
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export const accountNegativePeriodCountsQueryOptions = () =>
  queryOptions({
    queryKey: [...countersKey, "account-counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .schema("app")
        .from("account_negative_periods")
        .select("project_id");
      if (error) throw error;
      return countByProject(data ?? []);
    },
    ...TIERS.C,
  });

/** Total count of account negative-balance counters (all history) per project, for the summary page. */
export function useAccountNegativePeriodCountsByProject() {
  const query = useQuery(accountNegativePeriodCountsQueryOptions());
  return {
    countsByProject: query.data ?? {},
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export const accountNegativePeriodsQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: [...countersKey, "account-periods", projectId],
    queryFn: async (): Promise<AccountNegativePeriod[]> => {
      const { data, error } = await supabase
        .schema("app")
        .from("account_negative_periods")
        .select("*")
        .eq("project_id", projectId)
        .order("started_on", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
    ...TIERS.C,
  });

/** Full history of negative-balance counters (periods) for a single project's account. */
export function useAccountNegativePeriods(projectId: string) {
  const query = useQuery(accountNegativePeriodsQueryOptions(projectId));
  return {
    periods: query.data ?? [],
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    refetch: async () => {
      await query.refetch();
    },
  };
}
