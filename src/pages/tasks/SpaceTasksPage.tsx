import { useCallback, useMemo, useState } from "react";
import { useSpaceCaps } from "../../hooks/tasks/useTaskAccess";
import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeftRight,
  ChartGantt,
  ChevronDown,
  ChevronLeft,
  FileSignature,
  List,
  Map as MapIcon,
  Plus,
  Presentation,
  Ruler,
  Search,
  ShoppingCart,
  SlidersHorizontal,
} from "lucide-react";
import { useTaskDirectory } from "../../hooks/tasks/useTaskDirectory";
import { useDependencyEdit } from "../../hooks/tasks/dependencyEdit";
import { useTasksSidebar } from "../../hooks/tasks/useTasksSidebar";
import DirectoryTaskRow, {
  directoryRowGridStyle,
} from "../../components/tasks/board/DirectoryTaskRow";
import DirectoryFilterSortPopover from "../../components/tasks/board/DirectoryFilterSortPopover";
import SpaceKpiStrip from "../../components/tasks/board/SpaceKpiStrip";
import { activeKpiKey } from "../../components/tasks/board/spaceKpiFilters";
import CollapseAllButtons from "../../components/tasks/board/CollapseAllButtons";
import OverdueNotifyButton from "../../components/tasks/board/OverdueNotifyButton";
import SpaceTourDialog from "../../components/tasks/tour/SpaceTourDialog";
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

// "All tasks in this space" — same full inline-edit/filter/sort shape as
// AssigneeViewPage.tsx/TaskTypeViewPage.tsx/ProjectViewPage.tsx, but
// scoped to one space (useTaskDirectory({ spaceId })) instead of
// company-wide, and grouped by board — a space's own direct sub-units,
// matching how the sidebar tree already organizes it. Reached from the
// sidebar's space name/icon (TasksLayout.tsx's SpaceSection — the small
// chevron still just expands/collapses the inline board tree) and from
// TasksPage.tsx's space cards.
//
// "جولة في المساحة" opens SpaceTourDialog: the same data as slides
// (overdue, in progress, not started, unassigned, recently done). A task's
// detail panel (this page's nested task/:taskId route, the <Outlet /> below)
// opens on top of the tour — keep the Outlet AFTER the tour so it paints over it.
//
// `view` comes from the route, like the board page: space/:id is the list,
// space/:id/gantt every board of the space on one TaskGantt — a header row
// per board with its task tree under it; space/:id/zones the timeline across
// zones (one row per task, one bar per zone — the manager's "timeline that
// takes the zoning into account"). Search, the filters and the KPI cards
// narrow every view the same way.

interface BoardGroup {
  key: string;
  label: string;
  tasks: TaskRow[];
}

// Same add row as board/TaskTable.tsx's: a task needs a start date and its
// working days, so it opens the create dialog for that board.
function AddTaskRow({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600"
    >
      <Plus className="h-3.5 w-3.5" />
      إضافة مهمة
    </button>
  );
}

// The Gantt's board rows: a task belongs to its board.
const boardOf = (task: TaskRow) => task.board_id;

