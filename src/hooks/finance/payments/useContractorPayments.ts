import { queryOptions, useQuery } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import { TIERS } from "../../../lib/queryClient";
import { agreementsDb } from "../../../lib/agreementsDb";
import { ContractPayment } from "../../../types/contracts.type";

export const contractorPaymentsKey = [
  "finance",
  "contractor-payments",
] as const;

async function fetchContractorPayments(): Promise<ContractPayment[]> {
  const { data: paymentsData, error: paymentsError } = await supabase
    .schema("contracts")
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false });

  if (paymentsError) throw paymentsError;

  const contractorIds = new Set<string>();
  const projectIds = new Set<string>();
  const createdByIds = new Set<string>();
  const expenseIds = new Set<string>();
  const agreementIds = new Set<string>();
  // payments made against an agreement — only these can carry penalties
  const agreementPaymentIds: string[] = [];
  // agreement_id isn't in the generated types yet.
  const agreementIdOf = (p: unknown) =>
    (p as { agreement_id?: string | null }).agreement_id ?? null;

  (paymentsData ?? []).forEach((p) => {
    const agreementId = agreementIdOf(p);
    if (agreementId) {
      agreementIds.add(agreementId);
      agreementPaymentIds.push(p.id);
    }
    if (p.contractor_id) contractorIds.add(p.contractor_id);
    projectIds.add(p.project_id);
    createdByIds.add(p.created_by);
    if (p.approved_by) createdByIds.add(p.approved_by);
    if (p.expense_id) expenseIds.add(p.expense_id);
  });

  const [
    { data: contractorsData, error: contractorsError },
    { data: projectsData, error: projectsError },
    { data: employeesData, error: employeesError },
    { data: expensesData, error: expensesError },
    { data: agreementsData, error: agreementsError },
    { data: versionsData, error: versionsError },
    { data: penaltiesData, error: penaltiesError },
  ] = await Promise.all([
    contractorIds.size
      ? supabase
          .from("contractors")
          .select(
            "id, first_name, last_name, whatsapp_number, phone_number, bank_account_aproved",
          )
          .in("id", Array.from(contractorIds))
      : Promise.resolve({ data: [], error: null }),
    projectIds.size
      ? supabase
          .from("projects")
          .select("id, name, serial_number")
          .in("id", Array.from(projectIds))
      : Promise.resolve({ data: [], error: null }),
    createdByIds.size
      ? supabase
          .from("employees")
          .select("id, first_name, last_name")
          .in("id", Array.from(createdByIds))
      : Promise.resolve({ data: [], error: null }),
    expenseIds.size
      ? supabase
          .from("project_expenses")
          .select("id, serial_number, description")
          .in("id", Array.from(expenseIds))
      : Promise.resolve({ data: [], error: null }),
    agreementIds.size
      ? agreementsDb
          .schema("contracts")
          .from("agreements")
          .select("id, title, total, current_version, opening_paid")
          .in("id", Array.from(agreementIds))
      : Promise.resolve({ data: [], error: null }),
    // every version, to know which one each payment was made against
    agreementIds.size
      ? agreementsDb
          .schema("contracts")
          .from("agreement_versions")
          .select("agreement_id, version_no, total, created_at")
          .in("agreement_id", Array.from(agreementIds))
      : Promise.resolve({ data: [], error: null }),
    agreementPaymentIds.length
      ? agreementsDb
          .schema("contracts")
          .from("penalties")
          .select("reason, amount, deducted_in_payment_id, created_at")
          .in("deducted_in_payment_id", agreementPaymentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (contractorsError) throw contractorsError;
  if (projectsError) throw projectsError;
  if (employeesError) throw employeesError;
  if (expensesError) throw expensesError;
  if (agreementsError) throw agreementsError;
  if (versionsError) throw versionsError;
  if (penaltiesError) throw penaltiesError;

  const contractorsMap = new Map((contractorsData ?? []).map((c) => [c.id, c]));
  const projectsMap = new Map((projectsData ?? []).map((p) => [p.id, p]));
  const employeesMap = new Map((employeesData ?? []).map((e) => [e.id, e]));
  const expensesMap = new Map((expensesData ?? []).map((e) => [e.id, e]));
  const agreementsMap = new Map((agreementsData ?? []).map((a) => [a.id, a]));
  const versionsByAgreement = new Map<
    string,
    { version_no: number; total: number; created_at: string }[]
  >();
  (versionsData ?? []).forEach((v) => {
    const list = versionsByAgreement.get(v.agreement_id) ?? [];
    list.push(v);
    versionsByAgreement.set(v.agreement_id, list);
  });
  const penaltiesByPayment = new Map<
    string,
    { reason: string; amount: number; created_at: string }[]
  >();
  (penaltiesData ?? []).forEach((x) => {
    if (!x.deducted_in_payment_id) return;
    const list = penaltiesByPayment.get(x.deducted_in_payment_id) ?? [];
    list.push(x);
    penaltiesByPayment.set(x.deducted_in_payment_id, list);
  });

  // The agreement as it stood when the payment was made: the latest
  // version created before it (an edit afterwards doesn't change it).
  const agreementAt = (agreementId: string, paidAt: string) => {
    const a = agreementsMap.get(agreementId);
    if (!a) return null;
    const version = (versionsByAgreement.get(agreementId) ?? [])
      .filter((v) => v.created_at <= paidAt)
      .sort((x, y) => y.version_no - x.version_no)[0];
    return {
      id: a.id,
      title: a.title,
      total: Number(version?.total ?? a.total) || 0,
      version: version?.version_no ?? a.current_version,
      opening_paid: Number(a.opening_paid) || 0,
    };
  };

  return (paymentsData ?? []).map((p) => {
    const agreementId = agreementIdOf(p);
    return {
      ...p,
      contractor: p.contractor_id
        ? (contractorsMap.get(p.contractor_id) ?? null)
        : null,
      project: projectsMap.get(p.project_id) ?? null,
      created_by_employee: employeesMap.get(p.created_by) ?? null,
      expense: p.expense_id ? (expensesMap.get(p.expense_id) ?? null) : null,
      agreement: agreementId ? agreementAt(agreementId, p.created_at) : null,
      penalties: (penaltiesByPayment.get(p.id) ?? [])
        .sort((x, y) => x.created_at.localeCompare(y.created_at))
        .map((x) => ({ reason: x.reason, amount: Number(x.amount) || 0 })),
      approved_by_employee: p.approved_by
        ? (employeesMap.get(p.approved_by) ?? null)
        : null,
    };
  });
}

// Exported so the background prefetcher can warm this screen.
export const contractorPaymentsQueryOptions = () =>
  queryOptions({
    queryKey: contractorPaymentsKey,
    queryFn: async () => {
      try {
        return await fetchContractorPayments();
      } catch (err) {
        console.error("Error fetching contractor payments:", err);
        throw err;
      }
    },
    ...TIERS.C,
  });

export function useContractorPayments() {
  const query = useQuery(contractorPaymentsQueryOptions());

  return {
    payments: query.data ?? [],
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    refreshing: query.isFetching && !query.isPending,
    refetch: async () => {
      await query.refetch();
    },
  };
}
