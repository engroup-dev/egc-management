import { queryOptions, useQuery } from "@tanstack/react-query";
import { ExpenseWithProject } from "../../../types/projects.type";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import { TIERS } from "../../../lib/queryClient";

export const notPaidExpensesKey = ["finance", "not-paid-expenses"] as const;

async function fetchNotPaidExpenses(): Promise<ExpenseWithProject[]> {
  const { data, error } = await supabase
    .from("project_expenses")
    .select(
      `*,
          vendors(vendor_name),
          contractors(first_name,last_name),
          projects(id, name, serial_number)
        `,
    )
    .not(
      "project_id",
      "in",
      `(5451aaae-c632-46f4-9913-8670cffcc8e7,e0a50575-bcc1-474a-98b8-8f57770a14fa,eed51009-4cfa-497c-87a1-cbf5a756f3da,f2d38514-32e0-4eeb-b6cd-fcdbed6a93ab)`,
    )
    .in("status", ["partially_paid", "unpaid"])
    .order("status")
    .order("expense_date");
  if (error) {
    console.error("Error fetching vendors:", error);
    throw error;
  }
  return (data as ExpenseWithProject[]) || [];
}

// Exported so the background prefetcher can warm this screen.
export const notPaidExpensesQueryOptions = () =>
  queryOptions({
    queryKey: notPaidExpensesKey,
    queryFn: fetchNotPaidExpenses,
    ...TIERS.C,
  });

export function useNotPiadExpense() {
  const query = useQuery(notPaidExpensesQueryOptions());

  return {
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    refetch: async () => {
      await query.refetch();
    },
    expenses: query.data ?? [],
    refreshing: query.isFetching && !query.isPending,
  };
}
