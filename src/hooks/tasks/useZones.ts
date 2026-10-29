import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../useAuth";
import type { ScheduleMove } from "./useTaskSchedule";

// Zones in the schedule (tasks/migrations/2026-10-29_zones_schedule_a.sql).
// A zone is a board bound to a boq.zones row; the space's zones run in board
// order. The same task in two zones shares tasks.twin_key, and "chain zones"
// links each one to its twin in the next zone (one crew moving floor to
// floor), so the server schedules the zones of a space together.

export interface ZoneSpan {
  boardId: string;
  boardName: string;
  zoneId: string | null;
  zoneName: string | null;
  sortOrder: number;
  firstStart: string | null;
  lastDue: string | null;
  taskCount: number;
  openCount: number;
}

export interface ChainGroupZone {
  board_id: string;
  task_id: string;
  start: string | null;
  due: string | null;
}

/** One task found in two zones or more (tasks.zone_chain_groups). */
export interface ChainGroup {
  key: string;
  title: string;
  depth: number;
  is_summary: boolean;
  /** Some zone has it twice: can't be chained until one is removed. */
  duplicate: boolean;
  /** Every step zone N -> N+1 already has a chain link. */
  chained: boolean;
  chain_links: number;
  zones: ChainGroupZone[];
}

export interface ChainResult {
  added: number;
  kept: number;
  removed: number;
  skipped: { from: string; to: string; title: string }[];
  moved: ScheduleMove[];
  project_end_before: string | null;
  project_end_after: string | null;
  dry_run: boolean;
}

export interface CopyResult {
  boards: { board_id: string; copied: number; skipped: number; new_ids: string[] }[];
  moved: ScheduleMove[];
  project_end_before: string | null;
  project_end_after: string | null;
  dry_run: boolean;
}

/** Everything a change across zones can make stale. */
export function invalidateZoneViews(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["task-board"] });
  queryClient.invalidateQueries({ queryKey: ["space-zones"] });
  queryClient.invalidateQueries({ queryKey: ["zone-chain-groups"] });
  queryClient.invalidateQueries({ queryKey: ["task-directory"] });
  queryClient.invalidateQueries({ queryKey: ["task-detail"] });
}

/** The space's real boards in order with their dates; `zones` are the ones bound to a zone. */
export function useSpaceZones(spaceId: string | undefined) {
  const query = useQuery({
    queryKey: ["space-zones", spaceId],
    enabled: !!spaceId,
    queryFn: async (): Promise<ZoneSpan[]> => {
      const { data, error } = await supabase.schema("tasks").rpc("space_zone_spans", { p_space_id: spaceId as string });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        boardId: r.board_id,
        boardName: r.board_name,
        zoneId: r.zone_id,
        zoneName: r.zone_name,
        sortOrder: r.sort_order,
        firstStart: r.first_start,
        lastDue: r.last_due,
        taskCount: r.task_count,
        openCount: r.open_count,
      }));
    },
  });
  const boards = query.data ?? [];
  const zones = boards.filter((b) => b.zoneId);
  const projectEnd = zones.reduce<string | null>(
    (end, z) => (z.lastDue && (!end || z.lastDue > end) ? z.lastDue : end),
    null,
  );
  return { boards, zones, projectEnd, loading: query.isPending, error: query.error };
}

export function useZoneChainGroups(spaceId: string | undefined, enabled = true) {
  const query = useQuery({
    queryKey: ["zone-chain-groups", spaceId],
    enabled: !!spaceId && enabled,
    queryFn: async (): Promise<ChainGroup[]> => {
      const { data, error } = await supabase.schema("tasks").rpc("zone_chain_groups", { p_space_id: spaceId as string });
      if (error) throw error;
      return (data as unknown as ChainGroup[]) ?? [];
    },
  });
  return { groups: query.data ?? [], loading: query.isPending, error: query.error };
}

export function useSyncZoneChain(spaceId: string | undefined) {
  const queryClient = useQueryClient();
  const sync = useMutation({
    mutationFn: async ({ keys, dryRun }: { keys: string[]; dryRun: boolean }): Promise<ChainResult> => {
      const { data, error } = await supabase
        .schema("tasks")
        .rpc("sync_zone_chain", { p_space_id: spaceId as string, p_keys: keys, p_dry_run: dryRun });
      if (error) throw error;
      return data as unknown as ChainResult;
    },
    onSuccess: (result) => {
      if (!result.dry_run) invalidateZoneViews(queryClient);
    },
  });
  return { syncChain: sync.mutateAsync, syncing: sync.isPending };
}

