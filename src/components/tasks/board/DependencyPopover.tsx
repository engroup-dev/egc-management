import { useMemo, useState, type RefObject } from "react";
import { CheckCircle2, X } from "lucide-react";
import AnchoredMenu from "./AnchoredMenu";
import { DIRECTION_STYLES, DirectionToggle, type LinkDirection } from "./DependencyBadges";
import type { LinkRef, TaskLinks } from "../../../hooks/tasks/dependencyFlags";
import type { DependencyPair, TaskRow } from "../../../hooks/tasks/useTaskBoard";

// The board's quick link editor — opened from the row's link icons or the
// row's right-click menu. Same-board links only: linking to another board
// (another zone) stays in the task panel (DependenciesSection.tsx). Picking keeps it open,
// so a few links can be added in a row.

const SECTION_LABELS: Record<LinkDirection, string> = {
  blockedBy: "تبدأ بعد انتهاء",
  blocks: "تبدأ بعدها",
};

/** previous / next sibling in the table's current order — the usual pick. */
export function neighbours(task: TaskRow, childrenByParent: Map<string | null, TaskRow[]>) {
  const siblings = childrenByParent.get(task.parent_task_id ?? null) ?? [];
  const i = siblings.findIndex((t) => t.id === task.id);
  return { previous: i > 0 ? siblings[i - 1] : null, next: i >= 0 ? (siblings[i + 1] ?? null) : null };
}

/** The pair for linking `other` to `task` in `direction`. */
export function pairFor(taskId: string, otherId: string, direction: LinkDirection): DependencyPair {
  return direction === "blockedBy"
    ? { blocking_task_id: otherId, blocked_task_id: taskId }
    : { blocking_task_id: taskId, blocked_task_id: otherId };
}

/** Every link of a task as pairs — "remove all links". */
export function allPairs(taskId: string, links: TaskLinks | undefined): DependencyPair[] {
  return [
    ...(links?.waitsFor ?? []).map((l) => pairFor(taskId, l.taskId, "blockedBy")),
    ...(links?.waitedBy ?? []).map((l) => pairFor(taskId, l.taskId, "blocks")),
  ];
}

function LinkSection({
  direction,
  items,
  isActive,
  onRemove,
}: {
  direction: LinkDirection;
  items: LinkRef[];
  isActive: (item: LinkRef) => boolean;
  onRemove: (item: LinkRef) => void;
}) {
  const style = DIRECTION_STYLES[direction];
  if (!items.length) return null;
  return (
    <div className="mb-2">
      <div className={`mb-1 flex items-center gap-1 text-[11px] font-semibold ${style.text}`}>
        <style.Icon className="h-3 w-3" />
        {SECTION_LABELS[direction]}
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.taskId}
            className={`flex items-center gap-1.5 rounded border border-r-2 border-gray-100 px-2 py-1 text-xs ${style.border}`}
          >
            {isActive(item) ? (
              <style.Icon className={`h-3 w-3 shrink-0 ${style.text}`} />
            ) : (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
            )}
            <span className="flex-1 truncate text-gray-700">{item.title}</span>
            {item.otherBoard && <span className="shrink-0 rounded-full bg-gray-100 px-1.5 text-[10px] text-gray-500">لوحة أخرى</span>}
            <button onClick={() => onRemove(item)} className="shrink-0 text-gray-400 hover:text-red-500" title="إزالة الربط">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

interface DependencyPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  task: TaskRow;
  links: TaskLinks | undefined;
  /** This task is done/closed: the tasks waiting on it are released. */
  selfDone: boolean;
  childrenByParent: Map<string | null, TaskRow[]>;
  onLink: (pair: DependencyPair) => void;
  onUnlink: (pairs: DependencyPair[]) => void;
}

export default function DependencyPopover({ open, onClose, anchorRef, ...rest }: DependencyPopoverProps) {
  return (
    <AnchoredMenu open={open} onClose={onClose} anchorRef={anchorRef} width={300} className="p-2.5">
      <PopoverBody onClose={onClose} {...rest} />
    </AnchoredMenu>
  );
}

