import { queryOptions, useQuery } from "@tanstack/react-query";
import { ProjectExpenses } from "../../../types/global.type";
import { VendorWithBankApprover } from "../../../types/extended.type";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import { TIERS } from "../../../lib/queryClient";

export interface ProjectExpenseGroup {
  projectId: string;
  projectName: string;
  projectSerialNumber: number | null;
  expenses: ProjectExpenses[];
}

type VendorData = {
  vendor: VendorWithBankApprover;
  expenses: ProjectExpenses[];
  groupedExpenses: ProjectExpenseGroup[];
};

export const supplyChainVendorKey = (vendorId: string) =>
  ["supply-chain", "vendor", vendorId] as const;

async function fetchSupplyChainVendor(vendorId: string): Promise<VendorData> {
  const { data, error } = await supabase
    .from("vendors")
    .select(
      `*,
      vendor_specialities (
        speciality_id,
        speciality:specialities (id, name)
      ),
      bank_approved_by_user:users!vendors_bank_approved_by_fkey (
        first_name,
        last_name
      )
    `,
    )
    .eq("id", vendorId)
    .single();

  if (error) {
    console.error("error fetching vendor", error);
    throw error;
  }

  const { data: expensesData, error: expensesError } = await supabase
    .from("project_expenses")
    .select("*, projects(id, name, serial_number)")
    .eq("vendor_id", vendorId)
    .is("deleted_at", null);

  if (expensesError) {
    console.error("error fetching vendor expenses", expensesError);
    throw expensesError;
  }

  const flat = expensesData ?? [];

  // Group by project
  const groupMap = new Map<string, ProjectExpenseGroup>();
  for (const expense of flat) {
    const project = expense.projects;
    const projectId = project?.id ?? "unknown";

    if (!groupMap.has(projectId)) {
      groupMap.set(projectId, {
        projectId,
        projectName: project?.name ?? "Unknown Project",
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
    vendor: data as unknown as VendorWithBankApprover,
    expenses: flat,
    groupedExpenses: Array.from(groupMap.values()),
  };
}

// Carries project_expenses, so it is a money read (tier C).
export const supplyChainVendorQueryOptions = (vendorId: string) =>
  queryOptions({
    queryKey: supplyChainVendorKey(vendorId),
    queryFn: () => fetchSupplyChainVendor(vendorId),
    enabled: !!vendorId,
    ...TIERS.C,
  });

export function useVendor(vendorId: string) {
  const query = useQuery(supplyChainVendorQueryOptions(vendorId));

  const refetch = async () => {
    await query.refetch();
  };

  return {
    vendor: query.data?.vendor ?? null,
    expenses: query.data?.expenses ?? [],
    groupedExpenses: query.data?.groupedExpenses ?? [],
    loading: query.isPending && !!vendorId,
    error: query.error as PostgrestError | null,
    refetch,
  };
}
