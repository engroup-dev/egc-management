import { QueryClient } from "@tanstack/react-query";

// Freshness tiers used across hooks. One place changes the whole app.
//
// A — catalogs that barely change (map_types, roles, departments, …)
// B — per-entity data edited across the day (projects, drawings, team, …)
// C — money reads, kept explicitly 0 so a stale balance never shows
// D — realtime-backed queries; a channel invalidates them, local staleness is 0
// E — per-user tiny caches (effective permissions, task caps)
//
// Default is tier B. gcTime is 24h across the board (except money/realtime)
// so a long session doesn't drop cached entries between visits — the on-disk
// persister already preserves them across restarts, memory should match.
export const TIERS = {
  A: { staleTime: 60 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000 },
  B: { staleTime: 5 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000 },
  C: { staleTime: 0, gcTime: 30 * 1000 },
  D: { staleTime: 0, gcTime: 30 * 1000 },
  E: { staleTime: 5 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000 },
} as const;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: TIERS.B.staleTime,
        gcTime: TIERS.B.gcTime,
        // Pages that have been loaded this session (or hydrated from disk on
        // relaunch) never refetch on remount. Mutations still invalidate
        // their own data, and realtime channels invalidate what they cover.
        // Everything else serves from cache until the user explicitly
        // refreshes or quits the app.
        refetchOnMount: false,
        refetchOnWindowFocus: false,
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