function PopoverBody({
  onClose,
  task,
  links,
  selfDone,
  childrenByParent,
  onLink,
  onUnlink,
}: Omit<DependencyPopoverProps, "open" | "anchorRef">) {
  const [direction, setDirection] = useState<LinkDirection>("blockedBy");
  const [search, setSearch] = useState("");
  const waitsFor = links?.waitsFor ?? [];
  const waitedBy = links?.waitedBy ?? [];

  // The board in the table's order, each with its depth; minus the task
  // itself, its parent chain and its subtasks (a link there is refused),
  // and anything it is already linked with either way.
  const candidates = useMemo(() => {
    const byId = new Map<string, TaskRow>();
    for (const list of childrenByParent.values()) for (const t of list) byId.set(t.id, t);
    const linked = [...(links?.waitsFor ?? []), ...(links?.waitedBy ?? [])].map((l) => l.taskId);
    const excluded = new Set<string>([task.id, ...linked]);
    for (let p = task.parent_task_id; p; p = byId.get(p)?.parent_task_id ?? null) excluded.add(p);
    const stack = [task.id];
    while (stack.length) {
      for (const child of childrenByParent.get(stack.pop() as string) ?? []) {
        excluded.add(child.id);
        stack.push(child.id);
      }
    }
    const out: { task: TaskRow; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const t of childrenByParent.get(parentId) ?? []) {
        if (!excluded.has(t.id)) out.push({ task: t, depth });
        walk(t.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [childrenByParent, task.id, task.parent_task_id, links]);

  const { previous, next } = neighbours(task, childrenByParent);
  const suggested = direction === "blockedBy" ? previous : next;
  const suggestion = suggested && candidates.some((c) => c.task.id === suggested.id) ? suggested : null;

  const term = search.trim().toLowerCase();
  const matches = term
    ? candidates.filter((c) => c.task.title.toLowerCase().includes(term))
    : candidates.filter((c) => c.task.id !== suggestion?.id);

  const pick = (otherId: string) => {
    onLink(pairFor(task.id, otherId, direction));
    setSearch("");
  };

  return (
    <div onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <LinkSection
        direction="blockedBy"
        items={waitsFor}
        isActive={(l) => !l.done}
        onRemove={(l) => onUnlink([pairFor(task.id, l.taskId, "blockedBy")])}
      />
      <LinkSection
        direction="blocks"
        items={waitedBy}
        isActive={() => !selfDone}
        onRemove={(l) => onUnlink([pairFor(task.id, l.taskId, "blocks")])}
      />
      {!waitsFor.length && !waitedBy.length && <div className="mb-2 text-xs text-gray-400">لا توجد روابط بعد</div>}

      <div className="border-t border-gray-100 pt-2">
        <DirectionToggle value={direction} onChange={setDirection} />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث في مهام اللوحة..."
          className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-blue-300"
        />
        <div className="mt-1 max-h-56 overflow-y-auto">
          {!term && suggestion && (
            <button
              onClick={() => pick(suggestion.id)}
              className="block w-full rounded bg-blue-50/60 px-2 py-1 text-right hover:bg-blue-50"
            >
              <div className="text-[10px] font-semibold text-blue-600">
                {direction === "blockedBy" ? "المهمة السابقة" : "المهمة التالية"}
              </div>
              <div className="truncate text-sm text-gray-900">{suggestion.title}</div>
            </button>
          )}
          {matches.map(({ task: t, depth }) => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              className="block w-full truncate rounded py-1 pl-2 text-right text-sm text-gray-800 hover:bg-gray-50"
              style={{ paddingRight: 8 + depth * 12 }}
            >
              {t.title}
            </button>
          ))}
          {!matches.length && !(suggestion && !term) && (
            <div className="px-2 py-1.5 text-xs text-gray-400">{term ? "لا توجد نتائج" : "لا توجد مهام أخرى للربط"}</div>
          )}
        </div>
        <div className="mt-1 text-[10px] text-gray-400">للربط بمهمة في لوحة أخرى: افتح المهمة ← الاعتماديات</div>
      </div>
    </div>
  );
}
