import { useCallback } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import { useAuthUserId } from "../../lib/authUser";

export interface MyProfile {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string;
  phone: string | null;
  dob: string | null;
  status: "active" | "inactive" | "on leave" | "on holiday";
}

export type MyProfileUpdate = Partial<
  Pick<MyProfile, "first_name" | "last_name" | "phone" | "dob">
>;

async function fetchProfile(userId: string): Promise<MyProfile> {
  const { data, error } = await supabase
    .from("users")
    .select("id, first_name, last_name, email, phone, dob, status")
    .eq("id", userId)
    .single();
  if (error) {
    console.error("Error fetching profile:", error);
    throw error;
  }
  return data;
}

// Keyed by user id so another account on this device never sees it.
export const myProfileQueryOptions = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["profile", userId, "me"],
    queryFn: () => fetchProfile(userId as string),
    enabled: !!userId,
  });

export function useMyProfile(userId: string | undefined) {
  // The stored session knows the id on the first render; the caller's
  // user object can arrive later.
  const { userId: authUserId } = useAuthUserId();
  const id = userId ?? authUserId ?? undefined;
  const query = useQuery(myProfileQueryOptions(id));
  const { refetch: refetchQuery } = query;

  const refetch = useCallback(async () => {
    if (!id) return;
    await refetchQuery();
  }, [id, refetchQuery]);

  const updateProfile = useCallback(
    async (updates: MyProfileUpdate) => {
      if (!id) return { error: new Error("لا يوجد مستخدم") };

      const { error: updateError } = await supabase
        .from("users")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (updateError) {
        console.error("Error updating profile:", updateError);
        return { error: updateError };
      }

      await refetch();
      return { error: null };
    },
    [id, refetch],
  );

  return {
    profile: query.data ?? null,
    // Was false while there was no user to fetch for.
    loading: !!id && query.isPending,
    error: query.error as PostgrestError | null,
    refetch,
    updateProfile,
  };
}
