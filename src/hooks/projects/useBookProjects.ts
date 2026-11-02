import { useCallback, useEffect, useState } from "react";
import {
  QueryClient,
  queryOptions,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { TIERS } from "../../lib/queryClient";
import { ProjectWithDetailsForBook } from "../../types/projects.type";
import { supabase } from "../../lib/supabaseClient";
import {
  ProjectExpenseFormValues,
  ProjectExpensePercentageFormValues,
  ProjectIncomeFormValues,
  ProjectMapsValues,
  ProjectRefundValues,
} from "../../types/schema/ProjectBook.schema";
import { useAuth } from "../useAuth";
import { PostgrestError } from "@supabase/supabase-js";
import {
  Currency,
  ExpenseType,
  MapType,
  Phase,
  ProjectExpenses,
  ProjectMaps,
} from "../../types/global.type";
import { normalizeError } from "../useMaps";

// A project_expenses row with the vendor / contractor names it is read with.
type ExpenseWithJoins = ProjectExpenses & {
  vendors: { vendor_name: string | null } | null;
  contractors: { first_name: string | null; last_name: string | null } | null;
};

export const bookProjectKey = (projectId: string) =>
  ["projects", "book", projectId] as const;

async function fetchBookProject(
  projectId: string,
): Promise<ProjectWithDetailsForBook> {
  // 1. Fetch project (WITHOUT expenses)
  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select(
      `
  *,
  clients(*),
  project_incomes(*),
  project_balances(*),
  project_refund(*),
  project_percentage_logs(*),
  accounts(*),
  project_maps(*)
`,
    )
    .eq("id", projectId)
    .single();

  if (projectError) throw projectError;

  // 2. Fetch ALL expenses in batches
  const pageSize = 1000;
  let from = 0;
  const expenses: ExpenseWithJoins[] = [];

  for (;;) {
    const { data: batch, error: expenseError } = await supabase
      .from("project_expenses")
      .select(
        `
    *,
    vendors(vendor_name),
    contractors(first_name,last_name)
  `,
      )
      .eq("project_id", projectId)
      .range(from, from + pageSize - 1)
      .order("created_at", { ascending: false });

    if (expenseError) throw expenseError;

    if (!batch?.length) break;

    expenses.push(...batch);

    if (batch.length < pageSize) break;

    from += pageSize;
  }

  // 3. Transform expenses
  const transformedExpenses = expenses.map((expense) => ({
    ...expense,
    vendor_name: expense.vendors?.vendor_name ?? undefined,
    contract_name:
      [expense.contractors?.first_name, expense.contractors?.last_name]
        .filter(Boolean)
        .join(" ") || undefined,
  }));

  // 4. Merge result
  const projectWithNames: ProjectWithDetailsForBook = {
    ...projectData,
    client: projectData.clients,
    project_expenses: transformedExpenses,
  };

  return projectWithNames;
}

// Exported so the background prefetcher can warm a project's book.
export const bookProjectQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: bookProjectKey(projectId),
    queryFn: () => fetchBookProject(projectId),
    enabled: !!projectId,
    ...TIERS.C,
  });

// Money writes also move balances, counters and list totals server-side
// (map payments hit company_account too), so refetch every cached
// project view, the project list and the company accounts.
function refreshProjectMoney(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["projects"] });
  void queryClient.invalidateQueries({ queryKey: ["projects-list"] });
  void queryClient.invalidateQueries({ queryKey: ["company"] });
}

