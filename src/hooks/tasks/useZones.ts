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
      try {
        const { data, error } = await supabase.schema("tasks").rpc("space_zone_spans", { p_space_id: spaceId as string });
        if (!error && data && Array.isArray(data) && data.length > 0) {
          return data.map((r: any) => ({
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
        }
      } catch {
        // Fall back to direct table queries
      }

      // Robust fallback querying directly from tables if RPC is missing
      const tasksDb = supabase.schema("tasks");
      const { data: boardsData, error: boardsErr } = await tasksDb
        .from("boards")
        .select("id, name, zone_id, sort_order")
        .eq("space_id", spaceId as string)
        .eq("is_archived", false)
        .eq("is_template", false)
        .order("sort_order", { ascending: true });

      if (boardsErr || !boardsData) return [];

      const boardIds = boardsData.map((b) => b.id);
      const zoneIds = Array.from(new Set(boardsData.map((b) => b.zone_id).filter(Boolean))) as string[];

      const zoneMap = new Map<string, string>();
      if (zoneIds.length > 0) {
        try {
          const { data: zData } = await supabase
            .schema("boq")
            .from("zones")
            .select("id, name")
            .in("id", zoneIds);
          (zData ?? []).forEach((z: any) => zoneMap.set(z.id, z.name));
        } catch {
          // ignore
        }
      }

      let tasksData: any[] = [];
      if (boardIds.length > 0) {
        try {
          const { data: tData } = await tasksDb
            .from("tasks")
            .select("board_id, start_date, due_date, status_id")
            .in("board_id", boardIds)
            .eq("is_archived", false);
          tasksData = tData ?? [];
        } catch {
          // ignore
        }
      }

      const tasksByBoard = new Map<string, any[]>();
      tasksData.forEach((t) => {
        const list = tasksByBoard.get(t.board_id) ?? [];
        list.push(t);
        tasksByBoard.set(t.board_id, list);
      });

      return boardsData.map((b) => {
        const bTasks = tasksByBoard.get(b.id) ?? [];
        let firstStart: string | null = null;
        let lastDue: string | null = null;
        for (const t of bTasks) {
          if (t.start_date && (!firstStart || t.start_date < firstStart)) firstStart = t.start_date;
          if (t.due_date && (!lastDue || t.due_date > lastDue)) lastDue = t.due_date;
        }
        return {
          boardId: b.id,
          boardName: b.name,
          zoneId: b.zone_id,
          zoneName: (b.zone_id ? zoneMap.get(b.zone_id) : null) ?? b.name,
          sortOrder: b.sort_order ?? 0,
          firstStart,
          lastDue,
          taskCount: bTasks.length,
          openCount: bTasks.length,
        };
      });
    },
  });
  const boards = query.data ?? [];
  // Every board in the space functions as a zone in Construction Flow:
  const zones = boards.map((b) => ({
    ...b,
    zoneName: b.zoneName || b.boardName,
  }));
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
