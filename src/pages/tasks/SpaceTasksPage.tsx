import { useCallback, useMemo, useState } from "react";
import { useSpaceCaps } from "../../hooks/tasks/useTaskAccess";
import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeftRight,
  ChartGantt,
  FileSignature,
  List,
  Map as MapIcon,
  Plus,
  Presentation,
  Ruler,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Layers,
  ChevronLeft,
  RotateCcw,
  ExternalLink,
  Zap,
} from "lucide-react";
import {
  DirectoryColumnProvider,
  useDirectoryColumns,
  ResizableColumnHeader,
} from "../../components/tasks/board/DirectoryColumnContext";
import { useTaskDirectory } from "../../hooks/tasks/useTaskDirectory";
import { useDependencyEdit } from "../../hooks/tasks/dependencyEdit";
import { useTasksSidebar } from "../../hooks/tasks/useTasksSidebar";
import DirectoryTaskRow, {
  directoryRowGridStyle,
} from "../../components/tasks/board/DirectoryTaskRow";
import InlineCreateTaskRow from "../../components/tasks/board/InlineCreateTaskRow";
import DirectoryFilterSortPopover from "../../components/tasks/board/DirectoryFilterSortPopover";
import SpaceKpiStrip from "../../components/tasks/board/SpaceKpiStrip";
import OverdueNotifyButton from "../../components/tasks/board/OverdueNotifyButton";
import SpaceTourDialog from "../../components/tasks/tour/SpaceTourDialog";
import MasterCleanDialog from "../../components/tasks/clean/MasterCleanDialog";
import DailyStandupDialog from "../../components/tasks/daily/DailyStandupDialog";
import { ClipboardCheck } from "lucide-react";
import TaskGantt, {
  type GanttGroup,
} from "../../components/tasks/gantt/TaskGantt";
import {
  countActiveFilters,
  createDefaultFilters,
  DEFAULT_SORT,
  filterDirectoryTasks,
  searchDirectoryTasks,
  sortDirectoryGroups,
  sortDirectoryTasks,
  type DirectoryFilterState,
  type DirectorySortState,
} from "../../components/tasks/board/directoryFilters";
import type { TaskRow } from "../../hooks/tasks/useTaskBoard";
import { TaskListPageSkeleton } from "../../components/tasks/TasksSkeletons";
import { useCreateTaskDialog } from "../../components/tasks/schedule/CreateTaskDialogContext";
import ZonesTimeline from "../../components/tasks/zones/ZonesTimeline";
import { useSpaceZones } from "../../hooks/tasks/useZones";

interface BoardGroup {
  key: string;
  label: string;
  tasks: TaskRow[];
}

/** Compact inline pills — not big cards — for project sections (BOQ, maps, procurement, agreements). */
function ProjectSectionPills({ projectId }: { projectId: string }) {
  const sections = [
    {
      label: "حصر الكميات",
      to: `/operations/boq/project/${projectId}`,
      icon: Ruler,
      color: "#2563EB",
    },
    {
      label: "الخرائط",
      to: `/operations/maps/project/${projectId}`,
      icon: MapIcon,
      color: "#059669",
    },
    {
      label: "المشتريات",
      to: `/shops/orders/project/${projectId}`,
      icon: ShoppingCart,
      color: "#D97706",
    },
    {
      label: "الاتفاقيات",
      to: `/operations/agreements/project/${projectId}`,
      icon: FileSignature,
      color: "#7C3AED",
    },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {sections.map(({ label, to, icon: Icon, color }) => (
        <Link
          key={label}
          to={to}
          className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 shadow-2xs transition-all hover:border-primary/40 hover:bg-primary-superLight/20 hover:text-primary"
        >
          <Icon className="h-4 w-4 shrink-0" style={{ color }} />
          {label}
          <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-primary transition-colors" />
        </Link>
      ))}
    </div>
  );
}

