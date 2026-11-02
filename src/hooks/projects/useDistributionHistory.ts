import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import { TIERS } from "../../lib/queryClient";
import { PostgrestError } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PeriodStatus = string; // DB returns 'active' | 'reversed' but typed as string

export interface PeriodItem {
  id: string;
  item_type: string;
  user_id: string | null;
  percentage: number;
  cash_amount: number;
  bank_amount: number;
  total: number;
  note: string | null;
  employee_name?: string; // joined client-side
}

export interface DistributionPeriod {
  id: string;
  created_at: string;
  start_date: string;
  end_date: string;
  total_amount: number;
  currency: string | null;
  type: "cash" | "bank" | "cheque" | "transfer" | "deposit";
  company_percentage: number;
  bank_percentage: number;
  status: string;
  reversed_at: string | null;
  reversal_note: string | null;
  source_percentage_id: string | null;
  project: {
    id: string;
    name: string;
    serial_number: number | null;
  };
  items: PeriodItem[];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

// Periods are company payouts, so they live under the "company" head with
// the batches built from the same table.
export const distributionHistoryKey = [
  "company",
  "distribution-history",
] as const;

async function fetchDistributionHistory(): Promise<DistributionPeriod[]> {
  const { data, error } = await supabase
    .from("project_percentage_periods")
    .select(
      `*,
       project:projects(id, name, serial_number),
       items:project_percentage_period_items(
         id, item_type, user_id, percentage,
         cash_amount, bank_amount, total, note
       )`,
    )
    .order("created_at", { ascending: false });

  if (error) throw error;

  // Enrich employee names from employees table
  const employeeIds = new Set<string>();
  (data ?? []).forEach((p: DistributionPeriod) =>
    p.items.forEach((i) => {
      if (i.item_type === "employee" && i.user_id) employeeIds.add(i.user_id);
    }),
  );

  const nameMap: Record<string, string> = {};
  if (employeeIds.size > 0) {
    const { data: emps } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .in("id", Array.from(employeeIds));

    (emps ?? []).forEach(
      (e: { id: string; first_name: string; last_name: string | null }) => {
        nameMap[e.id] = `${e.first_name} ${e.last_name ?? ""}`.trim();
      },
    );
  }

  const enriched = (data ?? []).map((p: DistributionPeriod) => ({
    ...p,
    items: p.items.map((i) => ({
      ...i,
      employee_name: i.user_id ? nameMap[i.user_id] : undefined,
    })),
  }));

  return enriched as DistributionPeriod[];
}

// Exported so the background prefetcher can warm this screen.
export const distributionHistoryQueryOptions = () =>
  queryOptions({
    queryKey: distributionHistoryKey,
    queryFn: fetchDistributionHistory,
    ...TIERS.C,
  });

export function useDistributionHistory() {
  const queryClient = useQueryClient();
  const query = useQuery(distributionHistoryQueryOptions());

  /**
   * Hard reversal — fully undoes all balance changes for a period.
   *
   * Steps:
   *  1. Load company accounts (main + bank)
   *  2. For each period item:
   *     - employee  → subtract from employee_account (cash_balance or bank_balance)
   *     - bank      → subtract from company_account type='bank'
   *     - company   → subtract from company_account type='main'
   *  3. Delete pending payroll records linked to this period's employees + pay_date
   *  4. Restore project_percentage.period_percentage += total_amount
   *  5. Mark project_percentage_logs.distributed = false for this project
   *  6. Set period status = 'reversed'
   */
  const reverseDistribution = async (
    period: DistributionPeriod,
    reversedBy: string,
    note: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // ── 1. Fetch company accounts ────────────────────────────────────────
      const { data: companyAccounts, error: caError } = await supabase
        .from("company_account")
        .select("id, type, bank_balance, cash_balance")
        .eq("status", "active")
        .in("type", ["main", "bank"]);

      if (caError || !companyAccounts || companyAccounts.length === 0) {
        return { success: false, error: "لم يتم العثور على حسابات الشركة" };
      }

      const mainAccount = companyAccounts.find(
        (a: { type: string }) => a.type === "main",
      );
      const bankAccount = companyAccounts.find(
        (a: { type: string }) => a.type === "bank",
      );

      if (!mainAccount)
        return { success: false, error: "لم يتم العثور على الحساب الرئيسي" };
      if (!bankAccount)
        return { success: false, error: "لم يتم العثور على حساب الاحتياطي" };

      // Accumulate deltas to apply in one shot
      const deltas = {
        main: { cash: 0, bank: 0 },
        bank: { cash: 0, bank: 0 },
      };

      // ── 2. Reverse each item ─────────────────────────────────────────────
      for (const item of period.items) {
        if (item.item_type === "employee" && item.user_id) {
          // Subtract from employee_account
          const { data: empAcc, error: empAccError } = await supabase
            .from("employee_account")
            .select("id, cash_balance, bank_balance")
            .eq("id", item.user_id)
            .single();

          if (empAccError || !empAcc) {
            console.warn(`No employee_account for ${item.user_id} — skipping`);
            continue;
          }

          const { error: empUpdateError } = await supabase
            .from("employee_account")
            .update({
              cash_balance: Math.max(
                0,
                Number(empAcc.cash_balance) - item.cash_amount,
              ),
              bank_balance: Math.max(
                0,
                Number(empAcc.bank_balance) - item.bank_amount,
              ),
            })
            .eq("id", item.user_id);

          if (empUpdateError) throw empUpdateError;
        } else if (item.item_type === "bank") {
          deltas.bank.cash -= item.cash_amount;
          deltas.bank.bank -= item.bank_amount;
        } else if (item.item_type === "company") {
          deltas.main.cash -= item.cash_amount;
          deltas.main.bank -= item.bank_amount;
        }
      }

      // ── Apply company_account deltas ─────────────────────────────────────
      const { error: mainUpdateError } = await supabase
        .from("company_account")
        .update({
          cash_balance: Math.max(
            0,
            Number(mainAccount.cash_balance) + deltas.main.cash,
          ),
          bank_balance: Math.max(
            0,
            Number(mainAccount.bank_balance) + deltas.main.bank,
          ),
        })
        .eq("id", mainAccount.id);
      if (mainUpdateError) throw mainUpdateError;

      const { error: bankUpdateError } = await supabase
        .from("company_account")
        .update({
          cash_balance: Math.max(
            0,
            Number(bankAccount.cash_balance) + deltas.bank.cash,
          ),
          bank_balance: Math.max(
            0,
            Number(bankAccount.bank_balance) + deltas.bank.bank,
          ),
        })
        .eq("id", bankAccount.id);
      if (bankUpdateError) throw bankUpdateError;

      // ── 3. Void pending payroll records ──────────────────────────────────
      // Target: payroll rows for employees in this period, pay_date = period.end_date, status='pending'
      const employeeIds = period.items.flatMap((i) =>
        i.item_type === "employee" && i.user_id ? [i.user_id] : [],
      );

      if (employeeIds.length > 0) {
        const { error: payrollError } = await supabase
          .from("payroll")
          .delete()
          .in("employee_id", employeeIds)
          .eq("pay_date", period.end_date)
          .eq("status", "pending");

        if (payrollError) throw payrollError;
      }

      // ── 4. Restore project_percentage.period_percentage ──────────────────
      if (period.source_percentage_id) {
        const { data: pctRow, error: pctFetchError } = await supabase
          .from("project_percentage")
          .select("id, period_percentage")
          .eq("id", period.source_percentage_id)
          .single();

        if (!pctFetchError && pctRow) {
          const { error: pctUpdateError } = await supabase
            .from("project_percentage")
            .update({
              period_percentage:
                Number(pctRow.period_percentage) + period.total_amount,
            })
            .eq("id", period.source_percentage_id);

          if (pctUpdateError) throw pctUpdateError;
        }
      }

      // ── 5. Restore logs → distributed = false ────────────────────────────
      const { error: logsResetError } = await supabase
        .from("project_percentage_logs")
        .update({ distributed: false })
        .eq("project_id", period.project.id)
        .eq("distributed", true);

      if (logsResetError) throw logsResetError;

      // ── 6. Mark period as reversed ───────────────────────────────────────
      const { error: periodUpdateError } = await supabase
        .from("project_percentage_periods")
        .update({
          status: "reversed",
          reversed_by: reversedBy,
          reversed_at: new Date().toISOString(),
          reversal_note: note,
        })
        .eq("id", period.id);

      if (periodUpdateError) throw periodUpdateError;

      // A reversal moves company, employee and project balances, so
      // refresh every view of them, not just this list.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["company"] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["projects-list"] }),
      ]);

      return { success: true };
    } catch (err: unknown) {
      console.error("Reversal error:", err);
      const errorMessage =
        err instanceof Error ? err.message : "حدث خطأ غير متوقع";
      return { success: false, error: errorMessage };
    }
  };

  return {
    periods: query.data ?? null,
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    refetch: async () => {
      await query.refetch();
    },
    reverseDistribution,
  };
}
