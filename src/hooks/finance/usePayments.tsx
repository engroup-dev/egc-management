import { useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Account, ProjectExpenses } from "../../types/global.type";
import { supabase } from "../../lib/supabaseClient";
import { TIERS } from "../../lib/queryClient";
import { projectExpensePayments } from "../../types/extended.type";
import { PostgrestError } from "@supabase/supabase-js";
import { ExpensePaymentFormValues } from "../../types/schema/ProjectBook.schema";
import { useAuth } from "../useAuth";

export const expensePaymentsKey = (expenseId: string) =>
  ["finance", "expense-payments", expenseId] as const;

interface ExpensePaymentsData {
  payment: projectExpensePayments[];
  expense: ProjectExpenses;
  accounts: Account[];
}

async function fetchExpensePayments(
  expenseId: string,
): Promise<ExpensePaymentsData> {
  const { data, error } = await supabase
    .from("expense_payments")
    .select("*, accounts(currency, id, type), users(*)")
    .eq("expense_id", expenseId);
  if (error) throw error;

  const { data: expenseData, error: expenseError } = await supabase
    .from("project_expenses")
    .select("*")
    .eq("id", expenseId)
    .single();
  if (expenseError) throw expenseError;

  const { data: accountsData, error: accountsError } = await supabase
    .from("accounts")
    .select("*")
    .eq("owner_type", "project")
    .eq("owner_id", expenseData.project_id);
  if (accountsError) throw accountsError;

  return { payment: data, expense: expenseData, accounts: accountsData ?? [] };
}

export const expensePaymentsQueryOptions = (expenseId: string) =>
  queryOptions({
    queryKey: expensePaymentsKey(expenseId),
    queryFn: () => fetchExpensePayments(expenseId),
    enabled: !!expenseId,
    ...TIERS.C,
  });

