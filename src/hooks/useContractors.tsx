import { queryOptions, useQuery } from "@tanstack/react-query";
import { Contractors } from "../types/global.type";
import { contractorWithSpecializations } from "../types/extended.type";
import { supabase } from "../lib/supabaseClient";
import { PostgrestError } from "@supabase/supabase-js";

const fetchContractors = async (): Promise<
  contractorWithSpecializations[]
> => {
  const { data, error } = await supabase
    .from("contractors")
    .select(
      `
      *,
      contractor_specialities (
        speciality_id,
        speciality:specialities (
          id,
          name
        )
      )
    `,
    )
    .neq("status", "merged");

  if (error) throw new Error(error.message);

  return (data ?? []) as unknown as contractorWithSpecializations[];
};

// Exported for the background prefetcher (src/lib/prefetch).
export const contractorsQueryOptions = () =>
  queryOptions({ queryKey: ["contractors"], queryFn: fetchContractors });

export const useContractorsQuery = () => useQuery(contractorsQueryOptions());

export function useContractors() {
  const { data = [], isPending: loading, error } = useContractorsQuery();
  return {
    contractors: data,
    loading,
    error: (error as PostgrestError | null) ?? null,
  };
}

async function fetchContractorsNoUser(): Promise<Contractors[]> {
  const { data, error } = await supabase
    .from("contractors")
    .select("*")
    .is("user_id", null)
    .neq("status", "merged");
  if (error) throw error;
  return data ?? [];
}

export function useContractorsNoUser() {
  const {
    data = [],
    isPending: loading,
    error,
  } = useQuery({
    queryKey: ["contractors-no-user"],
    queryFn: fetchContractorsNoUser,
  });
  return {
    contractors: data,
    loading,
    error: (error as PostgrestError | null) ?? null,
  };
}
