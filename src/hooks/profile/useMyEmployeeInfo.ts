import { useCallback } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import { useAuthUserId } from "../../lib/authUser";

export interface MyEmployeeInfo {
  id: string;
  address: string | null;
  gender: string | null;
  nationality: string | null;
  blood_type: string | null;
  alternate_phone: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
}

export type MyEmployeeInfoUpdate = Partial<Omit<MyEmployeeInfo, "id">>;

async function fetchInfo(userId: string): Promise<MyEmployeeInfo | null> {
  const { data, error } = await supabase
    .from("employees")
    .select(
      "id, address, gender, nationality, blood_type, alternate_phone, bank_name, bank_account_number",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("Error fetching employee info:", error);
    throw error;
  }
  return data;
}

// Keyed by user id so another account on this device never sees it.
export const myEmployeeInfoQueryOptions = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["profile", userId, "employee-info"],
    queryFn: () => fetchInfo(userId as string),
    enabled: !!userId,
  });

/**
 * Not every logged-in `users` row has a matching `employees` row (e.g. a
 * lightweight admin/service account), so this fetches with maybeSingle and
 * returns null rather than erroring when there's no employee record.
 */
export function useMyEmployeeInfo(userId: string | undefined) {
  // The stored session knows the id on the first render; the caller's
  // user object can arrive later.
  const { userId: authUserId } = useAuthUserId();
  const id = userId ?? authUserId ?? undefined;
  const query = useQuery(myEmployeeInfoQueryOptions(id));
  const { refetch: refetchQuery } = query;

  const refetch = useCallback(async () => {
    if (!id) return;
    await refetchQuery();
  }, [id, refetchQuery]);

  const updateInfo = useCallback(
    async (updates: MyEmployeeInfoUpdate) => {
      if (!id) return { error: new Error("لا يوجد مستخدم") };

      const { error: updateError } = await supabase
        .from("employees")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (updateError) {
        console.error("Error updating employee info:", updateError);
        return { error: updateError };
      }

      await refetch();
      return { error: null };
    },
    [id, refetch],
  );

  return {
    info: query.data ?? null,
    // Was false while there was no user to fetch for.
    loading: !!id && query.isPending,
    error: query.error as PostgrestError | null,
    refetch,
    updateInfo,
  };
}
