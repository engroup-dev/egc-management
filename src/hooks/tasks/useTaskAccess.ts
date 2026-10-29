import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import { TIERS } from "../../lib/queryClient";
import { useAuthUserId } from "../permissions/useCan";

// =====================================================================
// What may I do in the tasks module — read from the database, never derived
// =====================================================================
// The rules live in SQL (tasks_private.task_ok / space_level, migration
// 2026-10-08_task_access_a_foundation.sql). The two RPCs below return them
// as plain booleans; this file only fetches and caches them. Nothing here
// turns a level into a capability, so the UI and the database cannot drift
// apart. (Row-level security enforces the same rules on the server, so a
// hidden button is a courtesy, not the lock.)
//
//   my_access()   one call for the whole module: global flags, a caps object
//                 per space I can see, spaces visible only because they hold
//                 a task of mine, and what being assigned to a task allows.
//   task_caps(ids) per-task answer, used by the detail panel.
//
// Same cache discipline as useMyPermissions (issue 13): keyed by the auth
// user, held until a session exists, deny while loading and on error.
//
// These hooks use whichever QueryClient is closest. Under TasksLayout that is
// the module's own client, so the same client's invalidateQueries (after a
// member or assignee change) refreshes them.

export interface TaskCaps {
  view: boolean;
  comment: boolean;
  /** change status, tick checklist items, satisfy requirements */
  status: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  /** members, settings, boards/folders structure, statuses, automations */
  manage: boolean;
}

export const NO_CAPS: TaskCaps = {
  view: false,
  comment: false,
  status: false,
  create: false,
  edit: false,
  delete: false,
  manage: false,
};

export interface SpaceAccess {
  level: number;
  source: "owner" | "global" | "member";
  caps: TaskCaps;
}

export interface MyTaskAccess {
  is_internal: boolean;
  view_all: boolean;
  edit_all: boolean;
  can_create_space: boolean;
  has_any: boolean;
  spaces: Record<string, SpaceAccess>;
  nav_space_ids: string[];
  assignee_caps: TaskCaps;
}

type RpcResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;
// tasks.my_access / task_caps are newer than the generated types.
const tasksRpc = () =>
  supabase.schema("tasks") as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => RpcResult };

export const myTaskAccessKey = (userId: string | null) => ["tasks", "my-access", userId ?? "anonymous"];

/** Refresh every cached capability answer (call after members / assignees change). */
export function invalidateTaskAccess(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["tasks", "my-access"] });
  queryClient.invalidateQueries({ queryKey: ["tasks", "task-caps"] });
}

export function useMyTaskAccess(): {
  access: MyTaskAccess | undefined;
  loading: boolean;
  error: boolean;
  userId: string | null;
} {
  const { userId, resolved } = useAuthUserId();
  const query = useQuery<MyTaskAccess>({
    queryKey: myTaskAccessKey(userId),
    enabled: !!userId,
    ...TIERS.B,
    queryFn: async () => {
      const { data, error } = await tasksRpc().rpc("my_access");
      if (error) throw new Error(error.message);
      return data as MyTaskAccess;
    },
  });
  return {
    access: userId ? query.data : undefined,
    loading: !resolved || (!!userId && query.isPending),
    error: query.isError,
    userId,
  };
}

/** Space-wide capabilities; all false while loading, on error, or without access. */
export function useSpaceCaps(spaceId: string | null | undefined): TaskCaps {
  const { access } = useMyTaskAccess();
  return (spaceId && access?.spaces[spaceId]?.caps) || NO_CAPS;
}

/** A task's capabilities: what the space gives, plus what being assigned gives. */
export function taskRowCaps(spaceCaps: TaskCaps, assigneeCaps: TaskCaps | undefined, assigned: boolean): TaskCaps {
  if (!assigned || !assigneeCaps) return spaceCaps;
  return {
    view: spaceCaps.view || assigneeCaps.view,
    comment: spaceCaps.comment || assigneeCaps.comment,
    status: spaceCaps.status || assigneeCaps.status,
    create: spaceCaps.create || assigneeCaps.create,
    edit: spaceCaps.edit || assigneeCaps.edit,
    delete: spaceCaps.delete || assigneeCaps.delete,
    manage: spaceCaps.manage || assigneeCaps.manage,
  };
}

export interface TaskCapsRow {
  task_id: string;
  level: number;
  is_assignee: boolean;
  can_view: boolean;
  can_comment: boolean;
  can_status: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

/** The server's answer for one task (detail panel). All false until it arrives. */
export function useTaskCaps(taskId: string | undefined): {
  caps: TaskCaps;
  isAssignee: boolean;
  loading: boolean;
  /** true once the server answered and said the task is not visible to me */
  unavailable: boolean;
} {
  const { userId } = useAuthUserId();
  const query = useQuery<TaskCapsRow | null>({
    queryKey: ["tasks", "task-caps", userId ?? "anonymous", taskId],
    enabled: !!userId && !!taskId,
    ...TIERS.E,
    queryFn: async () => {
      const { data, error } = await tasksRpc().rpc("task_caps", { p_ids: [taskId] });
      if (error) throw new Error(error.message);
      return ((data as TaskCapsRow[] | null) ?? [])[0] ?? null;
    },
  });
  const row = query.data;
  const caps: TaskCaps = row
    ? {
        view: row.can_view,
        comment: row.can_comment,
        status: row.can_status,
        create: row.can_edit,
        edit: row.can_edit,
        delete: row.can_delete,
        // managing the space is a space-level capability, not a per-task one
        manage: row.level >= 4,
      }
    : NO_CAPS;
  return {
    caps,
    isAssignee: !!row?.is_assignee,
    loading: !!taskId && query.isPending,
    unavailable: !query.isPending && !query.isError && (row === null || row === undefined || !row.can_view),
  };
}

/** Can I see this space at all: through a level on it, or because it holds a task of mine. */
export function canSeeSpace(access: MyTaskAccess, spaceId: string): boolean {
  return !!access.spaces[spaceId] || access.nav_space_ids.includes(spaceId);
}

/** Stable string of which spaces I can see — part of query keys so lists refetch when it changes. */
export function accessSignature(access: MyTaskAccess | undefined): string {
  if (!access) return "pending";
  return [...Object.keys(access.spaces), "|", ...access.nav_space_ids].sort().join(",");
}
