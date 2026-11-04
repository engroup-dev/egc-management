import { useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronLeft, Search, SlidersHorizontal } from "lucide-react";
import { useTaskDirectory } from "../../hooks/tasks/useTaskDirectory";
import DirectoryTaskRow, { directoryRowGridStyle } from "../../components/tasks/board/DirectoryTaskRow";
import DirectoryFilterSortPopover from "../../components/tasks/board/DirectoryFilterSortPopover";
import { colorFor, initials } from "../../components/tasks/board/employeeAvatar";
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
  ASSIGNEE_NONE_KEY,
  type DirectoryFilterState,
  type DirectorySortState,
} from "../../components/tasks/board/directoryFilters";
import type { TaskRow } from "../../hooks/tasks/useTaskBoard";
import type { AssignablePerson } from "../../hooks/tasks/useAssignablePeople";
import { TaskListPageSkeleton } from "../../components/tasks/TasksSkeletons";

// Assignee view — company-wide, cross-space (build plan Part 7's
// D6/D7 pattern extended to full inline edit, see task-module-build-plan
// notes for why D6/D7 themselves stayed read-only). The employee is the
// organizing unit: one section per employee, every task they're on —
// including as a secondary assignee, so a task with 2+ assignees appears
// in every one of their sections rather than just the first (unlike
// board/TaskTable.tsx's own group-by-assignee, which only needs one
// bucket per task for a single flat table).

interface AssigneeGroup {
  key: string;
  label: string;
  employee: AssignablePerson | null;
  tasks: TaskRow[];
}

export default function AssigneeViewPage() {
  const navigate = useNavigate();
  const { data, loading, error, ...mutations } = useTaskDirectory();
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<DirectoryFilterState>(createDefaultFilters());
  const [sort, setSort] = useState<DirectorySortState>(DEFAULT_SORT);
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const searching = search.trim().length > 0;

  // The one definition of "what this page is showing", shared with the
  // overdue-notify button so its recipient list provably matches the
  // list on screen rather than being derived in parallel.
  const visibleTasks = useMemo(
    () => (data ? searchDirectoryTasks(filterDirectoryTasks(data.tasks, filters, data), search) : []),
    [data, filters, search],
  );

  const groups = useMemo<AssigneeGroup[]>(() => {
    if (!data) return [];

    const byEmployee = new Map<string, TaskRow[]>();
    const unassigned: TaskRow[] = [];

    for (const task of visibleTasks) {
      const assigneeIds = data.assigneesByTask.get(task.id) ?? [];
      if (assigneeIds.length === 0) {
        unassigned.push(task);
        continue;
      }
      for (const userId of assigneeIds) {
        const list = byEmployee.get(userId) ?? [];
        list.push(task);
        byEmployee.set(userId, list);
      }
    }

    const employeeGroups: AssigneeGroup[] = Array.from(byEmployee.entries()).map(([userId, tasks]) => {
      const employee = data.employeesById.get(userId) ?? null;
      return {
        key: userId,
        label: employee ? `${employee.first_name} ${employee.last_name ?? ""}`.trim() : "موظف",
        employee,
        tasks: sortDirectoryTasks(tasks, sort, data),
      };
    });

    if (unassigned.length > 0) {
      employeeGroups.push({
        key: ASSIGNEE_NONE_KEY,
        label: "غير معين",
        employee: null,
        tasks: sortDirectoryTasks(unassigned, sort, data),
      });
    }

    return sortDirectoryGroups(employeeGroups, sort.groupSort, ASSIGNEE_NONE_KEY);
  }, [data, visibleTasks, sort]);

  const toggle = (key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => setCollapsedKeys(new Set());
  const collapseAll = () => setCollapsedKeys(new Set(groups.map((g) => g.key)));

  if (loading) {
    return <TaskListPageSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-sm text-red-500">
        <div>تعذّر تحميل المهام حسب الموظف</div>
        {error && (
          <div className="text-xs text-red-400 mt-2 font-mono max-w-lg text-center bg-red-50 p-2 rounded">
            {error instanceof Error ? error.message : String(error)}
          </div>
        )}
      </div>
    );
  }

  const activeFilterCount = countActiveFilters(filters);
  // The completion column earns its width only while you're actually
  // looking at completed work, so it appears with the filter and the
  // default view stays exactly as wide as before.
  const showCompleted = filters.statusMode === "done" || filters.statusMode === "done_on";

  return (
    <div className="flex h-full flex-col" dir="rtl">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
        <h1 className="shrink-0 text-base font-semibold text-gray-900">المهام حسب الموظف</h1>
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
                  // border-s-4 = the leading edge, i.e. the right in RTL. The
                  // same generated colour the avatar uses, run down the whole
                  // header so one person's section is distinguishable at a
                  // glance rather than only by reading the name.
                  className="flex w-full items-center gap-2 border-b-2 border-s-4 border-gray-200 bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-200"
                  style={{ borderInlineStartColor: group.employee ? colorFor(group.key) : "#D1D5DB" }}
                >
                  {collapsed ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {group.employee ? (
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                      style={{ background: colorFor(group.key) }}
                    >
                      {initials(group.employee)}
                    </span>
                  ) : null}
                  <span>{group.label}</span>
                  {group.employee?.person_type === "contractor" && (
                    <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-700">
                      مقاول
                    </span>
                  )}
                  <span className="text-xs font-normal text-gray-400">({group.tasks.length})</span>
                </button>

                {!collapsed && (
                  <>
                    <div
                      style={directoryRowGridStyle({ showSource: true, showCompleted })}
                      className="border-b border-gray-100 bg-white px-2 py-1.5 text-xs font-semibold text-gray-500"
                    >
                      <div>عنوان المهمة</div>
                      <div>المصدر</div>
                      <div>الحالة</div>
                      <div>الأولوية</div>
                      <div>الفريق</div>
                      <div>تاريخ البدء</div>
                      <div>الاستحقاق</div>
                      {showCompleted && <div>وقت الإكمال</div>}
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
                        showSource
                        boardNamesById={data.boardNamesById}
                        spaceNameByBoardId={data.spaceNameByBoardId}
                        showCompleted={showCompleted}
                        onOpenTask={(taskId) => navigate(`/tasks/by-assignee/task/${taskId}`)}
                        {...mutations}
                      />
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
