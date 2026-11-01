import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { PayrollWithRelations } from "../types/extended.type";

const PAYROLL_KEY = ["payroll"] as const;

async function fetchPayroll(): Promise<PayrollWithRelations[]> {
  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("id");
  if (employeesError) throw employeesError;

  const { data: payrollData, error: payrollError } = await supabase
    .from("payroll")
    .select(`*, employees(first_name, last_name)`)
    .in("employee_id", employees?.map((emp) => emp.id) || []);
  if (payrollError) throw payrollError;

  return (payrollData ?? []) as PayrollWithRelations[];
}

export function usePayroll() {
  const queryClient = useQueryClient();
  const {
    data: payroll = [],
    isPending: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: PAYROLL_KEY,
    queryFn: fetchPayroll,
  });

  const markAsPaid = async (
    payrollIds: string[],
  ): Promise<{ success: boolean; error?: string }> => {
    if (payrollIds.length === 0) return { success: true };

    try {
      const { data: existing, error: fetchError } = await supabase
        .from("payroll")
        .select("id, status")
        .in("id", payrollIds);

      if (fetchError) throw fetchError;

      const alreadyPaidIds =
        existing?.filter((p) => p.status === "paid").map((p) => p.id) ?? [];
      const idsToUpdate = payrollIds.filter(
        (id) => !alreadyPaidIds.includes(id),
      );

      if (alreadyPaidIds.length > 0) {
        return {
          success: false,
          error: `${alreadyPaidIds.length} من الرواتب المحددة مدفوعة بالفعل`,
        };
      }

      if (idsToUpdate.length === 0) return { success: true };

      const { error } = await supabase
        .from("payroll")
        .update({ status: "paid" })
        .in("id", idsToUpdate);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: PAYROLL_KEY });

      return { success: true };
    } catch (err) {
      console.error("markAsPaid error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "حدث خطأ غير متوقع",
      };
    }
  };

  return {
    payroll,
    loading,
    error: (error as PostgrestError | null) ?? null,
    markAsPaid,
    refetch,
  };
}
