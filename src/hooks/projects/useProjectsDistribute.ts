import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { TIERS } from "../../lib/queryClient";
import { supabase } from "../../lib/supabaseClient";
import { PostgrestError } from "@supabase/supabase-js";
import { Projects } from "../../types/global.type";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Currency = "LYD" | "USD" | "EUR";

export interface ProjectPercentageRow {
  id: string;
  currency: Currency | null;
  type: "cash" | "bank" | null;
  period_percentage: number;
  percentage: number;
  period_start: string;
}

// Phase 5 follow-up: this wizard now reads its rates from
// project_distributions, not project_assignments. The two tables differ
// in one way that matters here — project_distributions has NO project
// role, because a share and a job on the project are separate facts.
// So there is no project_role_id and no role column in this screen.
export interface ProjectDistributionShare {
  id: string;
  percentage: number;

  employee: {
    id: string;
    first_name: string;
    last_name: string | null;
    bank_name: string | null;
    bank_account_number: string | null;
  };
}

export interface DistributionProject extends Projects {
  serial_number: number | null;
  project_percentage: ProjectPercentageRow[];
  project_distributions: ProjectDistributionShare[];
}

// ─── Progress ────────────────────────────────────────────────────────────────

export interface DistributionProgress {
  projectId: string;
  projectName: string;
  status: "pending" | "processing" | "done" | "error";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getPeriodTotal(
  rows: ProjectPercentageRow[],
  currency: Currency,
): number {
  return rows
    .filter((r) => r.currency === currency)
    .reduce((sum, r) => sum + (Number(r.period_percentage) || 0), 0);
}

export function getPeriodTotalByCashBank(
  rows: ProjectPercentageRow[],
  currency: Currency,
): { cash: number; bank: number; total: number } {
  const relevant = rows.filter((r) => r.currency === currency);
  const cash = relevant
    .filter((r) => r.type === "cash")
    .reduce((sum, r) => sum + (Number(r.period_percentage) || 0), 0);
  const bank = relevant
    .filter((r) => r.type === "bank")
    .reduce((sum, r) => sum + (Number(r.period_percentage) || 0), 0);
  return { cash, bank, total: cash + bank };
}

export function calcEmployeeEarnings(
  project: DistributionProject,
  currency: Currency,
): {
  employeeId: string;
  name: string;
  assignmentPct: number;
  earning: number;
  cashEarning: number;
  bankEarning: number;
}[] {
  const { cash, bank, total } = getPeriodTotalByCashBank(
    project.project_percentage,
    currency,
  );
  return (project.project_distributions ?? []).map((a) => {
    const pct = Number(a.percentage) / 100;

    return {
      employeeId: a.employee.id,
      name: `${a.employee.first_name} ${a.employee.last_name ?? ""}`.trim(),

      assignmentPct: Number(a.percentage),

      earning: total * pct,
      cashEarning: cash * pct,
      bankEarning: bank * pct,
    };
  });
}

export function calcDistribution(
  project: DistributionProject,
  currency: Currency,
): {
  total: number;
  cashTotal: number;
  bankTotal: number;
  bank: number;
  company: number;
  employeesTotal: number;
} {
  const {
    cash,
    bank: bankTotal,
    total,
  } = getPeriodTotalByCashBank(project.project_percentage, currency);
  const bankPct = Number(project.default_bank_percentage) / 100;
  const companyPct = Number(project.default_company_percentage) / 100;

  const bank = cash * bankPct + bankTotal * bankPct;
  const company = cash * companyPct + bankTotal * companyPct;
  const employeesTotal = calcEmployeeEarnings(project, currency).reduce(
    (sum, e) => sum + e.earning,
    0,
  );

  return { total, cashTotal: cash, bankTotal, bank, company, employeesTotal };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const projectsDistributeKey = ["projects", "distribute"] as const;

async function fetchDistributeProjects(): Promise<DistributionProject[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(
      `
      *,
      project_percentage(*),
      project_distributions(
      id,
      percentage,
      employee:employees(
        id,
        first_name,
        last_name,
        bank_name,
        bank_account_number
      )
    )
    `,
    )
    .not(
      "id",
      "in",
      `(5451aaae-c632-46f4-9913-8670cffcc8e7,e0a50575-bcc1-474a-98b8-8f57770a14fa,eed51009-4cfa-497c-87a1-cbf5a756f3da,f2d38514-32e0-4eeb-b6cd-fcdbed6a93ab)`,
    )
    // The exclusion of project role c7823151-2290-4861-a383-5e00a78128ce
    // that used to sit here is GONE, by decision: project_distributions
    // has no project role, so the filter cannot be expressed on the new
    // table. Anyone holding a row in project_distributions is now paid.
    // If people were being kept out of payout runs by that role, they
    // must be removed from project_distributions instead.
    .order("serial_number", { ascending: true });

  // .in("id", [
  //   "5451aaae-c632-46f4-9913-8670cffcc8e7",
  //   "eed51009-4cfa-497c-87a1-cbf5a756f3da",
  //   "f2d38514-32e0-4eeb-b6cd-fcdbed6a93ab",
  // ])

  if (error) throw error;

  const filtered = (data ?? []).filter((p) =>
    p.project_percentage?.some(
      (pp: ProjectPercentageRow) => Number(pp.period_percentage) > 0,
    ),
  );

  // Cast through unknown: the generated Database types predate Phase 1,
  // so supabase-js resolves the project_distributions embed to a
  // SelectQueryError and refuses the direct cast. Re-run `npm run types`
  // once Phase 1 is in the generated schema and this can go back to a
  // plain `as DistributionProject[]`. Same reason src/lib/permissionsDb.ts
  // exists — that client cannot be used here because this one query spans
  // projects, project_percentage and employees as well.
  return filtered as unknown as DistributionProject[];
}

// Exported so the background prefetcher can warm this screen.
export const projectsDistributeQueryOptions = () =>
  queryOptions({
    queryKey: projectsDistributeKey,
    queryFn: fetchDistributeProjects,
    ...TIERS.C,
  });

export function useProjectsDistribute() {
  const queryClient = useQueryClient();
  const query = useQuery(projectsDistributeQueryOptions());

  const submitDistribution = async (
    projects: DistributionProject[],
    createdBy: string,
    onProgress?: (items: DistributionProgress[]) => void,
  ): Promise<{ success: boolean; error?: string }> => {
    const today = new Date().toISOString().split("T")[0];
    const CURRENCIES: Currency[] = ["LYD", "USD", "EUR"];

    const payrollMap = new Map<
      string,
      { employeeId: string; amount: number }
    >();
    const deltas = {
      main: { cash: 0, bank: 0 },
      bank: { cash: 0, bank: 0 },
    };

    const progressItems: DistributionProgress[] = projects.map((p) => ({
      projectId: p.id,
      projectName: p.name,
      status: "pending",
    }));
    onProgress?.([...progressItems]);

    try {
      const { data: companyAccounts, error: caError } = await supabase
        .from("company_account")
        .select("id, type, bank_balance, cash_balance")
        .eq("status", "active")
        .in("type", ["main", "bank"]);

      if (caError || !companyAccounts?.length)
        return { success: false, error: "لم يتم العثور على حسابات الشركة" };

      const mainAccount = companyAccounts.find((a) => a.type === "main");
      const bankAccount = companyAccounts.find((a) => a.type === "bank");
      if (!mainAccount || !bankAccount)
        return { success: false, error: "حسابات الشركة غير مكتملة" };

      for (const project of projects) {
        const progressIdx = progressItems.findIndex(
          (i) => i.projectId === project.id,
        );
        progressItems[progressIdx].status = "processing";
        onProgress?.([...progressItems]);

        try {
          const bankPct = Number(project.default_bank_percentage);
          const companyPct = Number(project.default_company_percentage);

          for (const currency of CURRENCIES) {
            // ✅ FIX 1: Read fresh period_percentage from DB, don't trust in-memory
            const { data: freshPctRows, error: freshErr } = await supabase
              .from("project_percentage")
              .select("*")
              .eq("project_id", project.id)
              .eq("currency", currency)
              .gt("percentage", 0);

            if (freshErr) throw freshErr;
            if (!freshPctRows?.length) continue;

            for (const pctRow of freshPctRows) {
              const rowAmount = Number(pctRow.period_percentage);
              const isBank = pctRow.type === "bank";

              // ✅ FIX 2: Duplicate guard — check if already distributed today
              const { data: existing } = await supabase
                .from("project_percentage_periods")
                .select("id")
                .eq("source_percentage_id", pctRow.id)
                .eq("end_date", today)
                .maybeSingle();

              if (existing) {
                console.warn(
                  `[${project.name}/${currency}] Already distributed today — skipping`,
                );
                continue;
              }

              // logs fetch
              const { data: logs, error: logsError } = await supabase
                .from("project_percentage_logs")
                .select("id, amount")
                .eq("project_id", project.id)
                .eq("distributed", false);

              if (logsError) throw logsError;

              // period insert
              const { data: period, error: periodError } = await supabase
                .from("project_percentage_periods")
                .insert({
                  project_id: project.id,
                  start_date: pctRow.period_start,
                  end_date: today,
                  total_amount: rowAmount,
                  created_by: createdBy,
                  type: isBank ? "bank" : "cash",
                  company_percentage: companyPct,
                  bank_percentage: bankPct,
                  currency,
                  source_percentage_id: pctRow.id,
                })
                .select("id")
                .single();

              if (periodError || !period) throw periodError;

              const periodId = period.id;
              const bankAmount = rowAmount * (bankPct / 100);
              const companyAmount = rowAmount * (companyPct / 100);

              // ✅ FIX 3: Actually accumulate deltas
              if (isBank) {
                deltas.bank.bank += bankAmount;
                deltas.main.bank += companyAmount;
              } else {
                deltas.bank.cash += bankAmount;
                deltas.main.cash += companyAmount;
              }

              const employeeRows = (project.project_distributions ?? []).map(
                (a) => ({
                  employeeId: a.employee.id,
                  name: `${a.employee.first_name} ${a.employee.last_name ?? ""}`,
                  pct: Number(a.percentage),
                  amount: rowAmount * (Number(a.percentage) / 100),
                }),
              );

              await supabase.from("project_percentage_period_items").insert([
                {
                  period_id: periodId,
                  item_type: "bank",
                  percentage: bankPct,
                  cash_amount: isBank ? 0 : bankAmount,
                  bank_amount: isBank ? bankAmount : 0,
                  cash_held: 0,
                  bank_held: 0,
                  discount: 0,
                  total: bankAmount,
                },
                {
                  period_id: periodId,
                  item_type: "company",
                  percentage: companyPct,
                  cash_amount: isBank ? 0 : companyAmount,
                  bank_amount: isBank ? companyAmount : 0,
                  cash_held: 0,
                  bank_held: 0,
                  discount: 0,
                  total: companyAmount,
                },
              ]);

              for (const emp of employeeRows) {
                await supabase.from("project_percentage_period_items").insert({
                  period_id: periodId,
                  item_type: "employee",
                  user_id: emp.employeeId,
                  percentage: emp.pct,
                  cash_amount: isBank ? 0 : emp.amount,
                  bank_amount: isBank ? emp.amount : 0,
                  cash_held: 0,
                  bank_held: 0,
                  discount: 0,
                  total: emp.amount,
                });

                const { data: empAcc } = await supabase
                  .from("employee_account")
                  .select("cash_balance, bank_balance")
                  .eq("id", emp.employeeId)
                  .single();

                if (empAcc) {
                  await supabase
                    .from("employee_account")
                    .update(
                      isBank
                        ? {
                            bank_balance:
                              Number(empAcc.bank_balance) + emp.amount,
                          }
                        : {
                            cash_balance:
                              Number(empAcc.cash_balance) + emp.amount,
                          },
                    )
                    .eq("id", emp.employeeId);
                }

                const prev = payrollMap.get(emp.employeeId) ?? {
                  employeeId: emp.employeeId,
                  amount: 0,
                };
                prev.amount += emp.amount;
                payrollMap.set(emp.employeeId, prev);
              }

              if (logs?.length) {
                const { error: updateLogsError } = await supabase
                  .from("project_percentage_logs")
                  .update({ distributed: true })
                  .eq("project_id", project.id)
                  .eq("distributed", false);

                if (updateLogsError) throw updateLogsError;
              }

              // Reset — now safe, we read fresh from DB above
              await supabase
                .from("project_percentage")
                .update({ period_percentage: 0 })
                .eq("id", pctRow.id);
            }
          }

          progressItems[progressIdx].status = "done";
          onProgress?.([...progressItems]);
        } catch (projectErr) {
          progressItems[progressIdx].status = "error";
          onProgress?.([...progressItems]);
          throw projectErr;
        }
      }

      // Company account update now uses real accumulated deltas
      await supabase
        .from("company_account")
        .update({
          cash_balance: Number(mainAccount.cash_balance) + deltas.main.cash,
          bank_balance: Number(mainAccount.bank_balance) + deltas.main.bank,
        })
        .eq("id", mainAccount.id);

      await supabase
        .from("company_account")
        .update({
          cash_balance: Number(bankAccount.cash_balance) + deltas.bank.cash,
          bank_balance: Number(bankAccount.bank_balance) + deltas.bank.bank,
        })
        .eq("id", bankAccount.id);

      for (const [, acc] of payrollMap) {
        await supabase.from("payroll").insert({
          employee_id: acc.employeeId,
          pay_date: today,
          percentage_salary: acc.amount,
          total_salary: acc.amount,
          created_by: createdBy,
          status: "pending",
        });
      }

      return { success: true };
    } catch (err) {
      console.error("Distribution error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "حدث خطأ غير متوقع",
      };
    } finally {
      // Even a run that failed part-way has moved balances, so refresh
      // every distribution, company-account and project-balance view.
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["projects-list"] });
      void queryClient.invalidateQueries({ queryKey: ["company"] });
    }
  };

  return {
    projects: query.data ?? null,
    loading: query.isPending,
    refreshing: query.isFetching && !query.isPending,
    error: query.error as PostgrestError | null,
    submitDistribution,
    refetch: async () => {
      await query.refetch();
    },
  };
}
