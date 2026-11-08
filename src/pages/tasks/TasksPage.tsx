import { useMemo, useState, useRef, useEffect, type ComponentType, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  Users,
  UserCog,
  Building2,
  FolderKanban,
  Building,
  User,
  Search,
  X,
  Layers,
  Plus,
  Settings,
  LayoutGrid,
  List,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ArrowLeft,
  ChevronLeft,
  Filter,
  Check,
} from "lucide-react";
import {
  useTasksSidebar,
  type BoardWithCount,
  type SpaceNode,
  type SpaceType,
} from "../../hooks/tasks/useTasksSidebar";
import { useTaskDirectory } from "../../hooks/tasks/useTaskDirectory";
import { matchSpaceNode, searchSidebarEntities } from "../../hooks/tasks/tasksSidebarSearch";
import { useMyTaskAccess, useSpaceCaps } from "../../hooks/tasks/useTaskAccess";
import NewBoardModal from "../../components/sidebar/NewBoardModal";
import { SpaceCardsPageSkeleton } from "../../components/tasks/TasksSkeletons";

type SpacesLayout = "cards" | "list";
type FilterMode = "all" | "overdue" | "active" | "completed";

const LAYOUT_STORAGE_KEY = "tasks.spacesLayout";

function loadLayout(): SpacesLayout {
  try {
    return localStorage.getItem(LAYOUT_STORAGE_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

function saveLayout(layout: SpacesLayout) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  } catch {
    // storage unavailable
  }
}

const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  project: "مساحات المشاريع",
  department: "مساحات الأقسام",
  company: "مساحات الشركة",
  personal: "مساحتي الخاصة",
};

const SPACE_TYPE_ORDER: SpaceType[] = ["project", "department", "company", "personal"];
const SPACE_TYPE_ICONS: Record<SpaceType, typeof FolderKanban> = {
  project: FolderKanban,
  department: Building2,
  company: Building,
  personal: User,
};

function ViewCard({
  to,
  icon: Icon,
  label,
  subtitle,
  badge,
}: {
  to: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  subtitle: string;
  badge?: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group relative flex items-center gap-4 rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary-superLight/20 hover:shadow-md"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-superLight text-primary transition-transform duration-200 group-hover:scale-105">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-gray-800 group-hover:text-primary transition-colors">
          {label}
        </div>
        <div className="truncate text-xs text-gray-500 mt-0.5">{subtitle}</div>
      </div>
      {badge}
      <ChevronLeft className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-primary transition-colors" />
    </Link>
  );
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
      {count} مفتوحة
    </span>
  );
}

