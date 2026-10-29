import { dayNumber } from "../board/workingDays";

// Critical path for one board (or a whole space: pass all its tasks) — which tasks would push the end if
// they slipped, and how many working days the others can slip. Pure, no
// React: the Gantt and the link diagram both call it.
//
// It never computes dates. The scheduler in the database already did
// (tasks_private.compute_board_schedule, migration 2026-10-13_task_scheduling_a
// and the 2026-10-14 template version); this reads the dates it saved and
// walks the links backwards from the board's end, the way the scheduler
// walks them forwards:
//
//   - A link P → T means every subtask under T (at any depth) starts no
//     earlier than the working day after P's last subtask ends, plus the
//     wait gaps on the way down: T's own, each parent's between, and the
//     subtask's. So links are expanded to leaf tasks first, and a parent is
//     critical when one of its subtasks is.
//   - Done / closed tasks never move: they are never marked, and nothing
//     before them is held back by them.
//   - Unscheduled tasks are left out. A link from a task that isn't loaded
//     (another zone of the space, scheduled together with this board) can
//     hold a task back: that task is taken as pinned from outside — it may
//     start later than this board's own links say — and everything is
//     measured against this board's end.
//   - A start-together link ("ss") binds the next task's start to the
//     previous task's start, not to its end.
//
// Days are counted in working days (Friday off) on a board and in plain days
// on a template (`plain`), by turning every date into a working-day number
// first — after that the maths is the same as Construction Flow's critical().
// Unlike that tool, slack is counted on the task's own end, so the shorter of
// two tasks that start together isn't marked critical when it has room.
//
// Before trusting the answer it rebuilds every linked task's start from its
// links. If one doesn't match what the server saved (and nothing outside the
// board holds it back), the board is out of date and the result is
// { ok: false }.

export interface CriticalTask {
  id: string;
  parent_task_id: string | null;
  start_date: string | null;
  due_date: string | null;
  start_lag_days: number | null;
  /** done / closed */
  frozen: boolean;
}

export interface CriticalPair {
  blocking_task_id: string;
  blocked_task_id: string;
  /** "ss" = starts with the other task; missing = finish -> start. */
  link_type?: "fs" | "ss";
}

export interface CriticalPathResult {
  /** Working days each task can slip without moving the board's end (a
   * parent: its tightest subtask). Unscheduled and done tasks are absent. */
  slack: Map<string, number>;
  /** Critical tasks, parents included. */
  critical: Set<string>;
  /** Links on the critical path, keyed by linkKey(). */
  criticalLinks: Set<string>;
  /** Critical tasks that have no subtasks — the number to show. */
  count: number;
}

export type CriticalPathOutcome =
  | { ok: true; result: CriticalPathResult }
  | { ok: false; reason: "stale" | "loop" };

export const linkKey = (pair: CriticalPair) => `${pair.blocking_task_id}>${pair.blocked_task_id}`;

/** Day number → working-day number: Fridays are not counted (a Friday gets
 * the number of the Thursday before it). Day 1 (1970-01-02) was a Friday,
 * so Fridays are the days ≡ 1 (mod 7). */
function workingIndex(day: number, plain: boolean): number {
  return plain ? day : day - Math.floor((day + 6) / 7);
}

interface Leaf {
  id: string;
  s: number;
  e: number;
  frozen: boolean;
}

interface Edge {
  from: Leaf;
  to: Leaf;
  /** Wait gaps between them, in working days. */
  gap: number;
  /** Start together: `to` starts no earlier than `from` starts. */
  ss: boolean;
}

/** The earliest start an edge allows its `to` task. */
const earliestStart = (edge: Edge) => (edge.ss ? edge.from.s : edge.from.e + 1) + edge.gap;