export function useBookProject(projectId: string) {
  const queryClient = useQueryClient();
  const query = useQuery(bookProjectQueryOptions(projectId));
  const project = query.data ?? null;
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<Error | null>(null);
  const { user } = useAuth();

  const addExpense = async (expenseData: ProjectExpenseFormValues) => {
    try {
      setMutating(true);
      setMutationError(null);

      if (!user?.id) throw new Error("User not authenticated");

      if (!expenseData.project_id) throw new Error("Project is required");
      if (!expenseData.total_amount || expenseData.total_amount <= 0)
        throw new Error("Total amount must be > 0");
      if (!expenseData.currency) throw new Error("Currency is required");
      if (!expenseData.type) throw new Error("Expense type is required");
      if (!expenseData.phase) throw new Error("Phase is required");

      const paidAmount = expenseData.paid_amount ?? 0;

      if (paidAmount > 0 && !expenseData.payment_method) {
        throw new Error("payment_method is required when paid_amount > 0");
      }

      // ✅ Get percentage rate (do NOT depend on payment_method if it's global)
      const { data: pp, error: ppError } = await supabase
        .from("project_percentage")
        .select("percentage, total_percentage, period_percentage")
        .eq("project_id", expenseData.project_id)
        .eq("currency", expenseData.currency)
        .eq("type", expenseData.payment_method ?? "cash")
        .maybeSingle();

      if (ppError || !pp) {
        console.error("Error fetching project percentage", ppError);
        throw ppError || new Error("Project percentage not found");
      }

      const rate = (pp?.percentage ?? 0) / 100;

      let status: "unpaid" | "paid" | "partially_paid";
      if (paidAmount === 0) status = "unpaid";
      else if (paidAmount === expenseData.total_amount) status = "paid";
      else status = "partially_paid";

      // 1) Insert expense invoice
      const { data: expense, error: expenseErr } = await supabase
        .from("project_expenses")
        .insert({
          project_id: expenseData.project_id,
          description: expenseData.description,
          total_amount: expenseData.total_amount,
          expense_date: expenseData.date,
          created_by: user.id,
          phase: expenseData.phase,
          expense_type: expenseData.type,
          status,
          amount_paid: paidAmount,
          serial_number: project?.expense_counter || 0,
          contractor_id: expenseData.contractor_id ?? undefined,
          vendor_id: expenseData.vendor_id ?? undefined,
          currency: expenseData.currency,
          expense_id: expenseData.expense_id,
        })
        .select()
        .single();

      if (expenseErr) throw expenseErr;

      // ✅ 2) Update project_balances (invoice-based net)
      const invoicePercentage = expenseData.total_amount * rate;
      const netDelta = expenseData.total_amount + invoicePercentage;

      const { data: balanceData, error: balanceError } = await supabase
        .from("project_balances")
        .select("*")
        .eq("project_id", expenseData.project_id)
        .eq("currency", expenseData.currency)
        .single();

      if (balanceError) throw balanceError;

      const { error: balanceUpdateError } = await supabase
        .from("project_balances")
        .update({
          balance: (balanceData?.balance || 0) - netDelta,
          total_expense:
            (balanceData?.total_expense || 0) + expenseData.total_amount,
          total_percentage:
            (balanceData?.total_percentage || 0) + invoicePercentage,
        })
        .eq("id", balanceData?.id);

      if (balanceUpdateError) throw balanceUpdateError;

      // 3) If paid > 0, insert payment + percentage log + update account
      if (paidAmount > 0) {
        const paymentMethod = expenseData.payment_method; // safe now

        const serial_number = Number(
          `${project?.expense_counter}.${expense.payment_counter}`,
        );

        // fetch account
        const { data: accountData, error: accountError } = await supabase
          .from("accounts")
          .select("*")
          .eq("owner_id", expenseData.project_id)
          .eq("owner_type", "project")
          .eq("type", expenseData.payment_method ?? "cash")
          .eq("currency", expenseData.currency)
          .single();

        if (accountError || !accountData) {
          console.error("Error fetching project account", accountError);
          throw accountError || new Error("Project account not found");
        }

        const { data: expensePayment, error: paymentError } = await supabase
          .from("expense_payments")
          .insert({
            expense_id: expense.id,
            amount: paidAmount,
            payment_method: paymentMethod,
            account_id: accountData.id,
            created_by: user.id,
            serial_number,
            expense_no: expense.serial_number,
            payment_no: expense.payment_counter,
            invoice_no: project?.invoice_counter,
          })
          .select()
          .single();

        if (paymentError) throw paymentError;

        const percentageAmount = paidAmount * rate;

        const { error: logError } = await supabase
          .from("project_percentage_logs")
          .insert({
            project_id: expenseData.project_id,
            expense_id: expense.id,
            payment_id: expensePayment.id,
            amount: percentageAmount,
            percentage: pp?.percentage ?? 0,
          });

        if (logError) throw logError;

        const accountTotal = paidAmount + percentageAmount;

        const { error: accountUpdateError } = await supabase
          .from("accounts")
          .update({
            balance: accountData.balance - accountTotal,
            total_expense: accountData.total_expense + paidAmount,
            total_percentage: accountData.total_percentage + percentageAmount,
          })
          .eq("id", accountData.id);

        if (accountUpdateError) throw accountUpdateError;

        // Optional: if project_percentage totals are meant to track PAID percentage (cash basis)
        // keep this update; otherwise remove it.
        const { error: UpdatePPError } = await supabase
          .from("project_percentage")
          .update({
            total_percentage: pp?.total_percentage + percentageAmount,
            period_percentage: pp?.period_percentage + percentageAmount,
          })
          .eq("project_id", expenseData.project_id)
          .eq("currency", expenseData.currency)
          .eq("type", expenseData.payment_method ?? "cash");

        if (UpdatePPError) throw UpdatePPError;
      }

      // counters (leave as you had)
      await supabase
        .from("projects")
        .update({
          expense_counter: (project?.expense_counter || 0) + 1,
          invoice_counter: (project?.invoice_counter || 0) + 1,
        })
        .eq("id", expenseData.project_id);

      await supabase
        .from("project_expenses")
        .update({ payment_counter: expense.payment_counter + 1 })
        .eq("id", expense.id);

      // update local state
      queryClient.setQueryData<ProjectWithDetailsForBook>(
        bookProjectKey(projectId),
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            project_expenses: [expense, ...(prev.project_expenses ?? [])],
          };
        },
      );

      return { data: expense, error: null };
    } catch (err) {
      console.error("Error in addExpense", err);
      const error = err as PostgrestError;
      setMutationError(error);
      return { data: null, error };
    } finally {
      setMutating(false);
      refreshProjectMoney(queryClient);
    }
  };

  const addExpensePercentage = async (
    expenseData: ProjectExpensePercentageFormValues,
  ) => {
    try {
      setMutating(true);
      setMutationError(null);

      if (!user?.id) throw new Error("User not authenticated");

      if (!expenseData.project_id) throw new Error("Project is required");
      if (!expenseData.total_amount || expenseData.total_amount <= 0)
        throw new Error("Total amount must be > 0");
      if (!expenseData.currency) throw new Error("Currency is required");
      if (!expenseData.type) throw new Error("Expense type is required");
      if (!expenseData.phase) throw new Error("Phase is required");

      const paidAmount = expenseData.paid_amount ?? 0;

      if (paidAmount > 0 && !expenseData.payment_method) {
        throw new Error("payment_method is required when paid_amount > 0");
      }

      if (
        expenseData.percentage &&
        (expenseData.percentage < 0 || expenseData.percentage > 100)
      ) {
        throw new Error("Percentage must be between 0 and 100");
      }

      // ✅ Get percentage rate (do NOT depend on payment_method if it's global)
      const { data: pp, error: ppError } = await supabase
        .from("project_percentage")
        .select("total_percentage, period_percentage")
        .eq("project_id", expenseData.project_id)
        .eq("currency", expenseData.currency)
        .eq("type", expenseData.payment_method ?? "cash")
        .maybeSingle();

      if (ppError || !pp) {
        console.error("Error fetching project percentage", ppError);
        throw ppError || new Error("Project percentage not found");
      }

      const rate = (expenseData.percentage ?? 0) / 100;

      let status: "unpaid" | "paid" | "partially_paid";
      if (paidAmount === 0) status = "unpaid";
      else if (paidAmount === expenseData.total_amount) status = "paid";
      else status = "partially_paid";

      // 1) Insert expense invoice
      const { data: expense, error: expenseErr } = await supabase
        .from("project_expenses")
        .insert({
          project_id: expenseData.project_id,
          description: expenseData.description,
          total_amount: expenseData.total_amount,
          expense_date: expenseData.date,
          created_by: user.id,
          phase: expenseData.phase,
          expense_type: expenseData.type,
          status,
          amount_paid: paidAmount,
          serial_number: project?.expense_counter || 0,
          contractor_id: expenseData.contractor_id ?? undefined,
          vendor_id: expenseData.vendor_id ?? undefined,
          currency: expenseData.currency,
          is_percentage: true,
        })
        .select()
        .single();

      if (expenseErr) throw expenseErr;

      // ✅ 2) Update project_balances (invoice-based net)
      const invoicePercentage = expenseData.total_amount * rate;
      const netDelta = expenseData.total_amount + invoicePercentage;

      const { data: balanceData, error: balanceError } = await supabase
        .from("project_balances")
        .select("*")
        .eq("project_id", expenseData.project_id)
        .eq("currency", expenseData.currency)
        .single();

      if (balanceError) throw balanceError;

      const { error: balanceUpdateError } = await supabase
        .from("project_balances")
        .update({
          balance: (balanceData?.balance || 0) - netDelta,
          total_expense:
            (balanceData?.total_expense || 0) + expenseData.total_amount,
          total_percentage:
            (balanceData?.total_percentage || 0) + invoicePercentage,
        })
        .eq("id", balanceData?.id);

      if (balanceUpdateError) throw balanceUpdateError;

      // 3) If paid > 0, insert payment + percentage log + update account
      if (paidAmount > 0) {
        const paymentMethod = expenseData.payment_method; // safe now

        const serial_number = Number(
          `${project?.expense_counter}.${expense.payment_counter}`,
        );

        // fetch account
        const { data: accountData, error: accountError } = await supabase
          .from("accounts")
          .select("*")
          .eq("owner_id", expenseData.project_id)
          .eq("owner_type", "project")
          .eq("type", expenseData.payment_method ?? "cash")
          .eq("currency", expenseData.currency)
          .single();

        if (accountError || !accountData) {
          console.error("Error fetching project account", accountError);
          throw accountError || new Error("Project account not found");
        }

        const { data: expensePayment, error: paymentError } = await supabase
          .from("expense_payments")
          .insert({
            expense_id: expense.id,
            amount: paidAmount,
            payment_method: paymentMethod,
            account_id: accountData.id,
            created_by: user.id,
            serial_number,
            expense_no: expense.serial_number,
            payment_no: expense.payment_counter,
            invoice_no: project?.invoice_counter,
          })
          .select()
          .single();

        if (paymentError) throw paymentError;

        const percentageAmount = paidAmount * rate;

        const { error: logError } = await supabase
          .from("project_percentage_logs")
          .insert({
            project_id: expenseData.project_id,
            expense_id: expense.id,
            payment_id: expensePayment.id,
            amount: percentageAmount,
            percentage: expenseData.percentage ?? 0,
          });

        if (logError) throw logError;

        const accountTotal = paidAmount + percentageAmount;

        const { error: accountUpdateError } = await supabase
          .from("accounts")
          .update({
            balance: accountData.balance - accountTotal,
            total_expense: accountData.total_expense + paidAmount,
            total_percentage: accountData.total_percentage + percentageAmount,
          })
          .eq("id", accountData.id);

        if (accountUpdateError) throw accountUpdateError;

        // Optional: if project_percentage totals are meant to track PAID percentage (cash basis)
        // keep this update; otherwise remove it.
        const { error: UpdatePPError } = await supabase
          .from("project_percentage")
          .update({
            total_percentage: pp?.total_percentage + percentageAmount,
            period_percentage: pp?.period_percentage + percentageAmount,
          })
          .eq("project_id", expenseData.project_id)
          .eq("currency", expenseData.currency)
          .eq("type", expenseData.payment_method ?? "cash");

        if (UpdatePPError) throw UpdatePPError;
      }

      // counters (leave as you had)
      await supabase
        .from("projects")
        .update({
          expense_counter: (project?.expense_counter || 0) + 1,
          invoice_counter: (project?.invoice_counter || 0) + 1,
        })
        .eq("id", expenseData.project_id);

      await supabase
        .from("project_expenses")
        .update({ payment_counter: expense.payment_counter + 1 })
        .eq("id", expense.id);

      // update local state
      queryClient.setQueryData<ProjectWithDetailsForBook>(
        bookProjectKey(projectId),
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            project_expenses: [expense, ...(prev.project_expenses ?? [])],
          };
        },
      );

      return { data: expense, error: null };
    } catch (err) {
      const error = err as PostgrestError;
      setMutationError(error);
      return { data: null, error };
    } finally {
      setMutating(false);
      refreshProjectMoney(queryClient);
    }
  };

  const addIncome = async (incomeData: ProjectIncomeFormValues) => {
    try {
      setMutating(true);
      setMutationError(null);

      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      // get the project for income counter for the serial number
      const { data: projectRow, error: projectError } = await supabase
        .from("projects")
        .select("income_counter, invoice_counter")
        .eq("id", incomeData.project_id)
        .single();

      if (projectError) {
        console.error(
          "Error fetching project for income counter",
          projectError,
        );
        throw projectError;
      }

      const { data, error } = await supabase
        .from("project_incomes")
        .insert({
          project_id: incomeData.project_id,
          description: incomeData.description,
          amount: incomeData.amount,
          income_date: incomeData.income_date,
          created_by: user.id,
          fund: incomeData.fund,
          payment_method:
            incomeData.payment_method === "cash" ? "cash" : "bank",
          serial_number: projectRow?.income_counter || 0,
          client_name: incomeData.client_name,
          currency: incomeData.currency,
        })
        .select()
        .single();

      if (error) {
        console.error("Error adding income", error);
        throw error;
      }

      // Update local state with new income
      if (data) {
        queryClient.setQueryData<ProjectWithDetailsForBook>(
          bookProjectKey(projectId),
          (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              project_incomes: [...(prev.project_incomes || []), data],
              income_counter: (prev.income_counter || 0) + 1,
            };
          },
        );
      }

      // update project income counter
      const { error: counterError } = await supabase
        .from("projects")
        .update({
          income_counter: (projectRow?.income_counter || 0) + 1,
          invoice_counter: (projectRow?.invoice_counter || 0) + 1,
        })
        .eq("id", incomeData.project_id);

      if (counterError) {
        console.error("error updating project income counter", counterError);
        setMutationError(counterError);
      }

      //update the account balance and total transactions
      const { data: accountData, error: accountError } = await supabase
        .from("accounts")
        .select("*")
        .eq("owner_id", incomeData.project_id)
        .eq("currency", incomeData.currency)
        .eq("type", incomeData.payment_method === "cash" ? "cash" : "bank")
        .eq("owner_type", "project")
        .single();

      if (accountError) {
        console.error("Error fetching project account", accountError);
        throw accountError;
      }

      const { error: accountUpdateError } = await supabase
        .from("accounts")
        .update({
          balance: accountData.balance + incomeData.amount,
          total_transactions:
            accountData.total_transactions + incomeData.amount,
        })
        .eq("id", accountData.id);

      if (accountUpdateError) {
        console.error("Error updating project account", accountUpdateError);
        throw accountUpdateError;
      }

      // get the project balance and update it
      const { data: projectData, error: projectBalanceError } = await supabase
        .from("project_balances")
        .select("*")
        .eq("project_id", incomeData.project_id)
        .eq("currency", incomeData.currency)
        .single();

      if (projectBalanceError) {
        console.error("Error fetching project balance", projectBalanceError);
        throw projectBalanceError;
      }

      const { error: projectBalanceUpdateError } = await supabase
        .from("project_balances")
        .update({
          balance: projectData.balance + incomeData.amount,
          total_transactions:
            projectData.total_transactions + incomeData.amount,
        })
        .eq("id", projectData.id);

      if (projectBalanceUpdateError) {
        console.error(
          "Error updating project balance",
          projectBalanceUpdateError,
        );
        throw projectBalanceUpdateError;
      }

      return { data, error: null };
    } catch (err) {
      const error = err as PostgrestError;
      setMutationError(error);
      return { data: null, error };
    } finally {
      setMutating(false);
      refreshProjectMoney(queryClient);
    }
  };

  const addRefund = async (form: ProjectRefundValues) => {
    // 1 fetch project percentage (cash or bank)
    const { data: projectPercentage, error: projectPercentageError } =
      await supabase
        .from("project_percentage")
        .select("*")
        .eq("project_id", form.project_id)
        .eq("type", form.payment_method)
        .eq("currency", form.currency)
        .single();

    if (projectPercentageError) {
      console.error(
        "Error fetching project percentage",
        projectPercentageError,
      );
      return { success: false, message: "حدث خطأ أثناء جلب نسبة المشروع" };
    }
    // 2 fetch project account
    const { data: projectAccount, error: projectAccountError } = await supabase
      .from("accounts")
      .select("*")
      .eq("owner_id", form.project_id)
      .eq("owner_type", "project")
      .eq("type", form.payment_method === "cash" ? "cash" : "bank")
      .eq("currency", form.currency)
      .single();

    if (projectAccountError || !projectAccount) {
      console.error("Error fetching project account", projectAccountError);
      return { success: false, message: "حدث خطأ أثناء جلب حساب المشروع" };
    }
    // 3 fetch project balance
    const { data: projectBalance, error: projectBalanceError } = await supabase
      .from("project_balances")
      .select("*")
      .eq("project_id", form.project_id)
      .eq("currency", form.currency)
      .single();

    if (projectBalanceError) {
      console.error("Error fetching project balance", projectBalanceError);
      return { success: false, message: "حدث خطأ أثناء جلب رصيد المشروع" };
    }
    // 4 fetch project refund counter
    const { data: companyData, error: companyDataError } = await supabase
      .from("projects")
      .select("refund_counter, invoice_counter")
      .eq("id", form.project_id)
      .single();

    if (companyDataError) {
      console.error("Error fetching project refund counter", companyDataError);
      return {
        success: false,
        message: "حدث خطأ أثناء جلب عداد استرداد المشروع",
      };
    }

    // 5 insert project refund
    if (!user?.id) {
      return { success: false, message: "المستخدم غير مصرح له" };
    }

    // ensure required fields are present for the insert; cast/assign to ProjectRefund
    const refundPayload = {
      amount: form.amount as number,
      project_id: form.project_id,
      description: form.description ?? null,
      created_by: user.id,
      payment_method: form.payment_method,
      income_date: form.income_date ?? undefined,
      serial_number: companyData?.refund_counter || 0,
      invoice_number: companyData?.invoice_counter || 0,
      currency: form.currency,
      expense_id: form.expense_id ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: refundData, error: refundError } = await supabase
      .from("project_refund")
      .insert(refundPayload)
      .select()
      .single();

    if (refundError || !refundData) {
      console.error("Error inserting project refund", refundError);
      return { success: false, message: "حدث خطأ أثناء إضافة استرداد المشروع" };
    }

    // 6. Update project percentage - Calculate percentage and subtract (can go negative)
    const rate = (projectPercentage?.percentage || 0) / 100;
    const percentageAmount = form.amount * rate;
    const totalAmount = form.amount + percentageAmount;

    const { error: projectPercentageUpdateError } = await supabase
      .from("project_percentage")
      .update({
        period_percentage:
          (projectPercentage?.period_percentage || 0) - percentageAmount,
        total_percentage:
          (projectPercentage?.total_percentage || 0) - percentageAmount,
      })
      .eq("id", projectPercentage?.id);

    if (projectPercentageUpdateError) {
      console.error(
        "Error updating project percentage",
        projectPercentageUpdateError,
      );
      return { success: false, message: "حدث خطأ أثناء تحديث نسبة المشروع" };
    }

    // insert percentage log with negative amount to indicate refund
    const { error: logError } = await supabase
      .from("project_percentage_logs")
      .insert({
        project_id: form.project_id,
        refund_id: refundData.id,
        amount: -percentageAmount,
        percentage: projectPercentage?.percentage ?? 0,
        type: "refund",
      });

    if (logError) {
      console.error("Error inserting project percentage log", logError);
      return {
        success: false,
        message: "حدث خطأ أثناء تسجيل نسبة استرداد المشروع",
      };
    }

    // 7 update project acccount
    const { error: projectAccountUpdateError } = await supabase
      .from("accounts")
      .update({
        balance: projectAccount.balance + totalAmount,
        refund: (projectAccount.refund || 0) + totalAmount,
        total_percentage:
          (projectAccount.total_percentage || 0) - percentageAmount,
        total_expense: (projectAccount.total_expense || 0) - form.amount,
      })
      .eq("id", projectAccount?.id);

    if (projectAccountUpdateError) {
      console.error(
        "Error updating project account",
        projectAccountUpdateError,
      );
      return { success: false, message: "حدث خطأ أثناء تحديث حساب المشروع" };
    }
    // 8 update project balance
    const { error: projectBalanceUpdateError } = await supabase
      .from("project_balances")
      .update({
        balance: projectBalance.balance + totalAmount,
        total_expense: projectBalance.total_expense - form.amount,
        refund: (projectBalance.refund || 0) + totalAmount,
        total_percentage:
          (projectBalance.total_percentage || 0) - percentageAmount,
      })
      .eq("id", projectBalance?.id);

    if (projectBalanceUpdateError) {
      console.error(
        "Error updating project balance",
        projectBalanceUpdateError,
      );
      return { success: false, message: "حدث خطأ أثناء تحديث رصيد المشروع" };
    }
    // 9 update project refund counter
    const { error: projectRefundCounterUpdateError } = await supabase
      .from("projects")
      .update({
        refund_counter: (companyData?.refund_counter || 0) + 1,
        invoice_counter: (companyData?.invoice_counter || 0) + 1,
      })
      .eq("id", form.project_id);

    if (projectRefundCounterUpdateError) {
      console.error(
        "Error updating project refund counter",
        projectRefundCounterUpdateError,
      );
      return {
        success: false,
        message: "حدث خطأ أثناء تحديث عداد استرداد المشروع",
      };
    }

    refreshProjectMoney(queryClient);
    return { success: true };
  };

  return {
    project,
    loading: query.isPending || mutating,
    refreshing: query.isFetching && !query.isPending,
    error: mutationError ?? (query.error as Error | null),
    addExpense,
    addIncome,
    addRefund,
    addExpensePercentage,
  };
}

