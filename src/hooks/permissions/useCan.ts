import { queryOptions, useQuery } from "@tanstack/react-query";
import { permissionsDb } from "../../lib/permissionsDb";
import { supabase } from "../../lib/supabaseClient";
import { TIERS } from "../../lib/queryClient";
import { useAuthUserId } from "../../lib/authUser";
import type { EffectivePermissionRow } from "../../types/permissions.types";

// =====================================================================
// PHASE 7B — the desktop app's one gating hook
// =====================================================================
// Everything else in src/hooks/permissions/ is admin-screen plumbing:
// read-only, display-only, and it takes a user id because it exists to
// show you someone ELSE's permissions. This file is the opposite. It
// answers "what may *I* do", it drives real UI, and no caller can ask
// on another person's behalf — my_effective_permissions() reads
// auth.uid() itself and ignores anything we might pass.
//
// ONE CALL, NOT N. Batches 4 and 5 gate dozens of menu items on the
// same page. useCan() does not fetch; it reads the single cached answer
// that useMyPermissions() holds, so twenty gated items on one screen
// still cost one round trip. React Query dedupes concurrent callers of
// the same key, so this holds even on first paint.
//
// DENY WHILE LOADING, DENY ON ERROR. A permission that has not been
// resolved yet is not a grant, and neither is a failed request. Callers
// that would flash a "you cannot do this" message should read `loading`
// and render a neutral state instead of the denial — see EmployeeRole.
//
// PROJECT SCOPE. Pass a projectId for project-scoped permissions.
// Without one the resolver returns allowed = false with source_layer
// 'no_project_context' for every project-scoped permission
// (phase2-resolver.sql, DECISION 3). That is correct, but it means a
// project permission asked company-wide always denies. Check
// permission_catalog.is_project_scoped if you are unsure which you have.
// =====================================================================

// ---------------------------------------------------------------------
// ISSUE 13 — the cache must be keyed by WHO IS ASKING
// ---------------------------------------------------------------------
// The first version of this file cached under ["my-effective-permissions",
// projectId]. The answer depends entirely on auth.uid(), and the key did
// not mention it. Two bugs came out of that one omission.
//
// TOO LITTLE. On a cold start the query could fire before the Supabase
// session had attached. auth.uid() was null, the resolver denied
// everything — correctly — and that empty set was then cached as the
// answer for thirty seconds. The user saw an app with no menu and no
// error. This is what made a Head Finance account that resolves five
// permissions in the database look like it had none.
//
// TOO MUCH, which is the serious half. Log out, log in as somebody else
// in the same window, and the new user reads the previous user's cached
// set. Menus render from it and route guards let them through. An
// access-control answer for one person was being served to another.
//
// Both are fixed here by the same three changes:
//
//   1. The auth user id is part of the query key, so two people can
//      never collide on one cache entry.
//   2. `enabled` holds the query until a session exists, so we never
//      cache an answer computed for auth.uid() = null.
//   3. "No session yet" reports as LOADING, not as denied. Callers
//      already render neutral while loading, so nothing flashes.
//
// The fourth change lives elsewhere: AuthProvider clears the whole query
// cache when the signed-in user changes. Keying alone would be enough
// for this hook, but every other cached query — employees, projects,
// payroll — has the same exposure and none of them are keyed by user
// either.
// ---------------------------------------------------------------------

// The signed-in user id now lives in one shared store (src/lib/authUser.ts),
// read synchronously from the stored session so it is known on the first
// render. Re-exported here so every existing import keeps working.
export { useAuthUserId } from "../../lib/authUser";

function toPermissionSet(names: string[]): Set<string> {
  return new Set(names);
}

export const myPermissionsKey = (userId: string | null, projectId?: string) => [
  "my-effective-permissions",
  userId ?? "anonymous",
  projectId ?? "company",
];

/**
 * The query behind useMyPermissions, exported so the background
 * prefetcher can read the same cached answer to decide what to warm.
 *
 * The cached value is a plain string[]; useMyPermissions turns it into a
 * Set with a stable module-level `select`, so the Set is only rebuilt
 * when the array actually changes.
 */
export const myPermissionsQueryOptions = (
  userId: string | null,
  projectId?: string,
) =>
  queryOptions<string[]>({
    queryKey: myPermissionsKey(userId, projectId),
    ...TIERS.E,
    queryFn: async () => {
      // Never cache an answer computed for the wrong caller. The id in
      // the key comes from the stored session; if supabase-js could not
      // attach that session (expired and offline, or signed out
      // underneath us) the resolver would see auth.uid() = null and deny
      // everything. Fail instead, so React Query retries and the
      // previously cached answer stays on screen.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!userId || sessionData.session?.user?.id !== userId) {
        throw new Error("session not attached yet");
      }
      const { data, error } = await permissionsDb.rpc(
        "my_effective_permissions",
        projectId ? { p_project_id: projectId } : {},
      );
      if (error) throw error;
      return ((data ?? []) as EffectivePermissionRow[])
        .filter((row) => row.allowed)
        .map((row) => row.permission_name);
    },
  });

export interface MyPermissionsResult {
  /** Allowed permission names. Undefined until answered. */
  data: Set<string> | undefined;
  /** True while loading, and while the session is still being read. */
  isPending: boolean;
  /** The resolver could not be reached. */
  isError: boolean;
}

/**
 * Every permission the current user has, as a set of allowed names.
 *
 * Cached per user and per project id. `staleTime` is deliberately short
 * rather than zero: a grant changed on an admin screen should show up on
 * the next navigation, not require a reload, but a page with twenty
 * gated items must not refetch twenty times while it mounts.
 */
export function useMyPermissions(projectId?: string): MyPermissionsResult {
  const { userId, resolved } = useAuthUserId();

  const query = useQuery({
    ...myPermissionsQueryOptions(userId, projectId),
    enabled: !!userId,
    select: toPermissionSet,
  });

  return {
    // Never hand back another key's data: with `enabled` false React
    // Query reports data as undefined anyway, but being explicit here
    // means a future change to `enabled` cannot leak.
    data: userId ? query.data : undefined,
    // A disabled query sits in `pending` forever, which is the right
    // answer while the session is still being read and the wrong one
    // once we know there is no session. Signed out is not "still
    // loading" — it is a settled deny.
    isPending: !resolved || (!!userId && query.isPending),
    // A failed background refetch must not take away an answer we
    // already have: keep serving the cached set and only report an
    // error when there is nothing to fall back on.
    isError: query.isError && query.data === undefined,
  };
}

export interface CanResult {
  /** False until the resolver has answered. Never optimistic. */
  can: boolean;
  /** True while the answer is in flight. Render neutral, not denied. */
  loading: boolean;
  /** The resolver could not be reached. `can` is false in this case. */
  error: boolean;
}

/**
 * May the current user do this one thing?
 *
 * A name that is not in permission_catalog simply never appears in the
 * allowed set, so it denies. That is intentional — a typo in a
 * permission name must close a door, not open one.
 */
export function useCan(permissionName: string, projectId?: string): CanResult {
  const { data, isPending, isError } = useMyPermissions(projectId);

  return {
    can: data?.has(permissionName) ?? false,
    loading: isPending,
    error: isError,
  };
}
