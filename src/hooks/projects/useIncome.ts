import { PostgrestError } from "@supabase/supabase-js";
import { useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { TIERS } from "../../lib/queryClient";
import { useAuth } from "../useAuth";
import { ProjectIncomeFormValues } from "../../types/schema/ProjectBook.schema";
import { supabase } from "../../lib/supabaseClient";
import { ProjectWithIncome } from "../../types/projects.type";

export const projectIncomeKey = (projectId: string) =>
  ["projects", "income", projectId] as const;

export const projectIncomeQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: projectIncomeKey(projectId),
    queryFn: async (): Promise<ProjectWithIncome> => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, project_incomes(*)")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
    ...TIERS.C,
  });

export function useIncome(projectId: string) {
  const queryClient = useQueryClient();
  const query = useQuery(projectIncomeQueryOptions(projectId));
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<PostgrestError | null>(
    null,
  );
  const { user } = useAuth();

  // Balances and the book view moved server-side as well as the row list.
  const refreshProjectMoney = () => {
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["projects-list"] });
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
        .select("income_counter")
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
        queryClient.setQueryData<ProjectWithIncome>(
          projectIncomeKey(projectId),
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
          invoice_counter: (projectRow?.income_counter || 0) + 1,
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
      refreshProjectMoney();
    }
  };

  const deleteIncome = async (projectId: string, incomeId: string) => {
    try {
      setMutating(true);
      setMutationError(null);

      if (!user?.id) throw new Error("User not authenticated");
      if (!projectId) throw new Error("projectId is required");
      if (!incomeId) throw new Error("incomeId is required");

      // 1) fetch income row (to know amount/currency/payment_method)
      const { data: incomeRow, error: incomeFetchError } = await supabase
        .from("project_incomes")
        .select("id, project_id, amount, currency, payment_method")
        .eq("id", incomeId)
        .eq("project_id", projectId)
        .single();

      if (incomeFetchError) {
        console.error("Error fetching income before delete", incomeFetchError);
        throw incomeFetchError;
      }

      const incomeAmount = Number(incomeRow.amount || 0);
      const incomeCurrency = incomeRow.currency;
      const incomePaymentMethod = incomeRow.payment_method; // "cash" | "bank" (حسب جدولك)

      if (!incomeCurrency) {
        throw new Error("Income currency is required for deletion");
      }

      if (!incomePaymentMethod) {
        throw new Error("Income payment method is required for deletion");
      }

      // 2) delete income
      const { error: deleteError } = await supabase
        .from("project_incomes")
        .delete()
        .eq("id", incomeId);

      if (deleteError) {
        console.error("Error deleting income", deleteError);
        throw deleteError;
      }

      // 3) update local state
      queryClient.setQueryData<ProjectWithIncome>(
        projectIncomeKey(projectId),
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            project_incomes: (prev.project_incomes || []).filter(
              (i) => i.id !== incomeId,
            ),
          };
        },
      );

      // 4) update account balance & total_transactions (subtract income)
      const { data: accountData, error: accountError } = await supabase
        .from("accounts")
        .select("id, balance, total_transactions")
        .eq("owner_id", projectId)
        .eq("currency", incomeCurrency)
        .eq("type", incomePaymentMethod) // cash/bank
        .eq("owner_type", "project")
        .single();

      if (accountError) {
        console.error("Error fetching account for income delete", accountError);
        throw accountError;
      }

      const { error: accountUpdateError } = await supabase
        .from("accounts")
        .update({
          balance: Number(accountData.balance || 0) - incomeAmount,
          total_transactions:
            Number(accountData.total_transactions || 0) - incomeAmount,
        })
        .eq("id", accountData.id);

      if (accountUpdateError) {
        console.error(
          "Error updating account after income delete",
          accountUpdateError,
        );
        throw accountUpdateError;
      }

      // 5) update project balance (subtract income)
      const { data: projectBalanceData, error: projectBalanceError } =
        await supabase
          .from("project_balances")
          .select("id, balance, total_transactions")
          .eq("project_id", projectId)
          .eq("currency", incomeCurrency)
          .single();

      if (projectBalanceError) {
        console.error(
          "Error fetching project balance for income delete",
          projectBalanceError,
        );
        throw projectBalanceError;
      }

      const { error: projectBalanceUpdateError } = await supabase
        .from("project_balances")
        .update({
          balance: Number(projectBalanceData.balance || 0) - incomeAmount,
          total_transactions:
            Number(projectBalanceData.total_transactions || 0) - incomeAmount,
        })
        .eq("id", projectBalanceData.id);

      if (projectBalanceUpdateError) {
        console.error(
          "Error updating project balance after income delete",
          projectBalanceUpdateError,
        );
        throw projectBalanceUpdateError;
      }

      return { data: incomeRow, error: null };
    } catch (err) {
      console.error("Error in deleteIncome", err);
      const error = err as PostgrestError;
      setMutationError(error);
      return { data: null, error };
    } finally {
      setMutating(false);
      refreshProjectMoney();
    }
  };

  return {
    project: query.data ?? null,
    loading: query.isPending || mutating,
    error: mutationError ?? (query.error as PostgrestError | null),
    addIncome,
    deleteIncome,
  };
}