function ResetColumnsButton() {
  const dirColumns = useDirectoryColumns();
  if (!dirColumns) return null;
  return (
    <button
      onClick={dirColumns.resetWidths}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-500 hover:border-slate-300 hover:text-slate-800 transition-colors shadow-2xs"
      title="إعادة ضبط عرض الأعمدة للحجم الافتراضي"
    >
      <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
      <span>إعادة ضبط عرض الأعمدة</span>
    </button>
  );
}

function SpaceMasterTableHeader({ showSource }: { showSource: boolean }) {
  const dirColumns = useDirectoryColumns();
  const headerGridStyle = dirColumns
    ? dirColumns.getGridStyle({ showSource, showPriority: true })
    : directoryRowGridStyle({ showSource });

  return (
    <div
      style={headerGridStyle}
      className="border-b border-slate-200 bg-slate-50/90 px-4 py-3 text-sm font-bold text-slate-700 select-none"
    >
      <ResizableColumnHeader columnKey="title">عنوان المهمة</ResizableColumnHeader>
      {showSource && (
        <ResizableColumnHeader columnKey="source">المنطقة</ResizableColumnHeader>
      )}
      <ResizableColumnHeader columnKey="status">الحالة</ResizableColumnHeader>
      <ResizableColumnHeader columnKey="priority">الأولوية</ResizableColumnHeader>
      <ResizableColumnHeader columnKey="team">الفريق</ResizableColumnHeader>
      <ResizableColumnHeader columnKey="startDate">تاريخ البدء</ResizableColumnHeader>
      <ResizableColumnHeader columnKey="dueDate">الاستحقاق</ResizableColumnHeader>
    </div>
  );
}

const boardOf = (task: TaskRow) => task.board_id;

type CreationMode = "inline" | "modal";
const CREATION_MODE_KEY = "egc_task_creation_mode";

function getSavedCreationMode(): CreationMode {
  try {
    const saved = localStorage.getItem(CREATION_MODE_KEY);
    if (saved === "inline" || saved === "modal") return saved;
  } catch {}
  return "inline";
}

