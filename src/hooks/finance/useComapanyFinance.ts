import { PostgrestError } from "@supabase/supabase-js";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { CompanyExpense } from "../../types/global.type";
import { supabase } from "../../lib/supabaseClient";
import { TIERS } from "../../lib/queryClient";
import {
  CompanyExpenseFormValues,
  CompanyExpensePaymentsValues,
} from "../../types/schema/companyFinance.schema";
import { useAuth } from "../useAuth";
import { CompanyPaymentsWithUser } from "../../types/extended.type";

export const companyExpensesKey = ["finance", "company-expenses"] as const;

async function fetchCompanyExpenses(): Promise<CompanyExpense[]> {
  const { data, error } = await supabase.from("company_expense").select("*");
  if (error) {
    console.error("error fetching contractors", error);
    throw error;
  }
  return data ?? [];
}

// Exported so the background prefetcher can warm this screen.
export const companyExpensesQueryOptions = () =>
  queryOptions({
    queryKey: companyExpensesKey,
    queryFn: fetchCompanyExpenses,
    ...TIERS.C,
  });

export function useComapnyFinance() {
  const queryClient = useQueryClient();
  const query = useQuery(companyExpensesQueryOptions());
  const { user } = useAuth(); // ✅ call hook here at the top

  const addExpense = async (form: CompanyExpenseFormValues) => {
    if (!user) {
      return { success: false, error: "غير مصرح" };
    }

    // fetch account
    const { data: account, error: accountError } = await supabase
      .from("company_account")
      .select("*")
      .eq("type", "main")
      .single();

    if (accountError) {
      console.error("faild to fetch company account:", accountError);
      return {
        success: false,
        error: accountError,
        message: "فشل في جلب الحساب",
      };
    }

    const status =
      form.amount_paid === 0
        ? "unpaid"
        : form.amount_paid < form.amount
          ? "partially_paid"
          : "paid";

    //add expense
    const { data: expense, error: expenseError } = await supabase
      .from("company_expense")
      .insert({
        amount: form.amount,
        company_id: "f1103f66-861b-42ce-a91d-bb9f73bb1945",
        type: form.type,
        created_by: user.id,
        serial_number: form.reference_id,
        description: form.description,
        expense_date: form.expense_date,
        amount_paid: form.amount_paid,
        status,
      })
      .select()
      .single();
    if (expenseError) {
      console.error("faild to add expense:", expenseError);
      return {
        success: false,
        error: expenseError,
        message: "فشل في انشاء المصروف",
      };
    }

    // update account
    const { error: updateAccError } = await supabase
      .from("company_account")
      .update({
        cash_balance: account.cash_balance - expense.amount_paid,
      })
      .eq("id", account.id);

    if (updateAccError) {
      console.error("faild to add expense:", updateAccError);
      return {
        success: false,
        error: updateAccError,
        message: "فشل في تحديث الحساب",
      };
    }

    if (form.amount_paid > 0) {
      const { error: paymentError } = await supabase
        .from("company_expense_payments")
        .insert({
          amount: form.amount_paid,
          expense_id: expense.id,
          payment_method: form.payment_method,
          serial_number: Number(`${form.reference_id}.1`),
          created_by: user.id,
        });

      if (paymentError) {
        console.error("faild to add expense payment:", paymentError);
        return {
          success: false,
          error: paymentError,
          message: "فشل في انشاء الدفعة ",
        };
      }
    }

    // **Update local state so UI reflects the new expense**
    queryClient.setQueryData<CompanyExpense[]>(companyExpensesKey, (prev) =>
      prev ? [...prev, expense] : [expense],
    );
    void queryClient.invalidateQueries({ queryKey: ["finance"] });
    // company_account balance is shown on the company dashboard too.
    void queryClient.invalidateQueries({ queryKey: ["company"] });

    return { success: true };
  };

  return {
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    expenses: query.data ?? [],
    refreshing: query.isFetching && !query.isPending,
    addExpense,
  };
}