export function useCopyTasksToBoards() {
  const queryClient = useQueryClient();
  const copy = useMutation({
    mutationFn: async ({
      sourceBoardId,
      taskIds,
      targetBoardIds,
      startDate = null,
      dryRun = false,
    }: {
      sourceBoardId: string;
      taskIds: string[];
      targetBoardIds: string[];
      startDate?: string | null;
      dryRun?: boolean;
    }): Promise<CopyResult> => {
      const run = () =>
        supabase.schema("tasks").rpc("copy_tasks_to_boards", {
          p_source_board_id: sourceBoardId,
          p_task_ids: taskIds,
          p_target_board_ids: targetBoardIds,
          p_start_date: startDate ?? undefined,
          p_dry_run: dryRun,
        });
      // copy_task_tree's temp table can fail once on a pooled connection
      // (copyTaskTree.ts); the call is one transaction, so a retry is safe
      let { data, error } = await run();
      if (error) ({ data, error } = await run());
      if (error) throw error;
      return data as unknown as CopyResult;
    },
    onSuccess: (result) => {
      if (!result.dry_run) invalidateZoneViews(queryClient);
    },
  });
  return { copyTasks: copy.mutateAsync, copying: copy.isPending };
}

/**
 * Zone management from the zone bar: add a zone (a boq.zones row + a board
 * bound to it, last in order, optionally filled with another zone's tasks),
 * rename it, move it earlier/later, archive its board.
 */
export function useZoneActions(spaceId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const tasksDb = supabase.schema("tasks");
  const afterChange = () => {
    invalidateZoneViews(queryClient);
    queryClient.invalidateQueries({ queryKey: ["tasks-sidebar"] });
    queryClient.invalidateQueries({ queryKey: ["space-settings"] });
  };

  const addZone = useMutation({
    mutationFn: async ({
      projectId,
      name,
      copyFrom,
    }: {
      projectId: string;
      name: string;
      copyFrom?: { boardId: string; taskIds: string[] };
    }) => {
      const { data: zone, error: zoneError } = await supabase
        .schema("boq")
        .from("zones")
        .insert({ project_id: projectId, name })
        .select("id")
        .single();
      if (zoneError) throw zoneError;

      const { data: last, error: lastError } = await tasksDb
        .from("boards")
        .select("sort_order")
        .eq("space_id", spaceId as string)
        .order("sort_order", { ascending: false })
        .limit(1);
      if (lastError) throw lastError;

      const { data: board, error: boardError } = await tasksDb
        .from("boards")
        .insert({
          space_id: spaceId as string,
          name,
          zone_id: zone.id,
          sort_order: (last?.[0]?.sort_order ?? 0) + 1,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (boardError) throw boardError;

      if (copyFrom && copyFrom.taskIds.length) {
        const run = () =>
          tasksDb.rpc("copy_tasks_to_boards", {
            p_source_board_id: copyFrom.boardId,
            p_task_ids: copyFrom.taskIds,
            p_target_board_ids: [board.id],
          });
        let { error } = await run();
        if (error) ({ error } = await run());
        if (error) throw error;
      }
      return board.id;
    },
    onSuccess: afterChange,
  });

  // Renames the BOQ zone; the board too when it carried the zone's name.
  const renameZone = useMutation({
    mutationFn: async ({ zone, name }: { zone: ZoneSpan; name: string }) => {
      if (zone.zoneId) {
        const { error } = await supabase.schema("boq").from("zones").update({ name }).eq("id", zone.zoneId);
        if (error) throw error;
      }
      if (!zone.zoneId || zone.boardName === zone.zoneName) {
        const { error } = await tasksDb.from("boards").update({ name }).eq("id", zone.boardId);
        if (error) throw error;
      }
    },
    onSuccess: afterChange,
  });

  // Swaps the board's place with its neighbour in the zone order. Equal sort
  // orders (boards made before ordering existed) are spread out first.
  const moveZone = useMutation({
    mutationFn: async ({ zones, boardId, dir }: { zones: ZoneSpan[]; boardId: string; dir: -1 | 1 }) => {
      const i = zones.findIndex((z) => z.boardId === boardId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= zones.length) return;
      const order = zones.map((z) => z.boardId);
      [order[i], order[j]] = [order[j], order[i]];
      const base = Math.min(...zones.map((z) => z.sortOrder));
      for (let k = 0; k < order.length; k++) {
        const { error } = await tasksDb.from("boards").update({ sort_order: base + k }).eq("id", order[k]);
        if (error) throw error;
      }
    },
    onSuccess: afterChange,
  });

  const archiveZoneBoard = useMutation({
    mutationFn: async ({ boardId }: { boardId: string }) => {
      const { error } = await tasksDb.from("boards").update({ is_archived: true }).eq("id", boardId);
      if (error) throw error;
    },
    onSuccess: afterChange,
  });

  return {
    addZone: addZone.mutateAsync,
    addingZone: addZone.isPending,
    renameZone: renameZone.mutateAsync,
    moveZone: moveZone.mutateAsync,
    archiveZoneBoard: archiveZoneBoard.mutateAsync,
    busy: addZone.isPending || renameZone.isPending || moveZone.isPending || archiveZoneBoard.isPending,
  };
}
