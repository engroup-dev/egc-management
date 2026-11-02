import { Dispatch, SetStateAction, useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { expenses as Expense } from "../../types/global.type";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";

export const settingsExpensesKey = ["settings", "expenses"] as const;

async function fetchExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("name", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Exported so the background prefetcher can warm this screen.
export const settingsExpensesQueryOptions = () =>
  queryOptions({ queryKey: settingsExpensesKey, queryFn: fetchExpenses });

export function useExpenses() {
  const queryClient = useQueryClient();
  const query = useQuery(settingsExpensesQueryOptions());

  // Callers patch the list after adding an expense; patch the cache so
  // every screen using this list sees it.
  const setExpenses: Dispatch<SetStateAction<Expense[]>> = useCallback(
    (action) => {
      queryClient.setQueryData<Expense[]>(settingsExpensesKey, (prev) =>
        typeof action === "function" ? action(prev ?? []) : action,
      );
    },
    [queryClient],
  );

  return {
    expenses: query.data ?? [],
    setExpenses,
    loading: query.isPending,
    error: query.error as PostgrestError | null,
  };
}
