import { MutationCache, QueryClient } from "@tanstack/react-query";
import { emitTaskError } from "../hooks/tasks/taskErrorBus";
import { extractErrorMessage } from "../hooks/tasks/extractErrorMessage";

// =====================================================================
// Freshness model: stale-while-revalidate everywhere.
//
// Anything cached — in memory or restored from disk — is shown
// immediately, with no spinner. When it is older than its tier's
// staleTime, mounting the screen (or refocusing the window) refetches it
// quietly in the background and swaps the new data in. A spinner only
// ever appears for data this device has never loaded.
//
// A — catalogs that barely change (map_types, roles, departments, …)
// B — the default: per-entity data edited across the day
// C — money reads: always revalidated on view, but still shown from
//     cache while that happens (screens show an "updating" mark)
// D — realtime-backed / fast-moving: same as C
// E — per-user tiny caches (effective permissions, task caps)
//
// gcTime is 7 days for every tier so nothing is dropped between visits
// and everything can be written to disk (PERSIST_MAX_AGE matches it).
// =====================================================================

const WEEK = 7 * 24 * 60 * 60 * 1000;

export const TIERS = {
  A: { staleTime: 60 * 60 * 1000, gcTime: WEEK },
  B: { staleTime: 2 * 60 * 1000, gcTime: WEEK },
  C: { staleTime: 0, gcTime: WEEK },
  D: { staleTime: 0, gcTime: WEEK },
  E: { staleTime: 2 * 60 * 1000, gcTime: WEEK },
} as const;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    // A failed mutation in the Tasks module used to fail silently, so
    // that module had its own QueryClient whose MutationCache toasted
    // every error. That second client also kept every task screen out of
    // the persisted cache. The hook lives here now: emitTaskError is a
    // no-op unless <TaskErrorToast/> (mounted only by TasksLayout) is
    // listening, so other screens are unaffected.
    mutationCache: new MutationCache({
      onError: (error) => emitTaskError(extractErrorMessage(error)),
    }),
    defaultOptions: {
      queries: {
        staleTime: TIERS.B.staleTime,
        gcTime: TIERS.B.gcTime,
        // Refetch on mount / focus ONLY when stale. Cached data stays on
        // screen while that happens, so this never shows a spinner.
        refetchOnMount: true,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 2,
        networkMode: "online",
      },
      mutations: {
        retry: 0,
        networkMode: "online",
      },
    },
  });
}
