import { PostgrestError } from "@supabase/supabase-js";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { CompanyAccount } from "../../types/global.type";
import { supabase } from "../../lib/supabaseClient";
import { TIERS } from "../../lib/queryClient";

export const companyFinanceKey = ["company", "finance"] as const;

async function fetchCompanyAccounts(): Promise<CompanyAccount[]> {
  const { data, error } = await supabase.from("company_account").select("*");
  if (error) throw error;
  return data ?? [];
}

// Exported so the background prefetcher can warm this screen.
export const companyFinanceQueryOptions = () =>
  queryOptions({
    queryKey: companyFinanceKey,
    queryFn: fetchCompanyAccounts,
    ...TIERS.C,
  });

export function useCompanyFinance() {
  const query = useQuery(companyFinanceQueryOptions());
  return {
    account: query.data ?? [],
    error: query.error as PostgrestError | null,
    loading: query.isPending,
    refreshing: query.isFetching && !query.isPending,
  };
}
