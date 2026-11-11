import { useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Folder, LayoutGrid } from "lucide-react";
import { useTasksSidebar, type BoardWithCount } from "../../../hooks/tasks/useTasksSidebar";
import { useClickOutside } from "../../../hooks/tasks/useClickOutside";

// Jump to another board of the same space from the board header.
// Supports quick prev/next navigation arrows and dropdown list.
interface BoardSwitcherProps {
  spaceId: string;
  currentBoardId: string;
  /** Keep the user on the same view (list / gantt / flow / types) after switching. */
  view: "list" | "gantt" | "flow" | "types";
}

const bySortOrder = (a: BoardWithCount, b: BoardWithCount) =>
  a.board.sort_order - b.board.sort_order || a.board.name.localeCompare(b.board.name);

export default function BoardSwitcher({ spaceId, currentBoardId, view }: BoardSwitcherProps) {
  const navigate = useNavigate();
  const { data } = useTasksSidebar();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const { groups, flatBoards, currentIndex } = useMemo(() => {
    if (!data) return { groups: [], flatBoards: [], currentIndex: -1 };
    for (const nodes of Object.values(data.spacesByType)) {
      const node = nodes.find((n) => n.space.id === spaceId);
      if (!node) continue;
      const result: { key: string; label: string | null; boards: BoardWithCount[] }[] = [];
      if (node.boards.length > 0) {
        result.push({ key: "root", label: null, boards: [...node.boards].sort(bySortOrder) });
      }
      for (const f of [...node.folders].sort((a, b) => a.folder.sort_order - b.folder.sort_order)) {
        if (f.boards.length > 0) {
          result.push({ key: f.folder.id, label: f.folder.name, boards: [...f.boards].sort(bySortOrder) });
        }
      }
      const flat = result.flatMap((g) => g.boards);
      const idx = flat.findIndex((b) => b.board.id === currentBoardId);
      return { groups: result, flatBoards: flat, currentIndex: idx };
    }
    return { groups: [], flatBoards: [], currentIndex: -1 };
  }, [data, spaceId, currentBoardId]);

  const boardCount = flatBoards.length;
  if (boardCount < 2 || currentIndex === -1) return null;

  const currentBoardItem = flatBoards[currentIndex];

  const go = (boardId: string) => {
    setOpen(false);
    if (boardId === currentBoardId) return;
    navigate(`/tasks/board/${boardId}${view === "list" ? "" : `/${view}`}`);
  };

  const goNext = () => {
    // In RTL: Next is left index or +1
    if (currentIndex < boardCount - 1) {
      go(flatBoards[currentIndex + 1].board.id);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      go(flatBoards[currentIndex - 1].board.id);
    }
  };

  return (
    <div ref={ref} className="relative flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs">
      {/* Return to Space / All Zones Button */}
      <Link
        to={`/tasks/space/${spaceId}`}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        title="الرجوع إلى عرض كل المناطق في المساحة"
      >
        <LayoutGrid className="h-3.5 w-3.5 text-slate-400" />
        <span className="hidden sm:inline">كل المناطق</span>
      </Link>

      <span className="h-3.5 w-px bg-slate-200" />

      {/* Prev Arrow (In RTL: right arrow moves to previous in sequence) */}
      <button
        onClick={goPrev}
        disabled={currentIndex === 0}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        title={currentIndex > 0 ? `المنطقة السابقة: ${flatBoards[currentIndex - 1].board.name}` : "أول منطقة"}
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Current Board & Dropdown trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors"
        title="اختيار منطقة أخرى من القائمة"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="max-w-[120px] truncate sm:max-w-[160px]">{currentBoardItem.board.name}</span>
        <span className="text-[11px] font-medium text-slate-400">
          ({currentIndex + 1}/{boardCount})
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Next Arrow (In RTL: left arrow moves forward in sequence) */}
      <button
        onClick={goNext}
        disabled={currentIndex === boardCount - 1}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        title={currentIndex < boardCount - 1 ? `المنطقة التالية: ${flatBoards[currentIndex + 1].board.name}` : "آخر منطقة"}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-40 mt-1 max-h-80 w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>لوحات ومناطق المساحة</span>
            <span>{boardCount} مناطق</span>
          </div>

          <Link
            to={`/tasks/space/${spaceId}`}
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-right text-xs font-bold text-primary hover:bg-primary-superLight border-b border-slate-100 transition-colors"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>عرض كل المناطق (نظرة شاملة)</span>
          </Link>

          {groups.map((group) => (
            <div key={group.key} className="py-1">
              {group.label && (
                <div className="flex items-center gap-1.5 px-3 pb-1 pt-1.5 text-xs font-medium text-slate-400">
                  <Folder className="h-3 w-3" />
                  <span className="truncate">{group.label}</span>
                </div>
              )}
              {group.boards.map(({ board, openCount, zoneName }) => {
                const active = board.id === currentBoardId;
                return (
                  <button
                    key={board.id}
                    role="option"
                    aria-selected={active}
                    onClick={() => go(board.id)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-right text-sm transition-colors ${
                      active ? "bg-primary-superLight font-bold text-primary" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex-1 truncate">
                      {board.name}
                      {zoneName && zoneName !== board.name && (
                        <span className="mr-1.5 text-xs font-normal text-slate-400">{zoneName}</span>
                      )}
                    </span>
                    {active ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                      openCount > 0 && <span className="shrink-0 text-xs font-medium text-slate-400">{openCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