export function criticalPath(
  tasks: CriticalTask[],
  pairs: CriticalPair[],
  { plain }: { plain: boolean },
): CriticalPathOutcome {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const children = new Map<string, CriticalTask[]>();
  for (const t of tasks) {
    if (t.parent_task_id && byId.has(t.parent_task_id)) {
      const list = children.get(t.parent_task_id) ?? [];
      list.push(t);
      children.set(t.parent_task_id, list);
    }
  }

  const leaves = new Map<string, Leaf>();
  for (const t of tasks) {
    if (children.has(t.id) || !t.start_date || !t.due_date) continue;
    leaves.set(t.id, {
      id: t.id,
      s: workingIndex(dayNumber(t.start_date), plain),
      e: workingIndex(dayNumber(t.due_date), plain),
      frozen: t.frozen,
    });
  }
  const empty: CriticalPathOutcome = {
    ok: true,
    result: { slack: new Map(), critical: new Set(), criticalLinks: new Set(), count: 0 },
  };
  if (leaves.size === 0) return empty;

  // The scheduled leaves under a task, each with the wait gaps from that task
  // down to it (both ends included).
  const leavesUnder = (taskId: string): { leaf: Leaf; gap: number }[] => {
    const out: { leaf: Leaf; gap: number }[] = [];
    const walk = (id: string, gap: number, seen: Set<string>) => {
      if (seen.has(id)) return;
      seen.add(id);
      const task = byId.get(id);
      if (!task) return;
      const total = gap + Math.max(0, task.start_lag_days ?? 0);
      const kids = children.get(id);
      if (kids) {
        for (const kid of kids) walk(kid.id, total, seen);
        return;
      }
      const leaf = leaves.get(id);
      if (leaf) out.push({ leaf, gap: total });
    };
    walk(taskId, 0, new Set());
    return out;
  };

  // Expand every link to leaf → leaf edges. A link from a task that isn't
  // loaded pins the leaves under its blocked task from outside.
  const edges: Edge[] = [];
  const edgesByPair = new Map<string, Edge[]>();
  const pinned = new Set<string>();
  for (const pair of pairs) {
    if (!byId.has(pair.blocking_task_id) && byId.has(pair.blocked_task_id)) {
      for (const { leaf } of leavesUnder(pair.blocked_task_id)) pinned.add(leaf.id);
      continue;
    }
    if (!byId.has(pair.blocking_task_id) || !byId.has(pair.blocked_task_id)) continue;
    const before = leavesUnder(pair.blocking_task_id);
    const after = leavesUnder(pair.blocked_task_id);
    const list: Edge[] = [];
    for (const a of before) {
      for (const b of after) {
        if (a.leaf === b.leaf) continue;
        // The blocking side's own gaps only delay its start, not when it
        // ends, so only the blocked side's gaps count here.
        const edge = { from: a.leaf, to: b.leaf, gap: b.gap, ss: pair.link_type === "ss" };
        edges.push(edge);
        list.push(edge);
      }
    }
    edgesByPair.set(linkKey(pair), list);
  }

  // Check the server's dates against the links: a linked task that isn't done
  // starts exactly on the latest working day its links allow.
  const required = new Map<string, number>();
  for (const edge of edges) {
    required.set(edge.to.id, Math.max(required.get(edge.to.id) ?? -Infinity, earliestStart(edge)));
  }
  for (const [id, need] of required) {
    const leaf = leaves.get(id) as Leaf;
    if (leaf.frozen) continue;
    if (leaf.s < need || (leaf.s > need && !pinned.has(id))) return { ok: false, reason: "stale" };
  }

  // Backwards from the board's end: the latest each task may end.
  const end = Math.max(...Array.from(leaves.values(), (l) => l.e));
  const latestEnd = new Map<string, number>();
  for (const leaf of leaves.values()) latestEnd.set(leaf.id, end);
  const live = edges.filter((edge) => !edge.to.frozen);
  let settled = false;
  for (let pass = 0; pass < leaves.size * 2 + 5; pass++) {
    let changed = false;
    for (const edge of live) {
      const latestStartAfter = (latestEnd.get(edge.to.id) as number) - (edge.to.e - edge.to.s);
      // fs: `from` must end before `to` may start; ss: start no later than it
      const limit = edge.ss
        ? latestStartAfter - edge.gap + (edge.from.e - edge.from.s)
        : latestStartAfter - 1 - edge.gap;
      if (limit < (latestEnd.get(edge.from.id) as number)) {
        latestEnd.set(edge.from.id, limit);
        changed = true;
      }
    }
    if (!changed) {
      settled = true;
      break;
    }
  }
  if (!settled) return { ok: false, reason: "loop" };

  const slack = new Map<string, number>();
  const critical = new Set<string>();
  let count = 0;
  for (const leaf of leaves.values()) {
    if (leaf.frozen) continue;
    const s = (latestEnd.get(leaf.id) as number) - leaf.e;
    slack.set(leaf.id, s);
    if (s <= 0) {
      critical.add(leaf.id);
      count += 1;
    }
  }

  // Parents: their tightest subtask.
  const parentSlack = (id: string): number | null => {
    const kids = children.get(id);
    if (!kids) return slack.get(id) ?? null;
    let best: number | null = null;
    for (const kid of kids) {
      const s = parentSlack(kid.id);
      if (s !== null && (best === null || s < best)) best = s;
    }
    if (best !== null) {
      slack.set(id, best);
      if (best <= 0) critical.add(id);
    }
    return best;
  };
  for (const t of tasks) if (!t.parent_task_id || !byId.has(t.parent_task_id)) parentSlack(t.id);

  // A link is critical when one of its leaf edges joins two critical tasks
  // with no room between them.
  const criticalLinks = new Set<string>();
  for (const [key, list] of edgesByPair) {
    if (list.some((e) => critical.has(e.from.id) && critical.has(e.to.id) && e.to.s === earliestStart(e))) {
      criticalLinks.add(key);
    }
  }

  return { ok: true, result: { slack, critical, criticalLinks, count } };
}
