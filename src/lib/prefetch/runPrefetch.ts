import type { QueryClient } from "@tanstack/react-query";
import { myPermissionsQueryOptions } from "../../hooks/permissions/useCan";
import { projectsListQueryOptions } from "../../hooks/useProjects";
import { projectOverviewQueryOptions } from "../../hooks/projects/useProjectOverview";
import { prefetchAppCatalogs } from "../prefetchCatalogs";
import { isAllowed, PREFETCH_REGISTRY } from "./registry";

// =====================================================================
// Warm every tab the user may open, in the background, after login.
//
// prefetchQuery is a no-op for anything still fresh in the cache, so a
// relaunch with a recent on-disk cache costs almost nothing; a stale or
// missing entry is fetched and lands in the cache (and on disk) without
// any screen having to be open.
//
// Requests run through a small pool so the screen the user is actually
// looking at is never stuck behind a burst of background work.
// =====================================================================

const POOL_SIZE = 3;
const PROJECT_POOL_SIZE = 2;

async function runPool(
  tasks: Array<() => Promise<unknown>>,
  size: number,
  isCancelled: () => boolean,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length && !isCancelled()) {
      const task = tasks[next++];
      try {
        await task();
      } catch {
        // A failed prefetch just means the screen loads on first open.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, worker));
}

export async function runPrefetch(
  qc: QueryClient,
  userId: string,
  isCancelled: () => boolean,
): Promise<void> {
  void prefetchAppCatalogs(qc);

  let granted: Set<string>;
  try {
    granted = new Set(await qc.fetchQuery(myPermissionsQueryOptions(userId)));
  } catch {
    return; // no session attached / offline: nothing to decide with
  }
  if (isCancelled()) return;

  // Wave 1 — every permitted list / overview tab.
  const entries = PREFETCH_REGISTRY.filter((e) => isAllowed(e, granted));
  await runPool(
    entries.map((e) => () => qc.prefetchQuery(e.options())),
    POOL_SIZE,
    isCancelled,
  );
  if (isCancelled()) return;

  // Wave 2 — the overview page of every project.
  if (!granted.has("view_projects")) return;
  const projects = qc.getQueryData(projectsListQueryOptions().queryKey) ?? [];
  await runPool(
    projects
      .map((p) => p.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .map((id) => () => qc.prefetchQuery(projectOverviewQueryOptions(id))),
    PROJECT_POOL_SIZE,
    isCancelled,
  );
}