export function useExpensePayments(expenseId: string) {
  const queryClient = useQueryClient();
  const query = useQuery(expensePaymentsQueryOptions(expenseId));
  const payment = query.data?.payment ?? null;
  const expense = query.data?.expense ?? null;
  const accounts = query.data?.accounts ?? null;
  // An empty id never fetches; don't leave the caller on a spinner.
  const loading = !!expenseId && query.isPending;
  const error = query.error
    ? ((query.error as PostgrestError)?.message ?? String(query.error))
    : null;
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();

  const addPayment = async (form: ExpensePaymentFormValues) => {
    setSubmitting(true);

    try {
      if (!user?.id)
        return { success: false, error: "غير مصرح — المستخدم غير معروف" };

      if (!expense?.project_id)
        return { success: false, error: "معلومات المشروع غير متوفرة" };

      if (!expenseId) return { success: false, error: "المصروف غير متوفر" };

      const paidAmount = Number(form.amount);
      if (!paidAmount || paidAmount <= 0)
        return { success: false, error: "المبلغ يجب أن يكون أكبر من صفر" };

      if (!form.currency) return { success: false, error: "العملة مطلوبة" };
      if (!form.account_id) return { success: false, error: "الحساب مطلوب" };

      // 1) Get account (for method + currency)
      const { data: accountData, error: accountError } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", form.account_id)
        .single();

      if (accountError || !accountData) {
        console.error("Error fetching account data", accountError);
        return { success: false, error: "لا يمكن جلب بيانات الحساب" };
      }

      if (accountData.currency !== form.currency) {
        return { success: false, error: "الحساب لا يطابق العملة المختارة" };
      }

      // 2) Get project
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("*")
        .eq("id", accountData.owner_id)
        .single();

      if (projectError || !project) {
        console.error("Error fetching project data", projectError);
        return { success: false, error: "لا يمكن جلب بيانات المشروع" };
      }

      // 3) Get percentage config
      const { data: pp, error: ppError } = await supabase
        .from("project_percentage")
        .select("percentage, total_percentage, period_percentage")
        .eq("project_id", accountData.owner_id)
        .eq("currency", accountData.currency)
        .eq("type", accountData.type)
        .maybeSingle();

      if (ppError || !pp) {
        console.error("Error fetching project percentage", ppError);
        throw ppError || new Error("Project percentage not found");
      }

      const paymentMethod = accountData.type; // cash / bank
      const rate = Number(pp.percentage ?? 0) / 100;

      const totalAmount = Number(expense.total_amount ?? 0);
      const alreadyPaid = Number(expense.amount_paid ?? 0);

      if (totalAmount > 0 && paidAmount > totalAmount - alreadyPaid) {
        return {
          success: false,
          error: `المبلغ أكبر من المتبقي. المتبقي: ${totalAmount - alreadyPaid}`,
        };
      }

      const paymentNo = Number(expense.payment_counter ?? 1);
      const expenseNo = Number(expense.serial_number);

      // IMPORTANT: if expenseNo is null/0 -> your serial will be bad
      if (!expenseNo || Number.isNaN(expenseNo)) {
        return {
          success: false,
          error: "رقم المصروف (serial_number) غير موجود",
        };
      }

      const serial_number = Number(`${expenseNo}.${paymentNo}`);

      // ✅ 5) Insert payment
      const { data: expensePayment, error: paymentError } = await supabase
        .from("expense_payments")
        .insert({
          expense_id: expense.id,
          amount: paidAmount,
          payment_method: paymentMethod,
          account_id: accountData.id,
          created_by: user.id,
          serial_number,
          expense_no: expenseNo,
          payment_no: paymentNo,
          invoice_no: Number(project.invoice_counter),
        })
        .select()
        .single();

      if (paymentError) {
        // If still conflict, it means another payment was inserted at same time
        // Return a clean message
        if (paymentError?.code === "23505") {
          return {
            success: false,
            error: "تم تسجيل دفعة بنفس الرقم قبل قليل، حاول مرة أخرى",
          };
        }
        throw paymentError;
      }

      // ✅ 6) Now update expense counter + amount_paid (ADD, not overwrite)
      const newAmountPaid = alreadyPaid + paidAmount;

      const { error: bumpCounterError } = await supabase
        .from("project_expenses")
        .update({
          payment_counter: paymentNo + 1,
          amount_paid: newAmountPaid,
          status: newAmountPaid >= totalAmount ? "paid" : "partially_paid",
        })
        .eq("id", expense.id)
        .eq("payment_counter", paymentNo);

      if (bumpCounterError) throw bumpCounterError;

      // ✅ 7) percentage log
      const percentageAmount = paidAmount * rate;

      const { error: logError } = await supabase
        .from("project_percentage_logs")
        .insert({
          project_id: accountData.owner_id,
          expense_id: expense.id,
          payment_id: expensePayment.id,
          amount: percentageAmount,
          percentage: Number(pp.percentage ?? 0),
        });

      if (logError) throw logError;

      // ✅ 8) update account totals
      const accountTotal = paidAmount + percentageAmount;

      const { error: accountUpdateError } = await supabase
        .from("accounts")
        .update({
          balance: Number(accountData.balance) - accountTotal,
          total_expense: Number(accountData.total_expense) + paidAmount,
          total_percentage:
            Number(accountData.total_percentage) + percentageAmount,
        })
        .eq("id", accountData.id);

      if (accountUpdateError) throw accountUpdateError;

      // ✅ 9) update project_percentage totals (AMOUNTS)
      const { error: updatePPError } = await supabase
        .from("project_percentage")
        .update({
          total_percentage: Number(pp.total_percentage ?? 0) + percentageAmount,
          period_percentage:
            Number(pp.period_percentage ?? 0) + percentageAmount,
        })
        .eq("project_id", accountData.owner_id)
        .eq("currency", accountData.currency)
        .eq("type", accountData.type);

      if (updatePPError) throw updatePPError;

      //update project invoice counter
      const { error: updateProjectError } = await supabase
        .from("projects")
        .update({
          invoice_counter: Number(project.invoice_counter) + 1,
        })
        .eq("id", accountData.owner_id);

      if (updateProjectError) throw updateProjectError;

      void queryClient.invalidateQueries({ queryKey: ["finance"] });
      return { success: true, error: null, data: expensePayment };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: msg };
    } finally {
      setSubmitting(false);
    }
  };

  const editPayment = async (
    paymentId: string,
    form: ExpensePaymentFormValues,
  ) => {
    setSubmitting(true);

    try {
      if (!user?.id)
        return { success: false, error: "غير مصرح — المستخدم غير معروف" };
      if (!paymentId) return { success: false, error: "paymentId مطلوب" };
      if (!expense?.project_id)
        return { success: false, error: "معلومات المشروع غير متوفرة" };

      const newPaidAmount = Number(form.amount);
      if (!newPaidAmount || newPaidAmount <= 0)
        return { success: false, error: "المبلغ يجب أن يكون أكبر من صفر" };

      if (!form.currency) return { success: false, error: "العملة مطلوبة" };
      if (!form.account_id) return { success: false, error: "الحساب مطلوب" };

      // 1) fetch payment
      const { data: paymentData, error: paymentError } = await supabase
        .from("expense_payments")
        .select("id, expense_id, amount, account_id, payment_method")
        .eq("id", paymentId)
        .single();

      if (paymentError || !paymentData) {
        console.error("Error fetching payment data", paymentError);
        return { success: false, error: "لا يمكن جلب بيانات الدفعة" };
      }

      const oldPaidAmount = Number(paymentData.amount ?? 0);

      if (!paymentData.account_id) {
        return {
          success: false,
          error: "الحساب القديم غير مرتبط بالدفعة، لا يمكن التعديل",
        };
      }

      // 2) fetch expense
      const { data: expenseData, error: expenseError } = await supabase
        .from("project_expenses")
        .select("id, project_id, total_amount, amount_paid, currency")
        .eq("id", paymentData.expense_id)
        .single();

      if (expenseError || !expenseData) {
        console.error("Error fetching expense data", expenseError);
        return { success: false, error: "لا يمكن جلب بيانات المصروف" };
      }

      // ✅ enforce expense currency == payment currency (as you asked)
      if (expenseData.currency !== form.currency) {
        return {
          success: false,
          error: "عملة الدفعة يجب أن تطابق عملة المصروف",
        };
      }

      // 3) fetch old/new account
      const { data: oldAccountData, error: oldAccountError } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", paymentData.account_id)
        .single();

      if (oldAccountError || !oldAccountData) {
        console.error("Error fetching old account data", oldAccountError);
        return { success: false, error: "لا يمكن جلب بيانات الحساب القديم" };
      }

      const { data: newAccountData, error: newAccountError } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", form.account_id)
        .single();

      if (newAccountError || !newAccountData) {
        console.error("Error fetching new account data", newAccountError);
        return { success: false, error: "لا يمكن جلب بيانات الحساب الجديد" };
      }

      // 4) validate currency matches account
      if (newAccountData.currency !== form.currency) {
        return { success: false, error: "الحساب لا يطابق العملة المختارة" };
      }

      // 5) get OLD percentage from log (IMPORTANT) + its old percentage config (fallback)
      const { data: oldLog, error: oldLogError } = await supabase
        .from("project_percentage_logs")
        .select("id, amount, percentage, distributed")
        .eq("payment_id", paymentId)
        .maybeSingle();

      if (oldLog?.distributed) {
        return {
          success: false,
          error: "لا يمكن تعديل هذه الدفعة لأنها تم توزيع نسبتها بالفعل",
        };
      }

      if (oldLogError) {
        console.error("Error fetching old percentage log", oldLogError);
        return { success: false, error: "لا يمكن جلب سجل النسبة القديم" };
      }

      // OLD percentage amount: prefer log.amount because it’s the source of truth
      const oldPercentageAmount = oldLog ? Number(oldLog.amount ?? 0) : 0;

      // 6) get NEW percentage config (based on new account type/currency)
      const { data: newPP, error: newPPErr } = await supabase
        .from("project_percentage")
        .select("percentage, total_percentage, period_percentage")
        .eq("project_id", expenseData.project_id)
        .eq("currency", newAccountData.currency)
        .eq("type", newAccountData.type)
        .maybeSingle();

      if (newPPErr || !newPP) {
        console.error("Error fetching NEW project percentage", newPPErr);
        return {
          success: false,
          error: "لا يمكن جلب إعداد نسبة المشروع للحساب الجديد",
        };
      }

      const newRate = Number(newPP.percentage ?? 0) / 100;
      const newPercentageAmount = newPaidAmount * newRate;

      // 7) validate remaining amount rule
      const currentPaid = Number(expenseData.amount_paid ?? 0);
      const totalAmount = Number(expenseData.total_amount ?? 0);
      const newAmountPaid = currentPaid - oldPaidAmount + newPaidAmount;

      if (totalAmount > 0 && newAmountPaid > totalAmount) {
        return {
          success: false,
          error: `المبلغ أكبر من المتبقي. المتبقي للتعديل: ${totalAmount - (currentPaid - oldPaidAmount)}`,
        };
      }

      // 8) compute deltas for expense
      const amountDelta = newPaidAmount - oldPaidAmount;

      // 9) Update payment row (move to new account if changed)
      const { data: updatedPayment, error: updateError } = await supabase
        .from("expense_payments")
        .update({
          amount: newPaidAmount,
          payment_method: newAccountData.type, // keep in sync
          account_id: newAccountData.id,
        })
        .eq("id", paymentId)
        .select()
        .single();

      if (updateError || !updatedPayment) {
        console.error("Error updating payment", updateError);
        return { success: false, error: "لا يمكن تحديث بيانات الدفعة" };
      }

      // 10) Update expense amount_paid + status
      const { error: expenseUpdateError } = await supabase
        .from("project_expenses")
        .update({
          amount_paid: newAmountPaid,
          status:
            newAmountPaid >= totalAmount
              ? "paid"
              : newAmountPaid > 0
                ? "partially_paid"
                : "unpaid",
        })
        .eq("id", expenseData.id);

      if (expenseUpdateError) {
        console.error("Error updating expense", expenseUpdateError);
        throw expenseUpdateError;
      }

      // 11) Update/Create percentage log to NEW amount + NEW percent
      if (oldLog?.id) {
        const { error: logUpdateError } = await supabase
          .from("project_percentage_logs")
          .update({
            amount: newPercentageAmount,
            percentage: Number(newPP.percentage ?? 0),
          })
          .eq("id", oldLog.id);

        if (logUpdateError) {
          console.error("Error updating percentage log", logUpdateError);
          throw logUpdateError;
        }
      } else {
        const { error: logInsertError } = await supabase
          .from("project_percentage_logs")
          .insert({
            project_id: expenseData.project_id,
            expense_id: expenseData.id,
            payment_id: paymentId,
            amount: newPercentageAmount,
            percentage: Number(newPP.percentage ?? 0),
          });

        if (logInsertError) {
          console.error("Error inserting percentage log", logInsertError);
          throw logInsertError;
        }
      }

      // =========================
      // 12) ACCOUNTS + PROJECT_PERCENTAGE (support account change)
      // Undo old -> Apply new
      // =========================

      const oldTotal = oldPaidAmount + oldPercentageAmount;
      const newTotal = newPaidAmount + newPercentageAmount;

      const sameAccount = newAccountData.id === oldAccountData.id;

      if (sameAccount) {
        // ✅ same account: apply deltas
        const percentageDelta = newPercentageAmount - oldPercentageAmount;
        const totalDelta = amountDelta + percentageDelta;

        const { error: accountUpdateError } = await supabase
          .from("accounts")
          .update({
            balance: Number(oldAccountData.balance) - totalDelta,
            total_expense: Number(oldAccountData.total_expense) + amountDelta,
            total_percentage:
              Number(oldAccountData.total_percentage) + percentageDelta,
          })
          .eq("id", oldAccountData.id);

        if (accountUpdateError) {
          console.error("Error updating account", accountUpdateError);
          throw accountUpdateError;
        }

        // update PP totals for SAME bucket
        const { error: updatePPError } = await supabase
          .from("project_percentage")
          .update({
            total_percentage:
              Number(newPP.total_percentage ?? 0) +
              (newPercentageAmount - oldPercentageAmount),
            period_percentage:
              Number(newPP.period_percentage ?? 0) +
              (newPercentageAmount - oldPercentageAmount),
          })
          .eq("project_id", expenseData.project_id)
          .eq("currency", newAccountData.currency)
          .eq("type", newAccountData.type);

        if (updatePPError) {
          console.error("Error updating project percentage", updatePPError);
          throw updatePPError;
        }
      } else {
        // ✅ different account: UNDO old account, APPLY new account

        // 12.1 Undo old account (add back what was taken)
        const { error: undoOldAccErr } = await supabase
          .from("accounts")
          .update({
            balance: Number(oldAccountData.balance) + oldTotal,
            total_expense: Number(oldAccountData.total_expense) - oldPaidAmount,
            total_percentage:
              Number(oldAccountData.total_percentage) - oldPercentageAmount,
          })
          .eq("id", oldAccountData.id);

        if (undoOldAccErr) {
          console.error("Error undoing old account", undoOldAccErr);
          throw undoOldAccErr;
        }

        // 12.2 Apply new account (subtract new totals)
        const { error: applyNewAccErr } = await supabase
          .from("accounts")
          .update({
            balance: Number(newAccountData.balance) - newTotal,
            total_expense: Number(newAccountData.total_expense) + newPaidAmount,
            total_percentage:
              Number(newAccountData.total_percentage) + newPercentageAmount,
          })
          .eq("id", newAccountData.id);

        if (applyNewAccErr) {
          console.error("Error applying new account", applyNewAccErr);
          throw applyNewAccErr;
        }

        // 12.3 Update PP totals: subtract from old bucket, add to new bucket
        const { data: oldPP, error: oldPPErr } = await supabase
          .from("project_percentage")
          .select("total_percentage, period_percentage")
          .eq("project_id", expenseData.project_id)
          .eq("currency", oldAccountData.currency)
          .eq("type", oldAccountData.type)
          .maybeSingle();

        if (oldPPErr || !oldPP) {
          console.error("Error fetching OLD project percentage", oldPPErr);
          return {
            success: false,
            error: "لا يمكن جلب إعداد نسبة المشروع للحساب القديم",
          };
        }

        // subtract from old
        const { error: decOldPPErr } = await supabase
          .from("project_percentage")
          .update({
            total_percentage:
              Number(oldPP.total_percentage ?? 0) - oldPercentageAmount,
            period_percentage:
              Number(oldPP.period_percentage ?? 0) - oldPercentageAmount,
          })
          .eq("project_id", expenseData.project_id)
          .eq("currency", oldAccountData.currency)
          .eq("type", oldAccountData.type);

        if (decOldPPErr) {
          console.error(
            "Error decrementing old project percentage",
            decOldPPErr,
          );
          throw decOldPPErr;
        }

        // add to new
        const { error: incNewPPErr } = await supabase
          .from("project_percentage")
          .update({
            total_percentage:
              Number(newPP.total_percentage ?? 0) + newPercentageAmount,
            period_percentage:
              Number(newPP.period_percentage ?? 0) + newPercentageAmount,
          })
          .eq("project_id", expenseData.project_id)
          .eq("currency", newAccountData.currency)
          .eq("type", newAccountData.type);

        if (incNewPPErr) {
          console.error(
            "Error incrementing new project percentage",
            incNewPPErr,
          );
          throw incNewPPErr;
        }
      }

      void queryClient.invalidateQueries({ queryKey: ["finance"] });
      return { success: true, error: null, data: updatedPayment };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: msg };
    } finally {
      setSubmitting(false);
    }
  };

  const deletePayment = async (paymentId: string) => {
    setSubmitting(true);
    try {
      if (!user?.id) return { success: false, error: "غير مصرح" };
      if (!paymentId) return { success: false, error: "الدفعة غير متوفرة" };

      const { data: paymentData, error: paymentError } = await supabase
        .from("expense_payments")
        .select("*")
        .eq("id", paymentId)
        .single();

      if (paymentError || !paymentData) {
        console.error("Error fetching payment data", paymentError);
        return { success: false, error: "لا يمكن جلب بيانات الدفعة" };
      }

      if (!paymentData.account_id) {
        return {
          success: false,
          error: "الحساب غير مرتبط بهذه الدفعة، لا يمكن حذفها",
        };
      }

      // fetch the log and see if its distrbuted
      const { data: logData, error: logError } = await supabase
        .from("project_percentage_logs")
        .select("*")
        .eq("payment_id", paymentId)
        .maybeSingle();

      if (logError) {
        console.error("Error fetching percentage log", logError);
        return { success: false, error: "لا يمكن جلب بيانات النسبة" };
      }

      if (logData?.distributed) {
        return {
          success: false,
          error: "لا يمكن حذف هذه الدفعة لأنها تم توزيع نسبتها بالفعل",
        };
      }

      //fetch the expense to get project_id
      const { data: expenseData, error: expenseError } = await supabase
        .from("project_expenses")
        .select("*")
        .eq("id", paymentData.expense_id)
        .single();

      if (expenseError || !expenseData) {
        console.error("Error fetching expense data", expenseError);
        return { success: false, error: "لا يمكن جلب بيانات المصروف" };
      }

      // fetch the account
      const { data: accountData, error: accountError } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", paymentData.account_id)
        .single();

      if (accountError || !accountData) {
        console.error("Error fetching account data", accountError);
        return { success: false, error: "لا يمكن جلب بيانات الحساب" };
      }

      // fetch the project percentage
      const { data: ppData, error: ppError } = await supabase
        .from("project_percentage")
        .select("*")
        .eq("project_id", accountData.owner_id)
        .eq("currency", accountData.currency)
        .eq("type", accountData.type)
        .maybeSingle();

      if (ppError || !ppData) {
        console.error("Error fetching project percentage data", ppError);
        return { success: false, error: "لا يمكن جلب بيانات نسبة المشروع" };
      }

      //update the expense: subtract the amount of the payment
      const { error: expenseUpdateError } = await supabase
        .from("project_expenses")
        .update({
          amount_paid:
            Number(expenseData.amount_paid ?? 0) - Number(paymentData.amount),
          status:
            Number(expenseData.amount_paid ?? 0) - Number(paymentData.amount) <=
            0
              ? "unpaid"
              : "partially_paid",
        })
        .eq("id", expenseData.id);

      if (expenseUpdateError) {
        console.error("Error updating expense", expenseUpdateError);
        throw expenseUpdateError;
      }

      // update account: add back the amount + percentage
      const totalToRefund =
        Number(paymentData.amount) + Number(logData?.amount ?? 0);
      const percentageToRefund = Number(logData?.amount ?? 0);

      const { error: accountUpdateError } = await supabase
        .from("accounts")
        .update({
          balance: Number(accountData.balance) + totalToRefund,
          total_expense:
            Number(accountData.total_expense) - Number(paymentData.amount),
          total_percentage:
            Number(accountData.total_percentage) - percentageToRefund,
        })
        .eq("id", accountData.id);

      if (accountUpdateError) {
        console.error("Error updating account", accountUpdateError);
        throw accountUpdateError;
      }

      // update project percentage: subtract the percentage amount
      const { error: ppUpdateError } = await supabase
        .from("project_percentage")
        .update({
          total_percentage:
            Number(ppData.total_percentage ?? 0) - percentageToRefund,
          period_percentage:
            Number(ppData.period_percentage ?? 0) - percentageToRefund,
        })
        .eq("id", ppData.id);

      if (ppUpdateError) {
        console.error("Error updating project percentage", ppUpdateError);
        throw ppUpdateError;
      }

      // delete the log
      if (logData?.id) {
        const { error: logDeleteError } = await supabase
          .from("project_percentage_logs")
          .delete()
          .eq("id", logData.id);

        if (logDeleteError) {
          console.error("Error deleting percentage log", logDeleteError);
          throw logDeleteError;
        }
      }

      // delete the payment
      const { error: deleteError } = await supabase
        .from("expense_payments")
        .delete()
        .eq("id", paymentId);

      if (deleteError) {
        console.error("Error deleting payment", deleteError);
        throw deleteError;
      }

      // refresh local state بدون reload
      queryClient.setQueryData<ExpensePaymentsData>(
        expensePaymentsKey(expenseId),
        (prev) =>
          prev
            ? {
                ...prev,
                payment: prev.payment.filter((p) => p.id !== paymentId),
              }
            : prev,
      );
      // amount_paid / account totals changed server-side too
      void queryClient.invalidateQueries({ queryKey: ["finance"] });

      return { success: true, error: null };
    } finally {
      setSubmitting(false);
    }
  };

  return {
    payment,
    expense,
    accounts,
    loading,
    error,
    submitting,
    addPayment,
    editPayment,
    deletePayment,
  };
}
