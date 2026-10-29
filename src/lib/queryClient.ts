import { QueryClient } from "@tanstack/react-query";

// Freshness tiers used across hooks. One place changes the whole app.
//
// A — catalogs that barely change (map_types, roles, departments, …)
// B — per-entity data edited across the day (projects, drawings, team, …)
// C — money reads, kept explicitly 0 so a stale balance never shows
// D — realtime-backed queries; a channel invalidates them, local staleness is 0
// E — per-user tiny caches (effective permissions, task caps)
export const TIERS = {
  A: { staleTime: 60 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000 },
  B: { staleTime: 60 * 1000, gcTime: 10 * 60 * 1000 },
  C: { staleTime: 0, gcTime: 30 * 1000 },
  D: { staleTime: 0, gcTime: 30 * 1000 },
  E: { staleTime: 30 * 1000, gcTime: 10 * 60 * 1000 },
} as const;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: TIERS.B.staleTime,
        gcTime: TIERS.B.gcTime,
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
