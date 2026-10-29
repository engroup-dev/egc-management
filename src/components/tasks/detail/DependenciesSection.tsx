import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Plus, X } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import AnchoredMenu from "../board/AnchoredMenu";
import { DIRECTION_STYLES, DirectionToggle, type LinkDirection } from "../board/DependencyBadges";
import { useTemplateMode } from "../TemplateModeContext";
import type { DependencyTaskRef } from "../../../hooks/tasks/useTaskDetail";

type Direction = LinkDirection;

// A link on the same board is finish-to-start scheduling: the waiting task
// starts the working day after the other one ends (plus its wait gap), and
// moves when it moves. A link to another board is shown but moves nothing.
const DIRECTION_LABELS: Record<Direction, string> = {
  blockedBy: "تبدأ بعد انتهاء",
  blocks: "تبدأ بعدها",
};

// Same icon + colour as the board row's badges (DependencyBadges.tsx):
// waiting = red stop, waited on = amber "!".

// "Dependencies — blocks / waiting on, with a green check when a blocker
// clears" (build plan D3 §6). Ported from RelationshipsSection.tsx's
// search-and-link combobox pattern rather than sharing a component with
// it — task_relationships and task_dependencies are different tables with
// different semantics (see that file's own comment on the distinction).
//
// `active`: the link still holds — the waited-on task isn't done yet.
function DependencyRow({
  item,
  direction,
  active,
  onRemove,
}: {
  item: DependencyTaskRef;
  direction: Direction;
  active: boolean;
  onRemove: (dependencyId: string) => void;
}) {
  const style = DIRECTION_STYLES[direction];
  return (
    <div className={`flex items-center gap-2 rounded-md border border-r-2 border-gray-100 px-2.5 py-1.5 text-sm ${style.border}`}>
      {active ? (
        <style.Icon className={`h-3.5 w-3.5 shrink-0 ${style.text}`} />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      )}
      <span className="flex-1 truncate text-gray-700">{item.title}</span>
      {item.startTogether && (
        <span className="shrink-0 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] text-orange-700" title="تبدأ معها، لا بعد انتهائها">
          تبدأ معاً
        </span>
      )}
      {item.zoneChain ? (
        <span
          className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500"
          title="نفس المهمة في المنطقة السابقة / التالية (ربط المناطق)"
        >
          ربط المناطق
        </span>
      ) : (
        item.otherBoard && (
          <span
            className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500"
            title="مهمة في لوحة أخرى — تغيّر التواريخ إذا كانت اللوحتان منطقتين في نفس المساحة، وللمعلومة فقط إن كانت في مساحة أخرى"
          >
            لوحة أخرى
          </span>
        )
      )}
      <button onClick={() => onRemove(item.dependencyId)} className="text-gray-400 hover:text-gray-600">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function GroupHeader({ direction }: { direction: Direction }) {
  const style = DIRECTION_STYLES[direction];
  return (
    <div className={`mb-1 flex items-center gap-1 text-xs font-semibold ${style.text}`}>
      <style.Icon className="h-3.5 w-3.5" />
      {DIRECTION_LABELS[direction]}
    </div>
  );
}

interface SearchResult {
  id: string;
  title: string;
  boardId: string;
  spaceId: string;
  projectName: string | null;
  boardName: string | null;
}

interface DependenciesSectionProps {
  taskId: string;
  boardId: string;
  spaceId: string;
  blocking: DependencyTaskRef[]; // tasks that block this one
  blockedByMe: DependencyTaskRef[]; // tasks waiting on this one
  /** This task is done/closed: the tasks waiting on it are released. */
  selfDone: boolean;
  onAdd: (relatedTaskId: string, direction: Direction) => void;
  onRemove: (dependencyId: string) => void;
}

export default function DependenciesSection({
  taskId,
  boardId,
  spaceId,
  blocking,
  blockedByMe,
  selfDone,
  onAdd,
  onRemove,
}: DependenciesSectionProps) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("blockedBy");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<number | null>(null);
  // A template's dependencies only make sense between its own tasks —
  // apply_template_board() recreates exactly those on the target board —
  // so on a template the search is limited to the template board itself.
  const isTemplate = useTemplateMode();

  // Fetched once per space (not per keystroke) so every search can scope
  // a dedicated same-space query alongside the company-wide one — see
  // runSearch below for why that's necessary.
  const [spaceBoardIds, setSpaceBoardIds] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    supabase
      .schema("tasks")
      .from("boards")
      .select("id")
      .eq("space_id", spaceId)
      .then(({ data }) => {
        if (!cancelled) setSpaceBoardIds((data ?? []).map((b) => b.id));
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  const runSearch = (term: string) => {
    setSearch(term);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    searchTimer.current = window.setTimeout(async () => {
      const trimmed = term.trim();

      // A plain company-wide `ilike` + limit(8) with no ordering can bury
      // a same-space match under unrelated tasks that happen to share the
      // same short substring (very common with Arabic roots like "ترك") —
      // a short, correct-looking search term would then show nothing
      // relevant until it got specific enough to narrow the whole-company
      // match count below 8. Querying the current space separately
      // guarantees a same-space match is always found regardless of how
      // many other tasks match elsewhere.
      const scopeBoardIds = isTemplate ? [boardId] : spaceBoardIds;
      const [{ data: innerData }, { data: outerData }] = await Promise.all([
        scopeBoardIds.length
          ? supabase
              .schema("tasks")
              .from("tasks")
              .select("id, title, board_id, project_id")
              .eq("is_archived", false)
              .neq("id", taskId)
              .in("board_id", scopeBoardIds)
              .ilike("title", `%${trimmed}%`)
              .limit(6)
          : Promise.resolve({ data: [] as { id: string; title: string; board_id: string; project_id: string | null }[] }),
        isTemplate
          ? Promise.resolve({ data: [] as { id: string; title: string; board_id: string; project_id: string | null }[] })
          : supabase
              .schema("tasks")
              .from("tasks")
              .select("id, title, board_id, project_id")
              .eq("is_archived", false)
              .eq("is_template", false)
              .neq("id", taskId)
              .ilike("title", `%${trimmed}%`)
              .limit(8),
      ]);
      const innerIds = new Set((innerData ?? []).map((r) => r.id));
      const rows = [...(innerData ?? []), ...(outerData ?? []).filter((r) => !innerIds.has(r.id))];

      // Same title can exist on more than one board/project (e.g. a
      // repeated step across floors/phases) — resolve project + board
      // names so the picker can disambiguate which one a result is.
      const boardIds = Array.from(new Set(rows.map((r) => r.board_id)));
      const projectIds = Array.from(
        new Set(rows.map((r) => r.project_id).filter((id): id is string => !!id)),
      );
      const [{ data: boardRows }, { data: projectRows }] = await Promise.all([
        boardIds.length
          ? supabase.schema("tasks").from("boards").select("id, name, space_id").in("id", boardIds)
          : Promise.resolve({ data: [] as { id: string; name: string; space_id: string }[] }),
        projectIds.length
          ? supabase.from("projects").select("id, name").in("id", projectIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      const boardNameById = new Map((boardRows ?? []).map((b) => [b.id, b.name]));
      const boardSpaceById = new Map((boardRows ?? []).map((b) => [b.id, b.space_id]));
      const projectNameById = new Map((projectRows ?? []).map((p) => [p.id, p.name]));

      setResults(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          boardId: r.board_id,
          spaceId: boardSpaceById.get(r.board_id) ?? "",
          boardName: boardNameById.get(r.board_id) ?? null,
          projectName: r.project_id ? (projectNameById.get(r.project_id) ?? null) : null,
        })),
      );
    }, 300);
  };

  // "Inner" = same space as the current task — dependencies overwhelmingly
  // link tasks on the same board or at least the same space (e.g. a
  // contractor's board and the engineer's board under one project space),
  // so that's what "nearby" means here, not "same project" (too broad —
  // a big project spans many unrelated spaces). Same board always implies
  // same space, so this one check already covers both. Inner results
  // always sort first; the two are only split into labeled groups when a
  // search actually turns up something on both sides — a search that
  // only hits one side stays a single plain list.
  const isInner = (r: SearchResult) => r.spaceId === spaceId;
  const innerResults = results.filter(isInner);
  const outerResults = results.filter((r) => !isInner(r));

  const renderResult = (r: SearchResult) => (
    <button
      key={r.id}
      onClick={() => {
        onAdd(r.id, direction);
        setOpen(false);
        setSearch("");
        setResults([]);
      }}
      className="block w-full rounded px-2 py-1 text-right hover:bg-gray-50"
    >
      <div className="truncate text-sm text-gray-900">{r.title}</div>
      {(r.projectName || r.boardName) && (
        <div className="truncate text-[11px] text-gray-400">
          {[r.projectName, r.boardName].filter(Boolean).join(" · ")}
        </div>
      )}
    </button>
  );

  return (
    <div className="space-y-3">
      {blocking.length > 0 && (
        <div>
          <GroupHeader direction="blockedBy" />
          <div className="space-y-1">
            {blocking.map((t) => (
              <DependencyRow
                key={t.dependencyId}
                item={t}
                direction="blockedBy"
                active={t.statusCategory !== "done" && t.statusCategory !== "closed"}
                onRemove={onRemove}
              />
            ))}
          </div>
        </div>
      )}
      {blockedByMe.length > 0 && (
        <div>
          <GroupHeader direction="blocks" />
          <div className="space-y-1">
            {blockedByMe.map((t) => (
              <DependencyRow key={t.dependencyId} item={t} direction="blocks" active={!selfDone} onRemove={onRemove} />
            ))}
          </div>
        </div>
      )}

      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
        >
          <Plus className="h-3.5 w-3.5" />
          إضافة اعتمادية
        </button>

        <AnchoredMenu open={open} onClose={() => setOpen(false)} anchorRef={ref} width={288} className="p-2">
            <div className="mb-2">
              <DirectionToggle value={direction} onChange={setDirection} />
            </div>
            <input
              autoFocus
              value={search}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="ابحث عن مهمة..."
              className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none"
            />
            <div className="mt-1 max-h-48 overflow-y-auto">
              {innerResults.length > 0 && outerResults.length > 0 ? (
                <>
                  <div className="px-2 pt-1 text-[10px] font-semibold text-gray-400">من نفس اللوحة أو المساحة</div>
                  {innerResults.map(renderResult)}
                  <div className="mt-1.5 border-t border-gray-100 px-2 pt-1.5 text-[10px] font-semibold text-gray-400">
                    نتائج أخرى
                  </div>
                  {outerResults.map(renderResult)}
                </>
              ) : (
                results.map(renderResult)
              )}
            </div>
        </AnchoredMenu>
      </div>
    </div>
  );
}
