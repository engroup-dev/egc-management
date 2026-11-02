// hooks/useBanks.ts
import { useCallback, useMemo, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { Bank } from "../types/global.type";
import { normalizeError } from "./useMaps";

const BANKS_KEY = ["banks"] as const;

const DUPLICATE_BANK_NAME_MESSAGE = "يوجد بنك بهذا الاسم بالفعل";

// Postgres unique_violation — the DB-level fallback in case the client-side
// pre-check races with another insert/update (name is now UNIQUE in the DB).
function isUniqueViolation(e: unknown) {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "23505"
  );
}

async function fetchBanks(): Promise<Bank[]> {
  const { data, error } = await supabase
    .schema("lookups")
    .from("banks")
    .select("id,name,created_at")
    .order("name", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Bank[];
}

// Exported for the background prefetcher (src/lib/prefetch).
export const banksQueryOptions = () =>
  queryOptions({ queryKey: BANKS_KEY, queryFn: fetchBanks });

export function useBanks() {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<
    { message: string } | null
  >(null);

  const {
    data: banks = [],
    isPending: loading,
    error: fetchError,
    refetch: refetchBase,
  } = useQuery(banksQueryOptions());

  const error =
    mutationError ??
    (fetchError ? { message: normalizeError(fetchError, "فشل في تحميل البنوك") } : null);

  const refetch = useCallback(async () => {
    await refetchBase();
  }, [refetchBase]);

  const isDuplicateName = useCallback(
    (name: string, excludeId?: string) =>
      banks.some(
        (b) =>
          b.id !== excludeId &&
          b.name.trim().toLowerCase() === name.toLowerCase(),
      ),
    [banks],
  );

  const addNew = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("الاسم مطلوب");

      if (isDuplicateName(trimmed)) {
        setMutationError({ message: DUPLICATE_BANK_NAME_MESSAGE });
        throw new Error(DUPLICATE_BANK_NAME_MESSAGE);
      }

      try {
        setMutationError(null);

        const { data, error } = await supabase
          .schema("lookups")
          .from("banks")
          .insert([{ name: trimmed }])
          .select("id,name,created_at")
          .single();

        if (error) throw error;

        const row = data as Bank;

        queryClient.setQueryData<Bank[]>(BANKS_KEY, (prev) =>
          prev ? [row, ...prev] : [row],
        );
        return row;
      } catch (e: unknown) {
        const msg = isUniqueViolation(e)
          ? DUPLICATE_BANK_NAME_MESSAGE
          : normalizeError(e, "فشل في إضافة بنك");
        setMutationError({ message: msg });
        throw new Error(msg);
      }
    },
    [isDuplicateName, queryClient],
  );

  const edit = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("الاسم مطلوب");

      if (isDuplicateName(trimmed, id)) {
        setMutationError({ message: DUPLICATE_BANK_NAME_MESSAGE });
        throw new Error(DUPLICATE_BANK_NAME_MESSAGE);
      }

      try {
        setMutationError(null);

        const { error } = await supabase
          .schema("lookups")
          .from("banks")
          .update({ name: trimmed })
          .eq("id", id);

        if (error) throw error;

        queryClient.setQueryData<Bank[]>(BANKS_KEY, (prev) =>
          prev
            ? prev.map((b) => (b.id === id ? { ...b, name: trimmed } : b))
            : prev,
        );
      } catch (e: unknown) {
        const msg = isUniqueViolation(e)
          ? DUPLICATE_BANK_NAME_MESSAGE
          : normalizeError(e, "فشل في تعديل البنك");
        setMutationError({ message: msg });
        throw new Error(msg);
      }
    },
    [isDuplicateName, queryClient],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        setMutationError(null);

        const { error } = await supabase
          .schema("lookups")
          .from("banks")
          .delete()
          .eq("id", id);

        if (error) throw error;

        queryClient.setQueryData<Bank[]>(BANKS_KEY, (prev) =>
          prev ? prev.filter((b) => b.id !== id) : prev,
        );
      } catch (e: unknown) {
        const msg = normalizeError(e, "فشل في حذف البنك");
        setMutationError({ message: msg });
        throw new Error(msg);
      }
    },
    [queryClient],
  );

  return useMemo(
    () => ({
      banks,
      loading,
      error,
      refetch,
      addNew,
      edit,
      remove,
    }),
    [banks, loading, error, refetch, addNew, edit, remove],
  );
}