export function useProjectExpenseActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const updateExpense = async (payload: {
    expense_id: string;
    description?: string | null;
    total_amount?: number | null;
    expense_date?: string | null; // yyyy-mm-dd
    expense_type: ExpenseType;
    phase: Phase;
    currency: Currency;
    contractor_id?: string | null;
    expense_ref_id?: string | null;
    vendor_id?: string | null;
  }) => {
    if (!user?.id) return { success: false, error: "غير مصرح" };

    const { data, error } = await supabase
      .from("project_expenses")
      .select("*")
      .eq("id", payload.expense_id)
      .single();

    if (error || !data) {
      console.error("Error fetching expense for update", error);
      return { success: false, error: "حدث خطأ أثناء جلب المصروف للتحديث" };
    }

    if (!data.currency) {
      return {
        success: false,
        error: "عملة المصروف غير موجودة (currency is null)",
      };
    }

    // ✅ normalize undefined so it doesn't look like a change
    const nextVendor = payload.vendor_id ?? data.vendor_id ?? null;
    const nextContractor = payload.contractor_id ?? data.contractor_id ?? null;
    const nextDescription = payload.description ?? data.description ?? null;
    const nextDate = payload.expense_date ?? data.expense_date ?? null;
    const nextExpenseRef = payload.expense_ref_id ?? data.expense_id ?? null;

    // compaier if the change is none money values
    const changedVendor = nextVendor !== (data.vendor_id ?? null);
    const changedContractor = nextContractor !== (data.contractor_id ?? null);
    const changedDescription = nextDescription !== (data.description ?? null);
    const changedDate = nextDate !== (data.expense_date ?? null);
    const changedType = payload.expense_type !== data.expense_type;
    const changedPhase = payload.phase !== data.phase;

    // ✅ normalize amount so undefined doesn't force change
    const nextTotalAmount = payload.total_amount ?? data.total_amount;
    const changedAmount = nextTotalAmount !== data.total_amount;

    const changedCurrency = payload.currency !== data.currency;
    if (changedCurrency) {
      return {
        success: false,
        error:
          "لا يمكن تغيير عملة المصروف، يرجى حذف المصروف وإعادة إضافته بالعملة الصحيحة",
      };
    }

    // ✅ prevent total < paid (basic safety)
    const paid = data.amount_paid ?? 0;

    if (
      changedVendor ||
      changedContractor ||
      changedDescription ||
      changedDate ||
      changedType ||
      changedPhase ||
      nextExpenseRef !== (data.expense_id ?? null)
    ) {
      //update the expense
      const { error: updateError } = await supabase
        .from("project_expenses")
        .update({
          description: nextDescription,
          expense_date: nextDate,
          expense_type: payload.expense_type,
          phase: payload.phase,
          contractor_id: nextContractor,
          vendor_id: nextVendor,
          expense_id: nextExpenseRef,
          is_edited: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.expense_id);

      if (updateError) {
        console.error("Error updating expense", updateError);
        return { success: false, error: "حدث خطأ أثناء تحديث المصروف" };
      }
    }

    if (changedAmount) {
      // update the amount + ✅ update status (basic)
      let status: "unpaid" | "paid" | "partially_paid";
      if (paid === 0) status = "unpaid";
      else if (paid >= nextTotalAmount) status = "paid";
      else status = "partially_paid";

      const { error: amountUpdateError } = await supabase
        .from("project_expenses")
        .update({
          total_amount: nextTotalAmount,
          status,
          is_edited: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.expense_id);

      if (amountUpdateError) {
        console.error("Error updating expense amount", amountUpdateError);
        return { success: false, error: "حدث خطأ أثناء تحديث مبلغ المصروف" };
      }

      //update the account balance based on the difference between the new amount and the old amount
      const amountDifference = nextTotalAmount - data.total_amount;

      const { data: projectBalance, error: projectBalanceError } =
        await supabase
          .from("project_balances")
          .select("*")
          .eq("project_id", data.project_id)
          .eq("currency", data.currency)
          .single();

      if (projectBalanceError || !projectBalance) {
        console.error(
          "Error fetching project balance for expense amount update",
          projectBalanceError,
        );
        return {
          success: false,
          error: "حدث خطأ أثناء جلب رصيد المشروع لتحديث مبلغ المصروف",
        };
      }

      const { data: PercentageData, error: PercentageError } = await supabase
        .from("project_percentage")
        .select("percentage")
        .eq("project_id", data.project_id)
        .eq("currency", data.currency);

      if (PercentageError || !PercentageData) {
        console.error(
          "Error fetching project percentage for expense amount update",
          PercentageError,
        );
        return {
          success: false,
          error: "حدث خطأ أثناء جلب نسبة المشروع لتحديث مبلغ المصروف",
        };
      }

      const rate = PercentageData[0]?.percentage / 100;
      const golableDifference = amountDifference + amountDifference * rate;

      const { error: projectBalanceUpdateError } = await supabase
        .from("project_balances")
        .update({
          balance: projectBalance.balance - golableDifference,
          total_expense: projectBalance.total_expense + amountDifference,
          total_percentage:
            projectBalance.total_percentage + amountDifference * rate,
        })
        .eq("id", projectBalance.id);

      if (projectBalanceUpdateError) {
        console.error(
          "Error updating project balance for expense amount update",
          projectBalanceUpdateError,
        );
        return {
          success: false,
          error: "حدث خطأ أثناء تحديث رصيد المشروع لتحديث مبلغ المصروف",
        };
      }
    }

    refreshProjectMoney(queryClient);
    return { success: true };
  };

  const deleteExpense = async (payload: {
    expense_id: string;
    currency: Currency;
  }) => {
    const userId = user?.id;
    setLoading(true);
    setError(null);
    try {
      if (!userId) throw new Error("Not authenticated");
      if (!payload.expense_id) throw new Error("expense_id required");

      // 1) Fetch expense
      const { data: expense, error: expenseError } = await supabase
        .from("project_expenses")
        .select(
          "id, project_id, currency, total_amount, expense_date, deleted_at, is_percentage",
        )
        .eq("id", payload.expense_id)
        .single();

      if (expenseError) throw expenseError;
      if (!expense) throw new Error("Expense not found");
      if (expense.deleted_at) throw new Error("Expense already deleted");
      if (expense.currency !== payload.currency)
        throw new Error("Currency mismatch");

      // 2) Decide invoice percentage rate (for project_balances)
      let invoiceRate = 0;

      if (!expense.is_percentage) {
        // default rate from project_percentage (invoice basis)
        const { data: App, error: ppError } = await supabase
          .from("project_percentage")
          .select("percentage")
          .eq("project_id", expense.project_id)
          .eq("currency", expense.currency);

        if (ppError) throw ppError;

        const pp = App[0];

        invoiceRate = Number(pp?.percentage ?? 0) / 100;
      } else {
        // changed rate from logs (take the latest log percentage for that expense)
        const { data: lastLog, error: lastLogError } = await supabase
          .from("project_percentage_logs")
          .select("percentage")
          .eq("expense_id", expense.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastLogError) throw lastLogError;

        // if no log exists (should be rare), rate stays 0
        invoiceRate = Number(lastLog?.percentage ?? 0) / 100;
      }

      const invoicePercentageAmount =
        Number(expense.total_amount) * invoiceRate;

      // 3) Reverse project_balances (invoice-based always)
      const { data: pb, error: pbError } = await supabase
        .from("project_balances")
        .select("id, balance, total_expense, total_percentage")
        .eq("project_id", expense.project_id)
        .eq("currency", expense.currency)
        .single();

      if (pbError) throw pbError;
      if (!pb) throw new Error("project_balances not found");

      const netDelta =
        Number(expense.total_amount) + Number(invoicePercentageAmount);

      const { error: pbUpdateError } = await supabase
        .from("project_balances")
        .update({
          balance: Number(pb.balance) + netDelta,
          total_expense:
            Number(pb.total_expense) - Number(expense.total_amount),
          total_percentage:
            Number(pb.total_percentage) - Number(invoicePercentageAmount),
        })
        .eq("id", pb.id);

      console.log("Reversed project balance with delta", {
        netDelta,
        balanceBefore: pb.balance,
        balanceAfter: Number(pb.balance) + netDelta,
        totalExpenseBefore: pb.total_expense,
        totalExpenseAfter:
          Number(pb.total_expense) - Number(expense.total_amount),
        totalPercentageBefore: pb.total_percentage,
        totalPercentageAfter:
          Number(pb.total_percentage) - Number(invoicePercentageAmount),
      });
      if (pbUpdateError) throw pbUpdateError;

      // 4) Fetch payments
      const { data: payments, error: paymentsError } = await supabase
        .from("expense_payments")
        .select("id, amount, account_id, payment_method")
        .eq("expense_id", expense.id);

      if (paymentsError) throw paymentsError;

      // 5) Reverse payment-based stuff (accounts + project_percentage totals) using logs.amount
      for (const pay of payments ?? []) {
        if (!pay.account_id) throw new Error("Payment account_id is null");

        // one log per payment (your rule)
        const { data: log, error: logError } = await supabase
          .from("project_percentage_logs")
          .select("id, amount")
          .eq("payment_id", pay.id)
          .maybeSingle();

        if (logError) throw logError;

        const paidPercentageAmount = Number(log?.amount ?? 0);

        // account reverse
        const { data: acc, error: accError } = await supabase
          .from("accounts")
          .select("id, balance, total_expense, total_percentage")
          .eq("id", pay.account_id)
          .single();

        if (accError) throw accError;
        if (!acc) throw new Error("Account not found");

        const accountDelta = Number(pay.amount) + paidPercentageAmount;

        const { error: accUpdateError } = await supabase
          .from("accounts")
          .update({
            balance: Number(acc.balance) + accountDelta,
            total_expense: Number(acc.total_expense) - Number(pay.amount),
            total_percentage:
              Number(acc.total_percentage) - paidPercentageAmount,
          })
          .eq("id", acc.id);

        if (accUpdateError) throw accUpdateError;

        console.log("Reversed account balance with delta", {
          accountDelta,
          balanceBefore: acc.balance,
          balanceAfter: Number(acc.balance) + accountDelta,
          totalExpenseBefore: acc.total_expense,
          totalExpenseAfter: Number(acc.total_expense) - Number(pay.amount),
          totalPercentageBefore: acc.total_percentage,
          totalPercentageAfter:
            Number(acc.total_percentage) - paidPercentageAmount,
        });

        // project_percentage totals reverse (cash/bank)
        const type = (pay.payment_method as "cash" | "bank") ?? "cash";

        const { data: pp2, error: pp2Error } = await supabase
          .from("project_percentage")
          .select("id, total_percentage, period_percentage")
          .eq("project_id", expense.project_id)
          .eq("currency", expense.currency)
          .eq("type", type)
          .single();

        if (pp2Error) throw pp2Error;

        const { error: pp2UpdateError } = await supabase
          .from("project_percentage")
          .update({
            total_percentage:
              Number(pp2.total_percentage) - paidPercentageAmount,
            period_percentage:
              Number(pp2.period_percentage) - paidPercentageAmount,
          })
          .eq("id", pp2.id);

        if (pp2UpdateError) throw pp2UpdateError;

        // delete log then payment
        if (log?.id) {
          const { error: delLogError } = await supabase
            .from("project_percentage_logs")
            .delete()
            .eq("id", log.id);

          if (delLogError) throw delLogError;
        }

        const { error: delPayError } = await supabase
          .from("expense_payments")
          .delete()
          .eq("id", pay.id);

        if (delPayError) throw delPayError;
      }

      // 6) Soft delete expense
      const { error: softDeleteError } = await supabase
        .from("project_expenses")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
        })
        .eq("id", expense.id);

      if (softDeleteError) throw softDeleteError;

      refreshProjectMoney(queryClient);
      return { success: true };
    } catch (err) {
      console.error("deleteExpense error", err);
      return { success: false, error: err as PostgrestError | Error };
    } finally {
      setLoading(false);
    }
  };

  return { updateExpense, deleteExpense, loading, error };
}

