import { useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronLeft, Search, SlidersHorizontal } from "lucide-react";
import { useTaskDirectory } from "../../hooks/tasks/useTaskDirectory";
import DirectoryTaskRow, { directoryRowGridStyle } from "../../components/tasks/board/DirectoryTaskRow";
import DirectoryFilterSortPopover from "../../components/tasks/board/DirectoryFilterSortPopover";
import CollapseAllButtons from "../../components/tasks/board/CollapseAllButtons";
import OverdueNotifyButton from "../../components/tasks/board/OverdueNotifyButton";
import {
  countActiveFilters,
  createDefaultFilters,
  DEFAULT_SORT,
  filterDirectoryTasks,
  searchDirectoryTasks,
  sortDirectoryGroups,
  sortDirectoryTasks,
  PROJECT_NONE_KEY,
  type DirectoryFilterState,
  type DirectorySortState,
} from "../../components/tasks/board/directoryFilters";
import type { TaskRow } from "../../hooks/tasks/useTaskBoard";
import { TaskListPageSkeleton } from "../../components/tasks/TasksSkeletons";

// Project view — same company-wide/cross-space scope and full inline
// edit as AssigneeViewPage.tsx/TaskTypeViewPage.tsx, grouped by project
// then zone (site area within a project) — same project → zone nesting
// DepartmentPage.tsx already proved out for a single department's tasks,
// generalized here across every project with full inline edit instead
// of DepartmentPage's read-only rows. A task has exactly one project (or
// none) and one zone (or none), so no duplication like the assignee view.

const ZONE_NONE_KEY = "__no_zone__";

interface ZoneGroup {
  key: string;
  label: string;
  tasks: TaskRow[];
}

interface ProjectGroup {
  key: string;
  label: string;
  tasks: TaskRow[];
  zoneGroups: ZoneGroup[];
}

export default function ProjectViewPage() {
  const navigate = useNavigate();
  const { data, loading, error, ...mutations } = useTaskDirectory();
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<DirectoryFilterState>(createDefaultFilters());
  const [sort, setSort] = useState<DirectorySortState>(DEFAULT_SORT);
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const searching = search.trim().length > 0;

  // One definition of "what this page is showing" — shared with the
  // overdue-notify button so its recipients match the visible list.
  const visibleTasks = useMemo(
    () => (data ? searchDirectoryTasks(filterDirectoryTasks(data.tasks, filters, data), search) : []),
    [data, filters, search],
  );

  const groups = useMemo<ProjectGroup[]>(() => {
    if (!data) return [];

    const byProject = new Map<string, TaskRow[]>();
    for (const task of visibleTasks) {
      const key = task.project_id ?? PROJECT_NONE_KEY;
      const list = byProject.get(key) ?? [];
      list.push(task);
      byProject.set(key, list);
    }

    const projectGroups: ProjectGroup[] = Array.from(byProject.entries()).map(([projectId, tasks]) => {
      const byZone = new Map<string, TaskRow[]>();
      for (const task of tasks) {
        const zoneKey = task.zone_id ?? ZONE_NONE_KEY;
        const list = byZone.get(zoneKey) ?? [];
        list.push(task);
        byZone.set(zoneKey, list);
      }

      const zoneGroups: ZoneGroup[] = Array.from(byZone.entries()).map(([zoneId, zoneTasks]) => ({
        key: zoneId,
        label: zoneId === ZONE_NONE_KEY ? "بدون منطقة" : (data.zoneNamesById.get(zoneId) ?? "منطقة"),
        tasks: sortDirectoryTasks(zoneTasks, sort, data),
      }));

      return {
        key: projectId,
        label: projectId === PROJECT_NONE_KEY ? "بدون مشروع" : (data.projectNamesById.get(projectId) ?? "مشروع"),
        tasks,
        zoneGroups: sortDirectoryGroups(zoneGroups, sort.groupSort, ZONE_NONE_KEY),
      };
    });

    return sortDirectoryGroups(projectGroups, sort.groupSort, PROJECT_NONE_KEY);
  }, [data, visibleTasks, sort]);

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
      <div className="flex flex-col h-full items-center justify-center text-sm text-red-500">
        <div>تعذّر تحميل المهام حسب المشروع</div>
        {error && (
          <div className="text-xs text-red-400 mt-2 font-mono max-w-lg text-center bg-red-50 p-2 rounded">
            {error instanceof Error ? error.message : String(error)}
          </div>
        )}
      </div>
    );
  }

  const activeFilterCount = countActiveFilters(filters);

  return (
    <div className="flex h-full flex-col" dir="rtl">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
        <h1 className="shrink-0 text-base font-semibold text-gray-900">المهام حسب المشروع</h1>
        <div className="flex items-center gap-2">
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
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} searching={searching} />
          <OverdueNotifyButton visibleTasks={visibleTasks} data={data} filters={filters} searchTerm={search} />
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

      {showFilterDialog && (
        <DirectoryFilterSortPopover
          filters={filters}
          onChangeFilters={setFilters}
          sort={sort}
          onChangeSort={setSort}
          data={data}
          onClose={() => setShowFilterDialog(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto bg-gray-50 p-3">
        {groups.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">
            {searching || activeFilterCount > 0 ? "لا توجد مهام مطابقة" : "لا توجد مهام"}
          </div>
        ) : (
          groups.map((group) => {
            const collapsed = !searching && collapsedKeys.has(group.key);
            return (
              <div key={group.key} className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-white last:mb-0">
                <button
                  onClick={() => toggle(group.key)}
                  className="flex w-full items-center gap-2 border-b-2 border-gray-200 bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-200"
                >
                  {collapsed ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  <span>{group.label}</span>
                  <span className="text-xs font-normal text-gray-400">({group.tasks.length})</span>
                </button>

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
                    {group.zoneGroups.map((zoneGroup) => (
                      <div key={zoneGroup.key}>
                        <div className="bg-gray-50/60 px-4 py-1 text-xs text-gray-400">
                          {zoneGroup.label} <span className="text-gray-300">({zoneGroup.tasks.length})</span>
                        </div>
                        {zoneGroup.tasks.map((task) => (
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
                            onOpenTask={(taskId) => navigate(`/tasks/by-project/task/${taskId}`)}
                            {...mutations}
                          />
                        ))}
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      <Outlet />
    </div>
  );
}