export default function SpaceTasksPage({ view }: { view: "list" | "gantt" | "zones" }) {
  // taskId is the nested detail panel's param, visible here too.
  const { spaceId, taskId } = useParams<{ spaceId: string; taskId?: string }>();
  const navigate = useNavigate();
  const { data, loading, error, onChangeTaskDates, ...mutations } =
    useTaskDirectory({ spaceId });
  // The detail panel opens under the current view, so closing it stays there.
  const basePath = `/tasks/space/${spaceId}${view === "list" ? "" : `/${view}`}`;
  const openTask = (id: string) => navigate(`${basePath}/task/${id}`);
  const { data: sidebarData } = useTasksSidebar();
  const spaceCaps = useSpaceCaps(spaceId);
  const { zones } = useSpaceZones(spaceId);
  const { openCreateTask } = useCreateTaskDialog();
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<DirectoryFilterState>(
    createDefaultFilters(),
  );
  // Boards keep their saved order (boards.sort_order, set in space
  // settings) by default — the same order the space is organised in.
  const [sort, setSort] = useState<DirectorySortState>({
    ...DEFAULT_SORT,
    groupSort: "order",
  });
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [showTour, setShowTour] = useState(false);
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
  // "Show completed" is the status filter's "all" mode — not narrowing
  // anything down, so it must not hide empty boards or their add-task row.
  const narrowingCount =
    activeFilterCount - (filters.statusMode === "all" ? 1 : 0);

  // A KPI card is selected when the filters match its preset exactly. Every
  // card except the default "open" view means "only the boards that have
  // such tasks", so empty boards drop out — including for the "all tasks"
  // card, which the narrowing count above doesn't treat as a filter.
  const kpiKey = useMemo(
    () => (data ? activeKpiKey(filters, data) : null),
    [data, filters],
  );
  const hideEmptyBoards = kpiKey !== null && kpiKey !== "open";

  // One definition of "what this page is showing" — shared with the
  // overdue-notify button so its recipients match the visible list.
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

    // Seeded from every board in the space (data.boardNamesById), not
    // just boards with a surviving task — otherwise a brand-new board
    // would have no section, and so no add-task row to add its first
    // task from. Only while the view is neutral (no search, no active
    // filter): once someone's actually narrowing things down, an empty
    // board would just be noise among real results.
    const byBoard = new Map<string, TaskRow[]>();
    if (!searching && narrowingCount === 0 && !hideEmptyBoards) {
      for (const boardId of data.boardNamesById.keys())
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
        label: data.boardNamesById.get(boardId) ?? "لوحة",
        tasks: sortDirectoryTasks(tasks, sort, data),
      }),
    );

    return sortDirectoryGroups(
      boardGroups,
      sort.groupSort,
      undefined,
      data.boardOrderById,
    );
  }, [data, visibleTasks, searching, sort, narrowingCount, hideEmptyBoards]);

  // Each board's tasks as a tree in the board's own order, for the rows' link
  // editor and "تبدأ بعد المهمة السابقة" — the same order the board view uses,
  // whatever this page is sorted or filtered by.
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

  // The Gantt: the boards in the list's order, and the visible tasks in each
  // board's own order. A subtask whose parent is filtered out moves up to its
  // board's top level (the board page does the same for assignee-only views).
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

  const expandAll = () => setCollapsedKeys(new Set());
  const collapseAll = () => setCollapsedKeys(new Set(groups.map((g) => g.key)));

  const toggle = (key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return <TaskListPageSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        تعذّر تحميل مهام المساحة
      </div>
    );
  }

  const spaceColor = spaceNode?.space.color ?? null;

  return (
    <div className="flex h-full flex-col" dir="rtl">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
        <h1
          className="shrink-0 text-base font-semibold text-gray-900"
          style={spaceColor ? { color: spaceColor } : undefined}
        >
          {spaceNode?.space.name ?? "المساحة"}
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white text-sm">
            <Link
              to={`/tasks/space/${spaceId}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 ${
                view === "list"
                  ? "bg-primary-superLight font-medium text-primary"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              قائمة
            </Link>
            <Link
              to={`/tasks/space/${spaceId}/gantt`}
              className={`flex items-center gap-1.5 border-r border-gray-200 px-3 py-1.5 ${
                view === "gantt"
                  ? "bg-primary-superLight font-medium text-primary"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <ChartGantt className="h-3.5 w-3.5" />
              مخطط زمني
            </Link>
            {(zones.length > 0 || view === "zones") && (
              <Link
                to={`/tasks/space/${spaceId}/zones`}
                className={`flex items-center gap-1.5 border-r border-gray-200 px-3 py-1.5 ${
                  view === "zones"
                    ? "bg-primary-superLight font-medium text-primary"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                المناطق
              </Link>
            )}
          </div>
          <div className="flex w-56 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن مهمة..."
              className="w-full bg-transparent text-sm outline-none"
              aria-label="بحث عن مهمة"
            />
          </div>
          {/* the Gantt has its own expand / collapse buttons */}
          {view === "list" && (
            <CollapseAllButtons
              onExpandAll={expandAll}
              onCollapseAll={collapseAll}
              searching={searching}
            />
          )}
          <OverdueNotifyButton
            visibleTasks={visibleTasks}
            data={data}
            filters={filters}
            searchTerm={search}
          />
          <button
            onClick={() => setShowTour(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            title="ملخص المساحة كشرائح: المتأخرة، قيد التنفيذ، لم تبدأ، غير المعينة، والمنجزة مؤخراً"
          >
            <Presentation className="h-3.5 w-3.5" />
            جولة في المساحة
          </button>
          <button
            onClick={() => setShowFilterDialog(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            فلترة وترتيب
            {activeFilterCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {view === "list" && (
        <SpaceKpiStrip data={data} filters={filters} onSelect={setFilters} />
      )}

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
            emptyLabel={
              searching || narrowingCount > 0 || hideEmptyBoards
                ? "لا توجد مهام مطابقة"
                : "لا توجد مهام في هذه المساحة بعد"
            }
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-gray-50 p-3">
          {spaceNode?.space.project_id && (
            <ProjectSectionLinks projectId={spaceNode.space.project_id} />
          )}
          {groups.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">
              {searching || narrowingCount > 0 || hideEmptyBoards
                ? "لا توجد مهام مطابقة"
                : "لا توجد مهام في هذه المساحة بعد"}
            </div>
          ) : (
            groups.map((group) => {
              const collapsed = !searching && collapsedKeys.has(group.key);
              return (
                <div
                  key={group.key}
                  className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-white last:mb-0"
                >
                  {/* A link can't live inside a button, so the header is a row of
                      siblings: chevron (collapse), board name (opens the board),
                      and a flex-1 filler that keeps "click anywhere else on the
                      header to collapse" working as it did when the whole header
                      was one button. */}
                  <div className="flex w-full items-center gap-2 border-b-2 border-gray-200 bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-200">
                    <button
                      onClick={() => toggle(group.key)}
                      className="shrink-0 rounded p-0.5 hover:bg-gray-300/60"
                      title={collapsed ? "توسيع" : "طي"}
                    >
                      {collapsed ? (
                        <ChevronLeft className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <Link
                      to={`/tasks/board/${group.key}`}
                      className="truncate hover:text-primary hover:underline"
                      title="فتح اللوحة"
                    >
                      {group.label}
                    </Link>
                    <span className="shrink-0 text-xs font-normal text-gray-400">
                      ({group.tasks.length})
                    </span>
                    <button
                      onClick={() => toggle(group.key)}
                      className="h-6 flex-1"
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                  </div>

                  {!collapsed && (
                    <>
                      <div
                        style={directoryRowGridStyle()}
                        className="border-b border-gray-100 bg-white px-2 py-1.5 text-xs font-semibold text-gray-500"
                      >
                        <div>عنوان المهمة</div>
                        <div>الحالة</div>
                        <div>الأولوية</div>
                        <div>الفريق</div>
                        <div>تاريخ البدء</div>
                        <div>الاستحقاق</div>
                      </div>
                      {group.tasks.map((task) => (
                        <DirectoryTaskRow
                          key={task.id}
                          task={task}
                          spaceId={data.spaceIdByBoardId.get(task.board_id)}
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
                          }}
                          {...mutations}
                        />
                      ))}
                      {group.tasks.length === 0 && (
                        <div className="px-3 py-3 text-center text-sm text-gray-400">
                          لا توجد مهام في هذه اللوحة بعد
                        </div>
                      )}
                      {spaceCaps.create && (
                        <AddTaskRow
                          onAdd={() => openCreateTask({ boardId: group.key })}
                        />
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {showTour && (
        <SpaceTourDialog
          data={data}
          spaceName={spaceNode?.space.name ?? "المساحة"}
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

      <Outlet />
    </div>
  );
}

// The project's own sections, under the space's KPI cards. Each button opens
// that section's page for this space's project; the destination pages keep
// their own permission guards.
function ProjectSectionLinks({ projectId }: { projectId: string }) {
  const sections = [
    {
      label: "حصر الكميات",
      to: `/operations/boq/project/${projectId}`,
      icon: Ruler,
    },
    {
      label: "الخرائط",
      to: `/operations/maps/project/${projectId}`,
      icon: MapIcon,
    },
    {
      label: "المشتريات",
      to: `/shops/orders/project/${projectId}`,
      icon: ShoppingCart,
    },
    {
      label: "الاتفاقيات",
      to: `/operations/agreements/project/${projectId}`,
      icon: FileSignature,
    },
  ];
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {sections.map(({ label, to, icon: Icon }) => (
        <Link
          key={label}
          to={to}
          className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <Icon className="h-5 w-5 text-gray-400" />
          {label}
        </Link>
      ))}
    </div>
  );
}
