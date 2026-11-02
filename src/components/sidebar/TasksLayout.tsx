import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Building2,
  Building,
  User,
  Layers,
  ListTodo,
  Users,
  UserCog,
  Shapes,
  Loader2,
  FileStack,
  Tag,
  Trophy,
  LayoutDashboard,
  History,
  Plus,
  AlertTriangle,
  X,
} from "lucide-react";
import { useSidebar } from "../../contexts/SidebarContext";
import { supabase } from "../../lib/supabaseClient";
import { useTasksSidebar, type SpaceType } from "../../hooks/tasks/useTasksSidebar";
import { setTaskErrorListener } from "../../hooks/tasks/taskErrorBus";
import { searchSidebarEntities, type EntityMatches } from "../../hooks/tasks/tasksSidebarSearch";
import Tooltip from "../ui/Tooltip";
import NewSpaceModal from "./NewSpaceModal";
import { useMyTaskAccess } from "../../hooks/tasks/useTaskAccess";
import { useCan } from "../../hooks/permissions/useCan";
import { useTaskUndoHotkeys } from "../../hooks/tasks/useTaskUndoHotkeys";
import TaskUndoToast from "../tasks/TaskUndoToast";
import { CreateTaskDialogProvider } from "../tasks/schedule/CreateTaskDialogContext";

// Mutation errors anywhere in this module are toasted by <TaskErrorToast/>.
// The MutationCache hook that feeds it lives on the app's QueryClient
// (src/lib/queryClient.ts) — this module used to own a second client for
// that, which kept every task screen out of the persisted cache.

function TaskErrorToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setTaskErrorListener(setMessage);
    return () => setTaskErrorListener(null);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] w-full max-w-sm -translate-x-1/2 px-4" dir="rtl">
      <div className="flex items-start gap-2 rounded-lg bg-red-600 px-3.5 py-2.5 text-sm text-white shadow-2xl">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="flex-1">{message}</span>
        <button onClick={() => setMessage(null)} className="shrink-0 rounded p-0.5 hover:bg-white/20">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// D1 — persistent Tasks sidebar (tasks/task-module-build-plan.md, Part 7).
// Spaces grouped by type, each expandable to folders/boards with an open
// count; department shortcuts; "My work"; a search box that finds spaces
// and boards (instantly, from the loaded tree) and tasks (server query).
//
// Bespoke markup rather than the shared SidebarLayout — same call as
// BookkeeperLayout: the content here is a dynamic, expandable tree with
// live counts and search, not a static NavItem[] menu.
//
// Every destination below (board, department, my-work, a search hit)
// currently lands on TasksPage's placeholder — D2/D6/D7/D3 haven't been
// built yet. That's intentional, same as the main-menu card landing on
// a placeholder before this sidebar existed.
// =====================================================================

const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  project: "مساحات المشاريع",
  department: "مساحات الأقسام",
  company: "مساحات الشركة",
  personal: "مساحتي الخاصة",
};

const SPACE_TYPE_ICONS: Record<SpaceType, typeof FolderKanban> = {
  project: FolderKanban,
  department: Building2,
  company: Building,
  personal: User,
};

interface SearchHit {
  id: string;
  title: string;
  boardName: string;
  spaceName: string;
  spaceColor: string | null;
}

// A space's colour tints its search rows the same way it tinted the old
// sidebar tree: a faint background, with the icon and name in the colour.
const tint = (color: string | null) => (color ? { backgroundColor: `${color}1A` } : undefined);

const SEARCH_MIN_CHARS = 2;
// Spaces and boards come from the already-loaded sidebar data, so there's
// no cost to finding more — the caps just keep the dropdown from becoming
// a wall that pushes the task hits out of view.
const MAX_SPACE_HITS = 5;
const MAX_BOARD_HITS = 8;

function SearchSectionTitle({ children }: { children: string }) {
  return <div className="bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-400">{children}</div>;
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="min-w-[1.25rem] rounded-full bg-slate-200 px-1.5 text-center text-xs font-medium text-slate-600">
      {count}
    </span>
  );
}