export function useMaps(projectId: string) {
  const [maps, setMaps] = useState<MapType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string } | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const fetchMaps = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const { data, error } = await supabase
        .from("map_types")
        .select("id,name,created_at")
        .order("name", { ascending: false });

      if (error) throw error;
      setMaps((data ?? []) as MapType[]);
    } catch (e: unknown) {
      const msg = normalizeError(e, "فشل في تحميل أنواع الخرائط");
      setError({ message: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMaps();
  }, [fetchMaps]);

  const addMaps = async (form: ProjectMapsValues) => {
    try {
      setLoading(true);
      setError(null);

      if (!user?.id) throw new Error("User not authenticated");

      if (!projectId) throw new Error("Project is required");
      if (!form.map_id) throw new Error("Map is required");
      if (!form.amount || form.amount <= 0)
        throw new Error("Total amount must be > 0");
      if (!form.payment_method) throw new Error("Expense type is required");

      const paidAmount = form.amount ?? 0;

      if (paidAmount > 0 && !form.payment_method) {
        throw new Error("payment_method is required when paid_amount > 0");
      }

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("map_counter, invoice_counter")
        .eq("id", projectId)
        .single();

      if (projectError) throw projectError;

      let status: "unpaid" | "paid" | "partially_paid";
      if (paidAmount === 0) status = "unpaid";
      else if (paidAmount === form.amount) status = "paid";
      else status = "partially_paid";

      // 1) Insert expense invoice
      const { data: expense, error: expenseErr } = await supabase
        .from("project_maps")
        .insert({
          map_id: form.map_id,
          project_id: projectId,
          amount: form.amount,
          description: form.description,
          payment_method: form.payment_method,
          status,
          created_by: user.id,
          date: form.date,
          created_at: new Date().toISOString(),
          invoice_number: project?.invoice_counter || 0,
          serial_number: project?.map_counter || 0,
        } as ProjectMaps)
        .select()
        .single();

      if (expenseErr) throw expenseErr;

      // ✅ 2) Update project_balances (invoice-based net)

      const { data: balanceData, error: balanceError } = await supabase
        .from("project_balances")
        .select("*")
        .eq("project_id", projectId)
        .eq("currency", "LYD")
        .single();

      if (balanceError) throw balanceError;

      const { error: balanceUpdateError } = await supabase
        .from("project_balances")
        .update({
          balance: (balanceData?.balance || 0) - paidAmount,
          total_expense: (balanceData?.total_expense || 0) + paidAmount,
          maps: (balanceData?.maps || 0) + paidAmount,
        })
        .eq("id", balanceData?.id);

      if (balanceUpdateError) throw balanceUpdateError;

      const { data: accountData, error: accountError } = await supabase
        .from("accounts")
        .select("*")
        .eq("owner_id", projectId)
        .eq("owner_type", "project")
        .eq("type", form.payment_method ?? "cash")
        .eq("currency", "LYD")
        .single();

      if (accountError || !accountData) {
        console.error("Error fetching project account", accountError);
        throw accountError || new Error("Project account not found");
      }

      const { error: accountUpdateError } = await supabase
        .from("accounts")
        .update({
          balance: accountData.balance - paidAmount,
          total_expense: accountData.total_expense + paidAmount,
          maps: accountData.maps + paidAmount,
        })
        .eq("id", accountData.id);

      if (accountUpdateError) throw accountUpdateError;

      // counters (leave as you had)
      await supabase
        .from("projects")
        .update({
          map_counter: (project?.map_counter || 0) + 1,
          invoice_counter: (project?.invoice_counter || 0) + 1,
        })
        .eq("id", projectId);

      // update company account type maps
      const { data: companyAccount, error: companyAccountError } =
        await supabase
          .from("company_account")
          .select("*")
          .eq("type", "maps")
          .single();

      if (companyAccountError || !companyAccount) {
        console.error(
          "Error fetching company account for maps",
          companyAccountError,
        );
        throw (
          companyAccountError || new Error("Company account for maps not found")
        );
      }

      if (form.payment_method == "cash") {
        const { error: companyAccountUpdateError } = await supabase
          .from("company_account")
          .update({
            cash_balance: companyAccount.cash_balance + paidAmount,
          })
          .eq("id", companyAccount.id);

        if (companyAccountUpdateError) {
          console.error(
            "Error updating company account for maps",
            companyAccountUpdateError,
          );
          throw companyAccountUpdateError;
        }
      } else if (form.payment_method == "bank") {
        const { error: companyAccountUpdateError } = await supabase
          .from("company_account")
          .update({
            bank_balance: companyAccount.bank_balance + paidAmount,
          })
          .eq("id", companyAccount.id);

        if (companyAccountUpdateError) {
          console.error(
            "Error updating company account for maps",
            companyAccountUpdateError,
          );
          throw companyAccountUpdateError;
        }
      }

      refreshProjectMoney(queryClient);
      return { data: expense, error: null };
    } catch (err) {
      console.error("Error in addExpense", err);
      const error = err as PostgrestError;
      setError(error);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  const deleteMap = async (payload: { project_map_id: string }) => {
    try {
      setLoading(true);
      setError(null);

      if (!user?.id) throw new Error("User not authenticated");
      if (!projectId) throw new Error("Project is required");
      if (!payload.project_map_id) throw new Error("Map item ID is required");

      // 1) fetch map expense row
      const { data: mapRow, error: mapRowError } = await supabase
        .from("project_maps")
        .select("id, project_id, amount, payment_method")
        .eq("id", payload.project_map_id)
        .single();

      if (mapRowError || !mapRow) {
        console.error("Error fetching map row for deletion", mapRowError);
        throw mapRowError || new Error("Map item not found");
      }

      // safety: ensure same project
      if (mapRow.project_id !== projectId) {
        throw new Error("Map item does not belong to this project");
      }

      const amount = Number(mapRow.amount ?? 0);
      if (!amount || amount <= 0) throw new Error("Invalid map amount");

      const paymentType = (mapRow.payment_method as "cash" | "bank") ?? "cash";

      // 2) revert project_balances (you used currency = 'LYD' only)
      const { data: balanceData, error: balanceError } = await supabase
        .from("project_balances")
        .select("id, balance, total_expense")
        .eq("project_id", projectId)
        .eq("currency", "LYD")
        .single();

      if (balanceError || !balanceData)
        throw balanceError || new Error("Project balance not found");

      const { error: balanceUpdateError } = await supabase
        .from("project_balances")
        .update({
          balance: Number(balanceData.balance ?? 0) + amount,
          total_expense: Number(balanceData.total_expense ?? 0) - amount,
        })
        .eq("id", balanceData.id);

      if (balanceUpdateError) throw balanceUpdateError;

      // 3) revert account (cash/bank)
      const { data: accountData, error: accountError } = await supabase
        .from("accounts")
        .select("id, balance, total_expense")
        .eq("owner_id", projectId)
        .eq("owner_type", "project")
        .eq("type", paymentType)
        .eq("currency", "LYD")
        .single();

      if (accountError || !accountData)
        throw accountError || new Error("Project account not found");

      const { error: accountUpdateError } = await supabase
        .from("accounts")
        .update({
          balance: Number(accountData.balance ?? 0) + amount,
          total_expense: Number(accountData.total_expense ?? 0) - amount,
        })
        .eq("id", accountData.id);

      if (accountUpdateError) throw accountUpdateError;

      //remove it from the company account type maps
      const { data: companyAccount, error: companyAccountError } =
        await supabase
          .from("company_account")
          .select("*")
          .eq("type", "maps")
          .single();

      if (companyAccountError || !companyAccount) {
        console.error(
          "Error fetching company account for maps during deletion",
          companyAccountError,
        );
        throw (
          companyAccountError || new Error("Company account for maps not found")
        );
      }

      if (paymentType == "cash") {
        const { error: companyAccountUpdateError } = await supabase
          .from("company_account")
          .update({
            cash_balance: companyAccount.cash_balance - amount,
          })
          .eq("id", companyAccount.id);

        if (companyAccountUpdateError) {
          console.error(
            "Error updating company account for maps during deletion",
            companyAccountUpdateError,
          );
          throw companyAccountUpdateError;
        }
      } else if (paymentType == "bank") {
        const { error: companyAccountUpdateError } = await supabase
          .from("company_account")
          .update({
            bank_balance: companyAccount.bank_balance - amount,
          })
          .eq("id", companyAccount.id);

        if (companyAccountUpdateError) {
          console.error(
            "Error updating company account for maps during deletion",
            companyAccountUpdateError,
          );
          throw companyAccountUpdateError;
        }
      }

      // 4) delete the project_maps row
      // Option A: Hard delete (works with your current schema)
      const { error: deleteError } = await supabase
        .from("project_maps")
        .delete()
        .eq("id", mapRow.id);

      if (deleteError) throw deleteError;

      refreshProjectMoney(queryClient);
      return { success: true, error: null };
    } catch (err) {
      console.error("Error in deleteMap", err);
      const e = err as PostgrestError;
      setError(e);
      return { success: false, error: e };
    } finally {
      setLoading(false);
    }
  };

  return { maps, loading, error, addMaps, deleteMap };
}