function LayoutToggle({
  value,
  onChange,
}: {
  value: SpacesLayout;
  onChange: (layout: SpacesLayout) => void;
}) {
  const options: { layout: SpacesLayout; icon: typeof LayoutGrid; label: string }[] = [
    { layout: "cards", icon: LayoutGrid, label: "عرض كبطاقات مربعة" },
    { layout: "list", icon: List, label: "عرض جدولي" },
  ];
  return (
    <div
      className="flex shrink-0 items-center rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm"
      role="group"
      aria-label="طريقة عرض المساحات"
    >
      {options.map(({ layout, icon: Icon, label }) => (
        <button
          key={layout}
          onClick={() => onChange(layout)}
          aria-pressed={value === layout}
          title={label}
          aria-label={label}
          className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5 ${
            value === layout
              ? "bg-primary-superLight text-primary font-semibold shadow-xs"
              : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          }`}
        >
          <Icon className="h-4 w-4" />
          <span>{layout === "cards" ? "كروت" : "جدول"}</span>
        </button>
      ))}
    </div>
  );
}

/** Modern square card for a single project/space */
function SpaceSquareCard({
  node,
  matchedBoards,
}: {
  node: SpaceNode;
  matchedBoards?: BoardWithCount[];
}) {
  const Icon = SPACE_TYPE_ICONS[node.space.space_type];
  const boardCount = node.boards.length + node.folders.reduce((n, f) => n + f.boards.length, 0);
  const caps = useSpaceCaps(node.space.id);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const hasActions = caps.create || caps.manage;

  const displayName = node.projectName || node.space.name;
  const secondaryName =
    node.projectName && node.projectName !== node.space.name ? node.space.name : null;
  const code = node.projectCode;

  const { totalTasks, openTasks, progress, overdueTasks, delayedStartTasks } = node.stats;
  const boardsLabel = boardCount > 0 ? `${boardCount} مناطق / لوحات` : "لا توجد لوحات بعد";

  return (
    <div className="group relative flex flex-col justify-between rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg">
      <div>
        {/* Top Header Row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <Link
            to={`/tasks/space/${node.space.id}`}
            className="flex items-center gap-3 min-w-0 flex-1"
          >
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-xs transition-transform duration-200 group-hover:scale-105"
              style={
                node.space.color
                  ? { backgroundColor: `${node.space.color}15`, color: node.space.color }
                  : { backgroundColor: "#f1f5f9", color: "#334155" }
              }
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="truncate text-base font-bold text-gray-900 group-hover:text-primary transition-colors">
                  {displayName}
                </h3>
                {code && (
                  <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                    #{code}
                  </span>
                )}
              </div>
              {secondaryName && (
                <div className="truncate text-xs text-gray-400 mt-0.5">{secondaryName}</div>
              )}
            </div>
          </Link>

          {/* Action buttons (Add Board / Settings) */}
          {hasActions && (
            <div className="flex shrink-0 items-center gap-1">
              {caps.create && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowNewBoard(true);
                  }}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                  title="إضافة لوحة جديدة"
                  aria-label="إضافة لوحة جديدة"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
              {caps.manage && (
                <Link
                  to={`/tasks/space/${node.space.id}/settings`}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                  title="إعدادات المساحة"
                  aria-label="إعدادات المساحة"
                >
                  <Settings className="h-4 w-4" />
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Progress Bar Section */}
        <Link to={`/tasks/space/${node.space.id}`} className="block my-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-gray-500 font-medium">نسبة الإنجاز</span>
            <span className="font-bold text-gray-800">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progress >= 80
                  ? "bg-emerald-500"
                  : progress >= 40
                  ? "bg-primary"
                  : progress > 0
                  ? "bg-amber-500"
                  : "bg-transparent"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </Link>
      </div>

      {/* Bottom Metrics & Alerts */}
      <div>
        <Link
          to={`/tasks/space/${node.space.id}`}
          className="mt-3 flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100"
        >
          <div className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-gray-400" />
            <span>{boardsLabel}</span>
          </div>
          <div>
            <span className="font-bold text-gray-800">{openTasks}</span> مفتوحة
            {totalTasks > 0 && <span className="text-gray-400"> من {totalTasks}</span>}
          </div>
        </Link>

        {/* Warning/Alert Badges */}
        {(overdueTasks > 0 || delayedStartTasks > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 pt-2 border-t border-dashed border-gray-100">
            {overdueTasks > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200/60">
                <AlertTriangle className="h-3 w-3 shrink-0 text-rose-500" />
                <span>{overdueTasks} متأخرة</span>
              </span>
            )}
            {delayedStartTasks > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200/60">
                <Clock className="h-3 w-3 shrink-0 text-amber-500" />
                <span>{delayedStartTasks} لم تبدأ</span>
              </span>
            )}
          </div>
        )}

        {/* Matched boards list (if searching) */}
        {!!matchedBoards?.length && (
          <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-2 border border-slate-100">
            <div className="text-[11px] font-semibold text-slate-500 mb-1">اللوحات المطابقة:</div>
            {matchedBoards.map((b) => (
              <Link
                key={b.board.id}
                to={`/tasks/board/${b.board.id}`}
                className="flex items-center justify-between rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-white hover:shadow-xs transition-colors"
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <Layers className="h-3 w-3 shrink-0 text-slate-400" />
                  <span className="truncate font-medium">{b.board.name}</span>
                  {b.zoneName && (
                    <span className="shrink-0 text-[10px] text-slate-400">({b.zoneName})</span>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-slate-200/70 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                  {b.openCount} مفتوحة
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showNewBoard && (
        <NewBoardModal spaceId={node.space.id} onClose={() => setShowNewBoard(false)} />
      )}
    </div>
  );
}

/** Corporate Table View for projects/spaces */
function SpaceTableView({ nodes }: { nodes: SpaceNode[] }) {
  const navigate = useNavigate();

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-right">
          <thead className="border-b-2 border-slate-200 bg-slate-100/90 text-sm font-bold text-slate-700">
            <tr>
              <th className="py-4 px-5">المشروع / المساحة</th>
              <th className="py-4 px-5">المناطق واللوحات</th>
              <th className="py-4 px-5">المهام المفتوحة</th>
              <th className="py-4 px-5 w-48">نسبة الإنجاز</th>
              <th className="py-4 px-5">حالة التنبيهات</th>
              <th className="py-4 px-5 text-center">الإجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-slate-150">
            {nodes.map((node) => {
              const Icon = SPACE_TYPE_ICONS[node.space.space_type];
              const boardCount =
                node.boards.length + node.folders.reduce((n, f) => n + f.boards.length, 0);
              const displayName = node.projectName || node.space.name;
              const secondaryName =
                node.projectName && node.projectName !== node.space.name ? node.space.name : null;
              const { totalTasks, openTasks, progress, overdueTasks, delayedStartTasks } =
                node.stats;

              return (
                <tr
                  key={node.space.id}
                  onClick={() => navigate(`/tasks/space/${node.space.id}`)}
                  className="group cursor-pointer border-b border-slate-200 transition-colors hover:bg-blue-50/40 even:bg-slate-50/40"
                >
                  {/* Name & Code */}
                  <td className="py-4 px-5">
                    <div className="flex items-center gap-3.5">
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-xs transition-transform duration-150 group-hover:scale-105"
                        style={
                          node.space.color
                            ? { backgroundColor: `${node.space.color}18`, color: node.space.color }
                            : { backgroundColor: "#f1f5f9", color: "#334155" }
                        }
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-bold text-slate-900 group-hover:text-primary transition-colors">
                            {displayName}
                          </span>
                          {node.projectCode && (
                            <span className="rounded-md border border-slate-200/80 bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                              #{node.projectCode}
                            </span>
                          )}
                        </div>
                        {secondaryName && (
                          <div className="text-xs text-slate-400 mt-0.5">{secondaryName}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Boards */}
                  <td className="py-4 px-5">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Layers className="h-4 w-4 text-slate-400" />
                      <span>{boardCount} مناطق</span>
                    </span>
                  </td>

                  {/* Tasks count */}
                  <td className="py-4 px-5">
                    <div className="text-sm text-slate-600">
                      <span className="text-base font-bold text-slate-900">{openTasks}</span> مفتوحة
                      {totalTasks > 0 && (
                        <span className="text-slate-400 font-medium"> من {totalTasks}</span>
                      )}
                    </div>
                  </td>

                  {/* Progress */}
                  <td className="py-4 px-5">
                    <div className="flex items-center gap-3">
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200/70">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            progress >= 80
                              ? "bg-emerald-500"
                              : progress >= 40
                              ? "bg-primary"
                              : progress > 0
                              ? "bg-amber-500"
                              : "bg-transparent"
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="w-10 text-sm font-bold text-slate-800 text-left">
                        {progress}%
                      </span>
                    </div>
                  </td>

                  {/* Alerts */}
                  <td className="py-4 px-5">
                    {overdueTasks > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 shadow-2xs">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                        <span>{overdueTasks} متأخرة</span>
                      </span>
                    ) : delayedStartTasks > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 shadow-2xs">
                        <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span>{delayedStartTasks} لم تبدأ</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 shadow-2xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>منتظم</span>
                      </span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="py-4 px-5 text-center">
                    <Link
                      to={`/tasks/space/${node.space.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3.5 py-1.5 text-xs font-bold text-slate-700 transition-all group-hover:border-primary group-hover:bg-primary group-hover:text-white group-hover:shadow-xs"
                    >
                      <span>عرض</span>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const { data, loading } = useTasksSidebar();
  const { access } = useMyTaskAccess();
  // Pre-warm directory views in the background
  useTaskDirectory();

  const [search, setSearch] = useState("");
  const searching = search.trim().length > 0;
  const [layout, setLayout] = useState<SpacesLayout>(loadLayout);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const changeLayout = (next: SpacesLayout) => {
    setLayout(next);
    saveLayout(next);
  };

  // Close autocomplete dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const onlyOwnTasks = !!access && !access.view_all && Object.keys(access.spaces).length === 0;

  // Real-time Autocomplete suggestions
  const autocompleteResults = useMemo(() => {
    if (!data || !searching) return { spaces: [], boards: [] };
    const matches = searchSidebarEntities(data, search);
    return {
      spaces: matches.spaces.slice(0, 5),
      boards: matches.boards.slice(0, 5),
    };
  }, [data, search, searching]);

  // Search results grouped by space type
  const searchGroups = useMemo(() => {
    if (!data || !searching) return [];
    return SPACE_TYPE_ORDER.map((type) => ({
      type,
      results: data.spacesByType[type].flatMap((node) => {
        const match = matchSpaceNode(node, search);
        return match ? [{ node, boards: match.boards }] : [];
      }),
    })).filter((g) => g.results.length > 0);
  }, [data, search, searching]);

  // Filtered spaces by active filterMode
  const filterNode = (node: SpaceNode) => {
    if (filterMode === "overdue") {
      return node.stats.overdueTasks > 0 || node.stats.delayedStartTasks > 0;
    }
    if (filterMode === "active") {
      return node.stats.openTasks > 0;
    }
    if (filterMode === "completed") {
      return node.stats.progress === 100 && node.stats.totalTasks > 0;
    }
    return true;
  };

  const canBrowse = !!access && (access.view_all || Object.keys(access.spaces).length > 0);

  const spaceGroups = useMemo(() => {
    if (!data) return [];
    return SPACE_TYPE_ORDER.map((type) => ({
      type,
      nodes: data.spacesByType[type]
        .filter((n) => !!access?.spaces[n.space.id])
        .filter(filterNode),
    })).filter((g) => g.nodes.length > 0);
  }, [data, access, filterMode]);

  // Aggregate stats across all visible spaces for quick filter counts
  const filterCounts = useMemo(() => {
    if (!data) return { all: 0, overdue: 0, active: 0, completed: 0 };
    const allVisible = Object.values(data.spacesByType)
      .flat()
      .filter((n) => !!access?.spaces[n.space.id]);

    let overdue = 0;
    let active = 0;
    let completed = 0;

    for (const node of allVisible) {
      if (node.stats.overdueTasks > 0 || node.stats.delayedStartTasks > 0) overdue++;
      if (node.stats.openTasks > 0) active++;
      if (node.stats.progress === 100 && node.stats.totalTasks > 0) completed++;
    }

    return {
      all: allVisible.length,
      overdue,
      active,
      completed,
    };
  }, [data, access]);

  if (onlyOwnTasks) return <Navigate to="/tasks/my-work" replace />;
  if (loading) {
    return <SpaceCardsPageSkeleton />;
  }

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8" dir="rtl">
      {/* Top Header & Search Bar */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span>إدارة المهام والمشاريع</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {filterCounts.all} مساحة
            </span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            متابعة إنجاز مشاريع الشركة ومناطق العمل والمهام اليومية
          </p>
        </div>

        {/* Search & Layout Toggle */}
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          {/* Autocomplete Search Container */}
          <div ref={searchContainerRef} className="relative flex-1 md:w-80">
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-xs transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
              <Search className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                type="search"
                value={search}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setIsSearchFocused(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setIsSearchFocused(false);
                }}
                placeholder="ابحث بالمشروع أو الكود أو اللوحة..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
                aria-label="بحث بالمشروع أو الكود أو اللوحة"
              />
              {searching && (
                <button
                  onClick={() => setSearch("")}
                  className="shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="مسح البحث"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Smart Autocomplete Dropdown */}
            {isSearchFocused && searching && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                {autocompleteResults.spaces.length === 0 &&
                autocompleteResults.boards.length === 0 ? (
                  <div className="py-4 text-center text-xs text-gray-400">
                    لا توجد نتائج مطابقة لبحثك
                  </div>
                ) : (
                  <>
                    {autocompleteResults.spaces.length > 0 && (
                      <div className="mb-2">
                        <div className="px-2 py-1 text-[11px] font-semibold text-gray-400">
                          المشاريع والمساحات
                        </div>
                        {autocompleteResults.spaces.map((node) => (
                          <Link
                            key={node.space.id}
                            to={`/tasks/space/${node.space.id}`}
                            onClick={() => setIsSearchFocused(false)}
                            className="flex items-center justify-between rounded-lg px-2.5 py-2 hover:bg-primary-superLight/30 transition-colors"
                          >
                            <div className="min-w-0 flex-1 flex items-center gap-2">
                              <span className="font-semibold text-sm text-gray-800 truncate">
                                {node.projectName || node.space.name}
                              </span>
                              {node.projectCode && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                  #{node.projectCode}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-500">
                              {node.stats.openTasks} مفتوحة
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}

                    {autocompleteResults.boards.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-[11px] font-semibold text-gray-400 border-t border-gray-100 pt-1.5">
                          اللوحات والمناطق
                        </div>
                        {autocompleteResults.boards.map(({ board, space }) => (
                          <Link
                            key={board.board.id}
                            to={`/tasks/board/${board.board.id}`}
                            onClick={() => setIsSearchFocused(false)}
                            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-primary-superLight/30 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-gray-800 truncate">
                                {board.board.name}
                              </div>
                              <div className="text-[10px] text-gray-400 truncate">
                                مساحة: {space.projectName || space.space.name}
                                {board.zoneName && ` • منطقة: ${board.zoneName}`}
                              </div>
                            </div>
                            <span className="text-[11px] text-gray-500">
                              {board.openCount} مفتوحة
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Layout Toggle (Cards vs Table) */}
          <LayoutToggle value={layout} onChange={changeLayout} />
        </div>
      </div>

      {/* Quick View Hub (أعمالي & حسب الموظف) */}
      {!searching && (
        <div className="mb-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ViewCard
              to="/tasks/my-work"
              icon={Users}
              label="أعمالي اليومية"
              subtitle="المهام المسندة إليك مباشرة عبر جميع مشاريع الشركة"
              badge={<CountBadge count={data?.myWorkCount ?? 0} />}
            />
            {canBrowse && (
              <ViewCard
                to="/tasks/by-assignee"
                icon={UserCog}
                label="حسب الموظف المسؤول"
                subtitle="استعراض وتوزيع المهام المفتوحة مجمعة بحسب أعضاء الفريق"
              />
            )}
          </div>
        </div>
      )}

      {/* Quick Filter Tabs */}
      {!searching && (
        <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
          <button
            onClick={() => setFilterMode("all")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              filterMode === "all"
                ? "bg-primary text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            كل المشاريع ({filterCounts.all})
          </button>
          <button
            onClick={() => setFilterMode("overdue")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              filterMode === "overdue"
                ? "bg-rose-600 text-white shadow-xs"
                : filterCounts.overdue > 0
                ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>بها متأخرات ({filterCounts.overdue})</span>
          </button>
          <button
            onClick={() => setFilterMode("active")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              filterMode === "active"
                ? "bg-slate-800 text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            قيد العمل ({filterCounts.active})
          </button>
          <button
            onClick={() => setFilterMode("completed")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              filterMode === "completed"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Check className="h-3.5 w-3.5" />
            <span>مكتملة ({filterCounts.completed})</span>
          </button>
        </div>
      )}

      {/* Search results view */}
      {searching && (
        <>
          <div className="mb-3 text-xs font-semibold text-gray-500">نتائج البحث عن "{search}":</div>
          {searchGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-400 bg-white">
              لا توجد مشاريع أو لوحات مطابقة لبحثك
            </div>
          ) : (
            searchGroups.map((group) => (
              <div key={group.type} className="mb-6">
                <div className="mb-3 text-xs font-bold text-gray-600">
                  {SPACE_TYPE_LABELS[group.type]}
                </div>
                {layout === "list" ? (
                  <SpaceTableView nodes={group.results.map((r) => r.node)} />
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.results.map(({ node, boards }) => (
                      <SpaceSquareCard key={node.space.id} node={node} matchedBoards={boards} />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}

      {/* Default Browsing by Space Groups */}
      {!searching && (
        <>
          {spaceGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-400 bg-white">
              {filterMode !== "all"
                ? "لا توجد مشاريع تطابق الفلتر المختار"
                : "لا توجد مساحات مسندة إليك حالياً"}
            </div>
          ) : (
            spaceGroups.map((group) => (
              <div key={group.type} className="mb-8">
                <div className="mb-3.5 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-700">
                    {SPACE_TYPE_LABELS[group.type]}
                  </h2>
                  <span className="text-xs text-gray-400">
                    {group.nodes.length} {group.nodes.length === 1 ? "مساحة" : "مساحات"}
                  </span>
                </div>

                {layout === "list" ? (
                  <SpaceTableView nodes={group.nodes} />
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.nodes.map((node) => (
                      <SpaceSquareCard key={node.space.id} node={node} />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