const TasksLayoutInner = () => {
  const { isCollapsed, toggle } = useSidebar();
  const { data, loading } = useTasksSidebar();
  const { access } = useMyTaskAccess();
  // The cross-space browsing views (by employee / type / project, departments)
  // only make sense for someone who can see more than their own tasks.
  const canBrowse = !!access && (access.view_all || Object.keys(access.spaces).length > 0);
  const { can: canSeePerformance } = useCan("view_task_performance");
  const { can: canSeeDashboard } = useCan("view_task_dashboard");
  const { can: canSeeTaskLog } = useCan("view_task_logs");
  const navigate = useNavigate();
  const [showNewSpace, setShowNewSpace] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<number | null>(null);

  // board_id -> { boardName, spaceName }, flattened once per sidebar fetch,
  // used only to decorate search hits (which come back as bare rows).
  const boardContext = useMemo(() => {
    const map = new Map<string, { boardName: string; spaceName: string; spaceColor: string | null }>();
    if (!data) return map;
    for (const nodes of Object.values(data.spacesByType)) {
      for (const node of nodes) {
        const allBoards = [
          ...node.boards,
          ...node.folders.flatMap((f) => f.boards),
        ];
        for (const b of allBoards) {
          map.set(b.board.id, {
            boardName: b.board.name,
            spaceName: node.space.name,
            spaceColor: node.space.color,
          });
        }
      }
    }
    return map;
  }, [data]);

  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);

    const term = searchInput.trim();
    if (term.length < SEARCH_MIN_CHARS || boardContext.size === 0) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimer.current = window.setTimeout(async () => {
      const boardIds = Array.from(boardContext.keys());
      const { data: rows, error } = await supabase
        .schema("tasks")
        .from("tasks")
        .select("id, title, board_id")
        .in("board_id", boardIds)
        .eq("is_archived", false)
        .ilike("title", `%${term}%`)
        .limit(8);

      if (!error) {
        setSearchResults(
          (rows ?? []).map((row) => ({
            id: row.id,
            title: row.title,
            boardName: boardContext.get(row.board_id)?.boardName ?? "",
            spaceName: boardContext.get(row.board_id)?.spaceName ?? "",
            spaceColor: boardContext.get(row.board_id)?.spaceColor ?? null,
          })),
        );
      }
      setSearching(false);
    }, 300);

    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [searchInput, boardContext]);

  const searchActive = searchInput.trim().length >= SEARCH_MIN_CHARS;
  const entityMatches = useMemo<EntityMatches>(
    () => (data && searchActive ? searchSidebarEntities(data, searchInput) : { spaces: [], boards: [] }),
    [data, searchInput, searchActive],
  );
  const spaceHits = entityMatches.spaces.slice(0, MAX_SPACE_HITS);
  const boardHits = entityMatches.boards.slice(0, MAX_BOARD_HITS);
  const hasAnyHit = spaceHits.length + boardHits.length + searchResults.length > 0;

  const goTo = (path: string) => {
    setSearchInput("");
    setSearchResults([]);
    navigate(path);
  };

  if (isCollapsed) {
    return (
      <div className="flex h-[calc(100vh-64px)] bg-gray-50">
        <aside className="fixed right-0 top-16 bottom-0 flex w-20 flex-col items-center gap-2 border-l border-gray-200 bg-white py-4">
          <Tooltip label="توسيع القائمة" side="left">
            <button onClick={toggle} className="rounded-full p-2 hover:bg-gray-100">
              <ChevronLeft className="h-5 w-5 text-gray-600" />
            </button>
          </Tooltip>
          <Tooltip label="المهام" side="left">
            <Link to="/tasks" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
              <ListTodo className="h-5 w-5" />
            </Link>
          </Tooltip>
          <Tooltip label="أعمالي" side="left">
            <Link to="/tasks/my-work" className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100">
              <Users className="h-5 w-5" />
              {!!data?.myWorkCount && (
                <span className="absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" />
              )}
            </Link>
          </Tooltip>
          <Tooltip label="حسب الموظف" side="left">
            <Link to="/tasks/by-assignee" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
              <UserCog className="h-5 w-5" />
            </Link>
          </Tooltip>
          <Tooltip label="حسب نوع المهمة" side="left">
            <Link to="/tasks/by-type" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
              <Shapes className="h-5 w-5" />
            </Link>
          </Tooltip>
          <Tooltip label="حسب المشروع" side="left">
            <Link to="/tasks/by-project" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
              <FolderKanban className="h-5 w-5" />
            </Link>
          </Tooltip>
          {canSeeDashboard && (
            <Tooltip label="لوحة المعلومات" side="left">
              <Link to="/tasks/dashboard" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
                <LayoutDashboard className="h-5 w-5" />
              </Link>
            </Tooltip>
          )}
          {canSeePerformance && (
            <Tooltip label="أداء المهام" side="left">
              <Link to="/tasks/performance" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
                <Trophy className="h-5 w-5" />
              </Link>
            </Tooltip>
          )}
          {canSeeTaskLog && (
            <Tooltip label="سجل المهام" side="left">
              <Link to="/tasks/activity" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
                <History className="h-5 w-5" />
              </Link>
            </Tooltip>
          )}
        </aside>
        <main className="mr-20 flex-1 overflow-y-auto scrollbar-hide">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-50">
      <aside className="fixed right-0 top-16 bottom-0 flex w-72 flex-col border-l border-gray-200 bg-white">
        <div className="relative flex-shrink-0 border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900">المهام</h2>
          <p className="mt-1 text-sm text-gray-500">
            المساحات، اللوحات، وأعمالي
          </p>
          {access?.can_create_space && (
            <button
              onClick={() => setShowNewSpace(true)}
              className="mt-2 flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              <Plus className="h-3 w-3" />
              مساحة جديدة
            </button>
          )}
          <button
            onClick={toggle}
            className="absolute top-4 left-4 rounded-full p-1 hover:bg-gray-100"
            title="طي القائمة"
          >
            <ChevronRight className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* Search — spaces, boards and tasks */}
        <div className="relative flex-shrink-0 p-3">
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ابحث في المساحات واللوحات والمهام..."
              className="w-full bg-transparent text-sm outline-none"
              aria-label="بحث في المساحات واللوحات والمهام"
            />
            {searching && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
            )}
          </div>

          {searchActive && (
            <div className="absolute right-3 left-3 z-20 mt-1 max-h-80 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {!hasAnyHit && !searching ? (
                <div className="p-3 text-sm text-gray-400">لا توجد نتائج</div>
              ) : (
                <>
                  {spaceHits.length > 0 && (
                    <>
                      <SearchSectionTitle>المساحات</SearchSectionTitle>
                      {spaceHits.map((node) => {
                        const SpaceIcon = SPACE_TYPE_ICONS[node.space.space_type];
                        const showProject = !!node.projectName && node.projectName !== node.space.name;
                        return (
                          <button
                            key={`space-${node.space.id}`}
                            onClick={() => goTo(`/tasks/space/${node.space.id}`)}
                            style={tint(node.space.color)}
                            className={`flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-right ${node.space.color ? "" : "hover:bg-gray-50"}`}
                          >
                            <SpaceIcon
                              className="h-4 w-4 shrink-0 text-gray-400"
                              style={node.space.color ? { color: node.space.color } : undefined}
                            />
                            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                              <span
                                className="w-full truncate text-sm font-medium text-gray-800"
                                style={node.space.color ? { color: node.space.color } : undefined}
                              >
                                {node.space.name}
                              </span>
                              <span className="w-full truncate text-xs text-gray-400">
                                {SPACE_TYPE_LABELS[node.space.space_type]}
                                {showProject && ` · ${node.projectName}`}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </>
                  )}
                  {boardHits.length > 0 && (
                    <>
                      <SearchSectionTitle>اللوحات</SearchSectionTitle>
                      {boardHits.map(({ board, space }) => (
                        <button
                          key={`board-${board.board.id}`}
                          onClick={() => goTo(`/tasks/board/${board.board.id}`)}
                          style={tint(space.space.color)}
                          className={`flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-right ${space.space.color ? "" : "hover:bg-gray-50"}`}
                        >
                          <Layers
                            className="h-4 w-4 shrink-0 text-gray-400"
                            style={space.space.color ? { color: space.space.color } : undefined}
                          />
                          <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                            <span className="w-full truncate text-sm font-medium text-gray-800">
                              {board.board.name}
                              {board.zoneName && <span className="text-xs font-normal text-gray-400"> ({board.zoneName})</span>}
                            </span>
                            <span
                              className="w-full truncate text-xs text-gray-400"
                              style={space.space.color ? { color: space.space.color } : undefined}
                            >
                              {space.space.name}
                            </span>
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                  {searchResults.length > 0 && (
                    <>
                      <SearchSectionTitle>المهام</SearchSectionTitle>
                      {searchResults.map((hit) => (
                        <button
                          key={hit.id}
                          onClick={() => goTo(`/tasks/task/${hit.id}`)}
                          style={tint(hit.spaceColor)}
                          className={`flex w-full flex-col items-start gap-0.5 border-b border-gray-100 px-3 py-2 text-right last:border-b-0 ${hit.spaceColor ? "" : "hover:bg-gray-50"}`}
                        >
                          <span className="truncate text-sm font-medium text-gray-800">
                            {hit.title}
                          </span>
                          <span className="truncate text-xs text-gray-400">
                            <span style={hit.spaceColor ? { color: hit.spaceColor } : undefined}>{hit.spaceName}</span>
                            {" · "}
                            {hit.boardName}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-3 scrollbar-hide">
          {loading ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-7 animate-pulse rounded-md bg-slate-100" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-1 border-t border-gray-100 pt-3">
                <Link
                  to="/tasks/my-work"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100"
                >
                  <Users className="h-4 w-4 shrink-0 text-gray-500" />
                  <span className="flex-1 truncate">أعمالي</span>
                  <CountBadge count={data?.myWorkCount ?? 0} />
                </Link>
                {canBrowse && (<>
                <Link
                  to="/tasks/by-assignee"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                >
                  <UserCog className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="flex-1 truncate">حسب الموظف</span>
                </Link>
                <Link
                  to="/tasks/by-type"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                >
                  <Shapes className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="flex-1 truncate">حسب نوع المهمة</span>
                </Link>
                <Link
                  to="/tasks/by-project"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                >
                  <FolderKanban className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="flex-1 truncate">حسب المشروع</span>
                </Link>
                </>)}
                {canSeeDashboard && (
                  <Link
                    to="/tasks/dashboard"
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                  >
                    <LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="flex-1 truncate">لوحة المعلومات</span>
                  </Link>
                )}
                {canSeePerformance && (
                  <Link
                    to="/tasks/performance"
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                  >
                    <Trophy className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="flex-1 truncate">أداء المهام</span>
                  </Link>
                )}
                {canSeeTaskLog && (
                  <Link
                    to="/tasks/activity"
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                  >
                    <History className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="flex-1 truncate">سجل المهام</span>
                  </Link>
                )}
              </div>

              {access?.edit_all && (
              <div className="space-y-1 border-t border-gray-100 pt-3">
                <div className="px-2 text-xs font-semibold text-gray-400">الإدارة</div>
                <Link
                  to="/tasks/admin/templates"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                >
                  <FileStack className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="flex-1 truncate">القوالب</span>
                </Link>
                <Link
                  to="/tasks/admin/fields"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                >
                  <Tag className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="flex-1 truncate">الحقول والوسوم وأنواع المهام</span>
                </Link>
              </div>
              )}
            </>
          )}
        </div>
      </aside>

      <main className="mr-72 flex-1 overflow-y-auto scrollbar-hide">
        <Outlet />
      </main>

      {showNewSpace && <NewSpaceModal onClose={() => setShowNewSpace(false)} />}
    </div>
  );
};

// Undo hotkeys + toast for the task module.
function TaskUndoHost() {
  useTaskUndoHotkeys();
  return <TaskUndoToast />;
}

const TasksLayout = () => (
  <>
    <CreateTaskDialogProvider>
      <TasksLayoutInner />
    </CreateTaskDialogProvider>
    <TaskErrorToast />
    <TaskUndoHost />
  </>
);

export default TasksLayout;
