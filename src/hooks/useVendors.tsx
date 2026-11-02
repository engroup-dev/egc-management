import { queryOptions, useQuery } from "@tanstack/react-query";
import { Vendor } from "../types/global.type";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { VendorsWithSpecializations } from "../types/extended.type";

const fetchVendorsList = async (): Promise<VendorsWithSpecializations[]> => {
  const { data, error } = await supabase
    .from("vendors")
    .select(
      `
      *,
      vendor_specialities (
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

  return (data ?? []) as unknown as VendorsWithSpecializations[];
};

// Exported for the background prefetcher (src/lib/prefetch).
export const vendorsQueryOptions = () =>
  queryOptions({ queryKey: ["vendors"], queryFn: fetchVendorsList });

export const useVendorsQuery = () => useQuery(vendorsQueryOptions());

export function useVendors() {
  const { data = [], isPending: loading, error } = useVendorsQuery();
  return {
    vendors: data,
    loading,
    error: (error as PostgrestError | null) ?? null,
  };
}

async function fetchVendorsNoUser(): Promise<Vendor[]> {
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .is("user_id", null);
  if (error) throw error;
  return data ?? [];
}

export function useVendorsNoUser() {
  const {
    data = [],
    isPending: loading,
    error,
  } = useQuery({
    queryKey: ["vendors-no-user"],
    queryFn: fetchVendorsNoUser,
  });
  return {
    vendors: data,
    loading,
    error: (error as PostgrestError | null) ?? null,
  };
}