export default function SpaceTasksPage({ view }: { view: "list" | "gantt" | "zones" }) {
  const { spaceId, taskId } = useParams<{ spaceId: string; taskId?: string }>();
  const navigate = useNavigate();
  const { data, loading, error, onChangeTaskDates, ...mutations } =
    useTaskDirectory({ spaceId });
  const basePath = `/tasks/space/${spaceId}${view === "list" ? "" : `/${view}`}`;
  const openTask = (id: string) => navigate(`${basePath}/task/${id}`);
  const { data: sidebarData } = useTasksSidebar();
  const spaceCaps = useSpaceCaps(spaceId);
  const { zones } = useSpaceZones(spaceId);
  const { openCreateTask } = useCreateTaskDialog();
  const [creationMode, setCreationModeState] = useState<CreationMode>(getSavedCreationMode);
  const [isInlineAdding, setIsInlineAdding] = useState(false);

  const setCreationMode = useCallback((mode: CreationMode) => {
    setCreationModeState(mode);
    try {
      localStorage.setItem(CREATION_MODE_KEY, mode);
    } catch {}
    if (mode === "inline") {
      setIsInlineAdding(true);
    } else {
      setIsInlineAdding(false);
    }
  }, []);

  const [search, setSearch] = useState("");
  const [selectedZoneKey, setSelectedZoneKey] = useState<string>("all");
  const [filters, setFilters] = useState<DirectoryFilterState>(createDefaultFilters());
  const [sort, setSort] = useState<DirectorySortState>({
    ...DEFAULT_SORT,
    groupSort: "order",
  });
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showMasterClean, setShowMasterClean] = useState(false);
  const [showDailyStandup, setShowDailyStandup] = useState(false);
  const closeTour = useCallback(() => setShowTour(false), []);
  const searching = search.trim().length > 0;

  const spaceNode = useMemo(() => {
    if (!sidebarData) return null;
    for (const nodes of Object.values(sidebarData.spacesByType)) {
      const found = nodes.find((n) => n.space.id === spaceId);
      if (found) return found;
    }
    return null;
  }, [sidebarData, spaceId]);

  const activeFilterCount = countActiveFilters(filters);

  const visibleTasks = useMemo(
    () =>
      data
        ? searchDirectoryTasks(
            filterDirectoryTasks(data.tasks, filters, data),
            search,
          )
        : [],
    [data, filters, search],
  );

  const groups = useMemo<BoardGroup[]>(() => {
    if (!data) return [];
    const byBoard = new Map<string, TaskRow[]>();
    for (const boardId of data.boardNamesById.keys()) {
      byBoard.set(boardId, []);
    }
    for (const task of visibleTasks) {
      const list = byBoard.get(task.board_id) ?? [];
      list.push(task);
      byBoard.set(task.board_id, list);
    }

    const boardGroups: BoardGroup[] = Array.from(byBoard.entries()).map(
      ([boardId, tasks]) => ({
        key: boardId,
        label: data.boardNamesById.get(boardId) ?? "منطقة",
        tasks: sortDirectoryTasks(tasks, sort, data),
      }),
    );

    return sortDirectoryGroups(
      boardGroups,
      sort.groupSort,
      undefined,
      data.boardOrderById,
    );
  }, [data, visibleTasks, sort]);

  // Tasks to show in the master table
  const displayedTasks = useMemo(() => {
    if (selectedZoneKey === "all") return visibleTasks;
    const group = groups.find((g) => g.key === selectedZoneKey);
    return group ? group.tasks : [];
  }, [visibleTasks, groups, selectedZoneKey]);

  const selectedZoneLabel = useMemo(() => {
    if (selectedZoneKey === "all") return "كل المناطق";
    return groups.find((g) => g.key === selectedZoneKey)?.label ?? "المنطقة المحددة";
  }, [groups, selectedZoneKey]);

  const childrenByBoard = useMemo(() => {
    const out = new Map<string, Map<string | null, TaskRow[]>>();
    if (!data) return out;
    const sorted = [...data.tasks].sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
    );
    for (const t of sorted) {
      let tree = out.get(t.board_id);
      if (!tree) {
        tree = new Map();
        out.set(t.board_id, tree);
      }
      const list = tree.get(t.parent_task_id ?? null) ?? [];
      list.push(t);
      tree.set(t.parent_task_id ?? null, list);
    }
    return out;
  }, [data]);
  const { link, unlink, reverse } = useDependencyEdit(undefined);

  const ganttGroups = useMemo<GanttGroup[]>(
    () =>
      groups.map((g) => ({
        id: g.key,
        label: g.label,
        href: `/tasks/board/${g.key}/gantt`,
      })),
    [groups],
  );
  const ganttTasks = useMemo(() => {
    const visibleIds = new Set(visibleTasks.map((t) => t.id));
    return [...visibleTasks]
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.created_at.localeCompare(b.created_at),
      )
      .map((t) =>
        t.parent_task_id && !visibleIds.has(t.parent_task_id)
          ? { ...t, parent_task_id: null }
          : t,
      );
  }, [visibleTasks]);

  if (loading) {
    return <TaskListPageSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-sm text-red-500">
        <div>تعذّر تحميل مهام المساحة</div>
        {error && (
          <div className="text-xs text-red-400 mt-2 font-mono max-w-lg text-center bg-red-50 p-2 rounded">
            {error instanceof Error ? error.message : String(error)}
          </div>
        )}
      </div>
    );
  }

  const spaceColor = spaceNode?.space.color ?? null;
  const projectName = spaceNode?.projectName || spaceNode?.space.name || "المساحة";
  const projectCode = spaceNode?.projectCode;
  const secondaryName =
    spaceNode?.projectName && spaceNode.projectName !== spaceNode.space.name
      ? spaceNode.space.name
      : null;

  const showSourceColumn = selectedZoneKey === "all";

  return (
    <div className="flex h-full flex-col bg-slate-100/70" dir="rtl">
      {/* ── Top Header ── */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 shadow-2xs">
        {/* Row 1: Title + Actions */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <h1
              className="truncate text-2xl font-black text-slate-900"
              style={spaceColor ? { color: spaceColor } : undefined}
            >
              {projectName}
            </h1>
            {projectCode && (
              <span className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-sm font-bold text-slate-600">
                #{projectCode}
              </span>
            )}
            {secondaryName && (
              <span className="text-sm text-slate-400 font-medium">{secondaryName}</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Switcher */}
            <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-sm font-bold shadow-2xs">
              <Link
                to={`/tasks/space/${spaceId}`}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 transition-all ${
                  view === "list"
                    ? "bg-white text-primary shadow-xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <List className="h-4 w-4" />
                قائمة
              </Link>
              <Link
                to={`/tasks/space/${spaceId}/gantt`}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 transition-all ${
                  view === "gantt"
                    ? "bg-white text-primary shadow-xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <ChartGantt className="h-4 w-4" />
                مخطط زمني
              </Link>
              {(zones.length > 0 || view === "zones") && (
                <Link
                  to={`/tasks/space/${spaceId}/zones`}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-2 transition-all ${
                    view === "zones"
                      ? "bg-white text-primary shadow-xs font-extrabold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  المناطق
                </Link>
              )}
            </div>

            {/* Search Box */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-2xs focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن مهمة..."
                className="w-44 sm:w-52 bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
                aria-label="بحث عن مهمة"
              />
            </div>

            <OverdueNotifyButton
              visibleTasks={visibleTasks}
              data={data}
              filters={filters}
              searchTerm={search}
            />

            <button
              onClick={() => setShowTour(true)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
              title="ملخص المساحة كشرائح"
            >
              <Presentation className="h-4 w-4 text-slate-500" />
              جولة في المساحة
            </button>

            <button
              onClick={() => setShowMasterClean(true)}
              className="flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50/70 px-3.5 py-2 text-sm font-bold text-purple-700 shadow-2xs hover:bg-purple-100 hover:border-purple-300 transition-colors cursor-pointer"
              title="الجدول التنفيذي الصافي - ضبط المدد والتواريخ ومعالجة التأخيرات"
            >
              <Sparkles className="h-4 w-4 text-purple-600" />
              Master Clean
            </button>

            <button
              onClick={() => setShowDailyStandup(true)}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2 text-sm font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 hover:border-emerald-300 transition-colors cursor-pointer"
              title="المتابعة الميدانية اليومية - تسجيل سير العمل وتحديث المهام النشطة والمتأخرة"
            >
              <ClipboardCheck className="h-4 w-4 text-emerald-600" />
              يومية الموقع
            </button>

            <button
              onClick={() => setShowFilterDialog(true)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
            >
              <SlidersHorizontal className="h-4 w-4 text-slate-500" />
              فلترة وترتيب
              {activeFilterCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Row 2: Project Section Pills (compact inline links) */}
        {spaceNode?.space.project_id && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <ProjectSectionPills projectId={spaceNode.space.project_id} />
          </div>
        )}
      </div>

      {showFilterDialog && (
        <DirectoryFilterSortPopover
          filters={filters}
          onChangeFilters={setFilters}
          sort={sort}
          onChangeSort={setSort}
          data={data}
          onClose={() => setShowFilterDialog(false)}
          showBoardOrder
        />
      )}

      {view === "zones" ? (
        <div className="flex-1 overflow-hidden">
          <ZonesTimeline
            spaceId={spaceId as string}
            tasks={visibleTasks}
            zones={zones}
            statuses={data.statuses}
            dependencies={data.dependencies}
            onOpenTask={openTask}
          />
        </div>
      ) : view === "gantt" ? (
        <div className="flex-1 overflow-hidden">
          <TaskGantt
            key={spaceId}
            tasks={ganttTasks}
            groups={ganttGroups}
            groupOf={boardOf}
            onOpenTask={openTask}
            statuses={data.statuses}
            taskTypes={data.taskTypes}
            dependencies={data.dependencies}
            dependencyFlags={data.dependencyFlags}
            onChangeDates={onChangeTaskDates}
            onLink={(pair) => link(pair)}
            onUnlink={(pair) => unlink([pair])}
            onReverseLink={(pair) => reverse(pair)}
            onAddToGroup={
              spaceCaps.create
                ? (boardId) => openCreateTask({ boardId })
                : undefined
            }
            readOnly={!spaceCaps.edit}
            emptyLabel="لا توجد مهام في هذه المساحة بعد"
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 lg:p-7">
          {/* 1. Executive KPI Strip */}
          <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <SpaceKpiStrip data={data} filters={filters} onSelect={setFilters} />
          </div>

          {/* 2. Zone Tabs + Master Table — unified card with resizable columns */}
          <DirectoryColumnProvider>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              {/* Zone Tab Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-0.5">
                  <button
                    onClick={() => setSelectedZoneKey("all")}
                    className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all shrink-0 ${
                      selectedZoneKey === "all"
                        ? "bg-slate-900 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                    }`}
                  >
                    كل المناطق ({visibleTasks.length})
                  </button>
                  {groups.map((group) => (
                    <div
                      key={group.key}
                      className={`group flex items-center rounded-xl transition-all shrink-0 ${
                        selectedZoneKey === group.key
                          ? "bg-primary text-white shadow-sm"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      <button
                        onClick={() => setSelectedZoneKey(group.key)}
                        className="px-3.5 py-2.5 text-sm font-bold"
                        title={`تصفية الجدول لعرض مهام ${group.label}`}
                      >
                        {group.label} ({group.tasks.length})
                      </button>
                      <Link
                        to={`/tasks/board/${group.key}`}
                        className={`p-2 pl-2.5 rounded-l-xl transition-colors ${
                          selectedZoneKey === group.key
                            ? "text-white/80 hover:text-white hover:bg-white/15"
                            : "text-slate-400 hover:text-primary hover:bg-slate-300/60"
                        }`}
                        title={`الدخول إلى صفحة ${group.label} بالكامل`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  ))}
                </div>

                {spaceCaps.create && (
                  <button
                    onClick={() =>
                      openCreateTask({
                        boardId: selectedZoneKey === "all" ? groups[0]?.key : selectedZoneKey,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-dark transition-all shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                    <span>إضافة مهمة</span>
                  </button>
                )}
              </div>

              {/* Table Sub-header */}
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 py-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-base font-black text-slate-800">
                    {selectedZoneLabel}
                  </span>
                  <span className="rounded-lg bg-slate-200/80 px-2.5 py-1 text-sm font-bold text-slate-600">
                    {displayedTasks.length} مهمة
                  </span>

                  {selectedZoneKey !== "all" && (
                    <Link
                      to={`/tasks/board/${selectedZoneKey}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 px-3.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-600 hover:text-white transition-all shadow-2xs mr-2"
                      title={`فتح صفحة ${selectedZoneLabel} بالكامل بكل أدواتها ومخططاتها`}
                    >
                      <span>الدخول للوحة {selectedZoneLabel} بالكامل</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
                <ResetColumnsButton />
              </div>

              {displayedTasks.length === 0 && !isInlineAdding ? (
                <div className="p-20 text-center text-base font-semibold text-slate-400">
                  <p>
                    {searching || activeFilterCount > 0
                      ? "لا توجد مهام تطابق البحث أو الفلتر المختار"
                      : "لا توجد مهام مسجلة في هذه المنطقة بعد"}
                  </p>
                  {spaceCaps.create && (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsInlineAdding(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-dark transition-all"
                      >
                        <Plus className="h-4 w-4" />
                        <span>إضافة سطر مهمة جديدة</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openCreateTask({
                            boardId: selectedZoneKey === "all" ? groups[0]?.key : selectedZoneKey,
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all"
                      >
                        <span>نافذة تفصيلية</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto scrollbar-thin">
                  {/* Resizable Table Header */}
                  <SpaceMasterTableHeader showSource={showSourceColumn} />

                  {/* Table Rows */}
                  <div className="divide-y divide-slate-150">
                    {displayedTasks.map((task) => (
                      <DirectoryTaskRow
                        key={task.id}
                        task={task}
                        spaceId={data.spaceIdByBoardId.get(task.board_id)}
                        showSource={showSourceColumn}
                        spaceNameByBoardId={data.spaceNamesById}
                        boardNamesById={data.boardNamesById}
                        statuses={data.statuses}
                        employeesById={data.employeesById}
                        allEmployees={data.allEmployees}
                        assigneesByTask={data.assigneesByTask}
                        taskTypes={data.taskTypes}
                        tagsByTask={data.tagsByTask}
                        parentTitle={data.parentTitleByTask.get(task.id)}
                        linkedTaskIds={data.linkedTaskIds}
                        dependencyFlags={data.dependencyFlags}
                        unmetRequirementTaskIds={data.unmetRequirementTaskIds}
                        attachedTaskIds={data.attachedTaskIds}
                        commentedTaskIds={data.commentedTaskIds}
                        onOpenTask={openTask}
                        linkEditing={{
                          dependencyLinks: data.dependencyLinks,
                          childrenByParent:
                            childrenByBoard.get(task.board_id) ?? new Map(),
                          onLink: (pair) => link(pair),
                          onUnlink: (pairs) => unlink(pairs),
                          onReverseLink: (pair) => reverse(pair),
                        }}
                        {...mutations}
                      />
                    ))}

                    {/* Inline Quick Add Row */}
                    {spaceCaps.create && isInlineAdding && (
                      <InlineCreateTaskRow
                        showSource={showSourceColumn}
                        defaultBoardId={
                          selectedZoneKey === "all" ? groups[0]?.key : selectedZoneKey
                        }
                        boards={groups.map((g) => ({ key: g.key, label: g.label }))}
                        onCreate={(boardId, title) => mutations.onCreateTask(boardId, title)}
                        onOpenModal={(boardId, title) => {
                          openCreateTask({ boardId, title });
                        }}
                        onCancel={() => setIsInlineAdding(false)}
                      />
                    )}
                  </div>

                  {/* Bottom Add Task */}
                  {spaceCaps.create && (
                    <div>
                      {isInlineAdding ? (
                        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs text-slate-500 font-medium">
                          <span>اكتب اسم المهمة واضغط Enter للإضافة والمتابعة التلقائية</span>
                          <button
                            type="button"
                            onClick={() => setIsInlineAdding(false)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 shadow-2xs"
                          >
                            إنهاء الإضافة (Esc)
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsInlineAdding(true)}
                          className="flex w-full items-center justify-center gap-2 border-t border-slate-200 bg-slate-50/60 py-3.5 text-sm font-bold text-primary hover:bg-primary-superLight/30 transition-colors"
                        >
                          <Plus className="h-4 w-4" />
                          <span>إضافة سطر مهمة جديدة (Enter ↵)</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </DirectoryColumnProvider>
        </div>
      )}

      {showTour && (
        <SpaceTourDialog
          data={data}
          spaceName={projectName}
          spaceColor={spaceColor}
          panelOpen={!!taskId}
          onClose={closeTour}
          onOpenTask={openTask}
          onChangeStatus={mutations.onChangeStatus}
          onChangeTaskType={mutations.onChangeTaskType}
          onChangePriority={mutations.onChangePriority}
          onChangeStartDate={mutations.onChangeStartDate}
          onChangeDueDate={mutations.onChangeDueDate}
          onChangeAssignees={mutations.onChangeAssignees}
        />
      )}

      {showMasterClean && (
        <MasterCleanDialog
          data={data}
          spaceName={projectName}
          spaceColor={spaceColor}
          onClose={() => setShowMasterClean(false)}
          onOpenTask={openTask}
          onChangeTaskDates={onChangeTaskDates}
          onChangeStatus={mutations.onChangeStatus}
        />
      )}

      {showDailyStandup && (
        <DailyStandupDialog
          data={data}
          spaceName={projectName}
          spaceColor={spaceColor}
          onClose={() => setShowDailyStandup(false)}
          onOpenTask={openTask}
          onChangeTaskDates={onChangeTaskDates}
          onChangeStatus={mutations.onChangeStatus}
        />
      )}

      <Outlet />
    </div>
  );
}
