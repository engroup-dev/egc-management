import { PostgrestError } from "@supabase/supabase-js";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import { TIERS } from "../../lib/queryClient";
import { contractorWithSpecializations } from "../../types/extended.type";
import { ProjectExpenseGroup } from "./vendors/useVendors";

type ContractorData = {
  contractor: contractorWithSpecializations | null;
  groupedExpenses: ProjectExpenseGroup[];
};

export const supplyChainContractorKey = (contractorId: string) =>
  ["supply-chain", "contractor", contractorId] as const;

async function fetchSupplyChainContractor(
  contractorId: string,
): Promise<ContractorData> {
  const { data, error } = await supabase
    .from("contractors")
    .select(
      `*,
      contractor_specialities (
        speciality_id,
        speciality:specialities (id, name)
      ),
      bank_approved_by_user:users!contractors_bank_approved_by_fkey (
        first_name,
        last_name
      )
    `,
    )
    .eq("id", contractorId)
    .single();

  if (error) {
    console.error("error fetching contractor", error);
    throw error;
  }

  const { data: expensesData, error: expensesError } = await supabase
    .from("project_expenses")
    .select("*, projects(id, name, serial_number)")
    .eq("contractor_id", contractorId)
    .is("deleted_at", null);

  if (expensesError) {
    console.error("error fetching contractor expenses", expensesError);
    throw expensesError;
  }

  const groupMap = new Map<string, ProjectExpenseGroup>();
  for (const expense of expensesData ?? []) {
    const project = expense.projects;
    const projectId = project?.id ?? "unknown";

    if (!groupMap.has(projectId)) {
      groupMap.set(projectId, {
        projectId,
        projectName: project?.name ?? "مشروع غير معروف",
        projectSerialNumber: project?.serial_number ?? null,
        expenses: [],
      });
    }
    const group = groupMap.get(projectId);
    if (group) {
      group.expenses.push(expense);
    }
  }

  return {
    contractor: data as unknown as contractorWithSpecializations | null,
    groupedExpenses: Array.from(groupMap.values()),
  };
}

// Carries project_expenses, so it is a money read (tier C).
export const supplyChainContractorQueryOptions = (contractorId: string) =>
  queryOptions({
    queryKey: supplyChainContractorKey(contractorId),
    queryFn: () => fetchSupplyChainContractor(contractorId),
    enabled: !!contractorId,
    ...TIERS.C,
  });

export function useContractor(contractorId: string) {
  const query = useQuery(supplyChainContractorQueryOptions(contractorId));

  const refetch = async () => {
    await query.refetch();
  };

  return {
    contractor: query.data?.contractor ?? null,
    groupedExpenses: query.data?.groupedExpenses ?? [],
    loading: query.isPending && !!contractorId,
    error: query.error as PostgrestError | null,
    refetch,
  };
}
