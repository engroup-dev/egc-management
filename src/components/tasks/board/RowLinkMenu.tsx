import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import DependencyBadges from "./DependencyBadges";
import DependencyPopover from "./DependencyPopover";
import TaskRowMenu from "./TaskRowMenu";
import type { DependencyFlags, TaskLinks } from "../../../hooks/tasks/dependencyFlags";
import type { DependencyPair, StatusRow, TaskRow } from "../../../hooks/tasks/useTaskBoard";

// A task row's link controls, shared by the board row (TaskRow.tsx) and the
// space view's row (DirectoryTaskRow.tsx) so the two behave the same:
// right-click opens the row menu (TaskRowMenu), the ⛔ / ! icons open the
// quick link editor (DependencyPopover), and the menu's "ربط بمهمة…" opens
// that same editor.

export function useRowLinkMenu() {
  const [linksOpen, setLinksOpen] = useState(false);
  const [menuPoint, setMenuPoint] = useState<{ x: number; y: number } | null>(null);
  const badgesRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  const onContextMenu = (e: ReactMouseEvent<HTMLElement>) => {
    // React bubbles events out of portals: ignore the row's own popovers
    if (!e.currentTarget.contains(e.target as Node)) return;
    // a text field keeps the browser's own menu (copy / paste)
    if ((e.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
    e.preventDefault();
    setMenuPoint({ x: e.clientX, y: e.clientY });
  };

  return { linksOpen, setLinksOpen, menuPoint, setMenuPoint, badgesRef, titleRef, onContextMenu };
}

export type RowLinkMenuState = ReturnType<typeof useRowLinkMenu>;

export const hasDependencyBadges = (flags: DependencyFlags | undefined) =>
  !!flags && (flags.waitingOn.length > 0 || (flags.holding.length > 0 && flags.waitingOn.length === 0) || flags.cleared);

/** The row's ⛔ / ! / ✓ icons; with edit rights clicking them opens the link editor. */
export function RowDependencyIcons({
  flags,
  canEdit,
  menu,
}: {
  flags: DependencyFlags | undefined;
  canEdit: boolean;
  menu: RowLinkMenuState;
}) {
  if (!hasDependencyBadges(flags)) return null;
  if (!canEdit) return <DependencyBadges flags={flags} />;
  return (
    <button
      ref={menu.badgesRef}
      type="button"
      onClick={() => menu.setLinksOpen((v) => !v)}
      className="flex shrink-0 items-center gap-1 rounded hover:bg-gray-100"
    >
      <DependencyBadges flags={flags} />
    </button>
  );
}

/** The link editor and the right-click menu, rendered next to the row. */
export function RowLinkOverlays({
  menu,
  task,
  flags,
  links,
  statusCategory,
  childrenByParent,
  canEdit,
  onOpenTask,
  onLink,
  onUnlink,
}: {
  menu: RowLinkMenuState;
  task: TaskRow;
  flags: DependencyFlags | undefined;
  links: TaskLinks | undefined;
  statusCategory: StatusRow["category"] | undefined;
  /** The task's board, in board order — the "previous task" and the editor's list. */
  childrenByParent: Map<string | null, TaskRow[]>;
  canEdit: boolean;
  onOpenTask: () => void;
  onLink: (pair: DependencyPair) => void;
  onUnlink: (pairs: DependencyPair[]) => void;
}) {
  return (
    <>
      <DependencyPopover
        open={menu.linksOpen}
        onClose={() => menu.setLinksOpen(false)}
        anchorRef={hasDependencyBadges(flags) && canEdit ? menu.badgesRef : menu.titleRef}
        task={task}
        links={links}
        selfDone={statusCategory === "done" || statusCategory === "closed"}
        childrenByParent={childrenByParent}
        onLink={onLink}
        onUnlink={onUnlink}
      />
      <TaskRowMenu
        point={menu.menuPoint}
        onClose={() => menu.setMenuPoint(null)}
        task={task}
        links={links}
        childrenByParent={childrenByParent}
        canEdit={canEdit}
        onOpenTask={onOpenTask}
        onOpenLinks={() => menu.setLinksOpen(true)}
        onLink={onLink}
        onUnlink={onUnlink}
      />
    </>
  );
}
