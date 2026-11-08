import type { BoardWithCount, SpaceNode, TasksSidebarData } from "./useTasksSidebar";

// Pure matching over the data useTasksSidebar already loads (spaces,
// folders, boards, project names) — no fetch, so results are instant. Shared
// by the sidebar search box (TasksLayout.tsx) and the search on the /tasks
// home page (TasksPage.tsx) so "what counts as a match" can't drift between
// them. Tasks are the one thing NOT matched here: they aren't in the
// sidebar payload, so the sidebar still asks the server for those.

export function normalizeSearchTerm(raw: string): string {
  return raw.trim().toLowerCase();
}

function includesTerm(term: string, ...values: (string | null | undefined)[]): boolean {
  return values.some((v) => !!v && v.toLowerCase().includes(term));
}

export function allBoardsOf(node: SpaceNode): BoardWithCount[] {
  return [...node.boards, ...node.folders.flatMap((f) => f.boards)];
}

export interface SpaceMatch {
  /** The space itself matched, by its own name or its project's name. */
  spaceMatches: boolean;
  /** Boards in this space matching by board name or zone name. */
  boards: BoardWithCount[];
}

/** null = neither the space nor any of its boards match (or no term). */
export function matchSpaceNode(node: SpaceNode, rawTerm: string): SpaceMatch | null {
  const term = normalizeSearchTerm(rawTerm);
  if (!term) return null;

  const spaceMatches = includesTerm(term, node.space.name, node.projectName, node.projectCode);
  const boards = allBoardsOf(node).filter((b) => includesTerm(term, b.board.name, b.zoneName));
  return spaceMatches || boards.length > 0 ? { spaceMatches, boards } : null;
}

export interface BoardHit {
  board: BoardWithCount;
  space: SpaceNode;
}

export interface EntityMatches {
  spaces: SpaceNode[];
  boards: BoardHit[];
}

/** Flat lists for a dropdown: spaces that match on their own, and boards
 * that match on theirs. A space matching does not drag all its boards in —
 * the space row already takes you there. */
export function searchSidebarEntities(data: TasksSidebarData, rawTerm: string): EntityMatches {
  const result: EntityMatches = { spaces: [], boards: [] };

  for (const nodes of Object.values(data.spacesByType)) {
    for (const node of nodes) {
      const match = matchSpaceNode(node, rawTerm);
      if (!match) continue;
      if (match.spaceMatches) result.spaces.push(node);
      for (const board of match.boards) result.boards.push({ board, space: node });
    }
  }

  return result;
}