export const companyExpenseKey = (expenseId: string) =>
  ["finance", "company-expense", expenseId] as const;

async function fetchCompanyExpense(expenseId: string): Promise<{
  expense: CompanyExpense;
  payments: CompanyPaymentsWithUser[];
}> {
  const { data, error: expenseError } = await supabase
    .from("company_expense")
    .select("*")
    .eq("id", expenseId)
    .single();

  if (expenseError) {
    console.error("error fetching expense:", expenseError);
    throw expenseError;
  }

  const { data: paymentsData, error: paymentsError } = await supabase
    .from("company_expense_payments")
    .select("*, users(*)")
    .eq("expense_id", expenseId);

  if (paymentsError) throw paymentsError;

  return { expense: data, payments: (paymentsData ?? []).filter(Boolean) };
}

export const companyExpenseQueryOptions = (expenseId: string) =>
  queryOptions({
    queryKey: companyExpenseKey(expenseId),
    queryFn: () => fetchCompanyExpense(expenseId),
    enabled: !!expenseId,
    ...TIERS.C,
  });

export function useCompanyExpense(expenseId: string) {
  const queryClient = useQueryClient();
  const query = useQuery(companyExpenseQueryOptions(expenseId));
  const expense = query.data?.expense ?? null;
  const { user } = useAuth();

  const addPayments = async (
    form: CompanyExpensePaymentsValues,
  ): Promise<{ success: boolean; message?: string }> => {
    if (!user) return { success: false, message: "غير مصرح" };
    if (!expense) return { success: false, message: "المصروف غير موجود" };

    // 1. Fetch main account
    const { data: account, error: accountError } = await supabase
      .from("company_account")
      .select("*")
      .eq("type", "main")
      .single();

    if (accountError) {
      console.error("failed to fetch company account:", accountError);
      return { success: false, message: "فشل في جلب الحساب" };
    }

    // 2. Insert payment
    const { error: paymentError } = await supabase
      .from("company_expense_payments")
      .insert({
        amount: form.amount,
        expense_id: expenseId,
        payment_method: form.payment_method,
        date: form.date,
        created_by: user.id,
        serial_number: 2,
      });

    if (paymentError) {
      console.error("failed to add payment:", paymentError);
      return { success: false, message: "فشل في إنشاء الدفعة" };
    }

    // 3. Recalculate amount_paid and status
    const newAmountPaid = (expense.amount_paid ?? 0) + form.amount;
    const status =
      newAmountPaid === 0
        ? "unpaid"
        : newAmountPaid < expense.amount
          ? "partially_paid"
          : "paid";

    // 4. Update expense
    const { error: expenseUpdateError } = await supabase
      .from("company_expense")
      .update({ amount_paid: newAmountPaid, status })
      .eq("id", expenseId);

    if (expenseUpdateError) {
      console.error("failed to update expense:", expenseUpdateError);
      return { success: false, message: "فشل في تحديث المصروف" };
    }

    // 5. Deduct from account balance
    const { error: accountUpdateError } = await supabase
      .from("company_account")
      .update({ cash_balance: account.cash_balance - form.amount })
      .eq("id", account.id);

    if (accountUpdateError) {
      console.error("failed to update account:", accountUpdateError);
      return { success: false, message: "فشل في تحديث الحساب" };
    }

    // 6. Refresh local state
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance"] }),
      queryClient.invalidateQueries({ queryKey: ["company"] }),
    ]);

    return { success: true };
  };

  const deletePayment = async (paymentId: string) => {
    const { error } = await supabase
      .from("company_expense_payments")
      .delete()
      .eq("id", paymentId);

    if (error) {
      console.error("failed to delete payment:", error);
      return { success: false, message: "فشل في حذف الدفعة" };
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance"] }),
      queryClient.invalidateQueries({ queryKey: ["company"] }),
    ]);
    return { success: true };
  };

  return {
    payments: query.data?.payments ?? [],
    expense,
    loading: !!expenseId && query.isPending,
    error: query.error as PostgrestError | null,
    addPayments,
    deletePayment,
  };
}
