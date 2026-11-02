// features/project-stats/hooks/useProjectExpenses.ts

import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import { TIERS } from "../../lib/queryClient";
import { ProjectExpense } from "../../types/project-stats/types";

export const projectStatsExpensesQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["projects", "stats-expenses", projectId],
    queryFn: async (): Promise<ProjectExpense[]> => {
      const { data, error } = await supabase
        .from("project_expenses")
        .select(
          `
        *,
        contractor:contractors ( id, first_name, last_name ),
        vendor:vendors ( id, vendor_name ),
        expense_category:expenses ( id, name )
      `,
        )
        .eq("project_id", projectId)
        .is("deleted_at", null) // exclude soft-deleted rows
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return (data as ProjectExpense[]) ?? [];
    },
    enabled: !!projectId,
    ...TIERS.C,
  });

const EMPTY: ProjectExpense[] = [];

export function useProjectExpenses(projectId: string) {
  const query = useQuery(projectStatsExpensesQueryOptions(projectId));
  return {
    // Stable fallback: useProjectStats memoises on this array.
    data: query.data ?? EMPTY,
    isLoading: query.isPending,
    error: query.error ? query.error.message : null,
    refetch: async () => {
      await query.refetch();
    },
  };
}
