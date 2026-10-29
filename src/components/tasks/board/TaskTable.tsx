import { cloneElement, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Plus, MoreHorizontal, ChevronsDown, ChevronsUp, ArrowDownWideNarrow, ArrowUpNarrowWide, Eye, EyeOff } from "lucide-react";
import TaskRow, { rowGridStyle } from "./TaskRow";
import BulkActionPanel from "./BulkActionPanel";
import { useBoardAccess } from "../BoardAccessContext";
import { taskRowCaps } from "../../../hooks/tasks/useTaskAccess";
import { withDescendants } from "../../../hooks/tasks/bulkSelection";
import ColumnEditorModal from "./ColumnEditorModal";
import { useClickOutside } from "../../../hooks/tasks/useClickOutside";
import { sortTasks, taskSortOption, TASK_SORT_OPTIONS, type SortDirection, type TaskSortKey } from "./directoryFilters";
import type {
  CustomColumn,
  FieldType,
  Priority,
  StatusRow,
  TaskRow as TaskRowType,
  TaskTypeLite,
  TagLite,
  DependencyPair,
} from "../../../hooks/tasks/useTaskBoard";
import type { AssignablePerson } from "../../../hooks/tasks/useAssignablePeople";
import type { SpaceFeatureSettings } from "../../../hooks/tasks/useSpaceSettings";
import type { Json } from "../../../lib/supabase";
import type { DependencyFlags, TaskLinks } from "../../../hooks/tasks/dependencyFlags";

type GroupBy = "none" | "department" | "assignee" | "task_type" | "zone";

const GROUP_LABELS: Record<GroupBy, string> = {
  none: "بدون تجميع",
  zone: "المنطقة",
  department: "القسم",
  assignee: "الموظف المسؤول",
  task_type: "نوع المهمة",
};

interface TaskTableProps {
  boardId: string;
  boardZoneId: string | null;
  zoneName: string | null;
  tasks: TaskRowType[];
  statuses: StatusRow[];
  employeesById: Map<string, AssignablePerson>;
  allEmployees: AssignablePerson[];
  assigneesByTask: Map<string, string[]>;
  taskTypes: Map<string, TaskTypeLite>;
  departmentNamesById: Map<string, string>;
  linkedTaskIds: Set<string>;
  dependencyFlags: Map<string, DependencyFlags>;
  dependencyLinks: Map<string, TaskLinks>;
  /** Add / remove dependency links (the dependency icons, the right-click menu). */
  onLink: (pair: DependencyPair) => void;
  onUnlink: (pairs: DependencyPair[]) => void;
  unmetRequirementTaskIds: Set<string>;
  attachedTaskIds: Set<string>;
  commentedTaskIds: Set<string>;
  tagsByTask: Map<string, TagLite[]>;
  subtaskProgressByTask: Map<string, { done: number; total: number }>;
  customColumns: CustomColumn[];
  hiddenColumns: CustomColumn[];
  valuesByTask: Map<string, Map<string, Json>>;
  featureSettings: SpaceFeatureSettings;
  onChangeStatus: (taskId: string, statusId: string) => void;
  onChangeTaskType: (taskId: string, taskTypeId: string) => void;
  onChangePriority: (taskId: string, priority: Priority | null) => void;
  onChangeStartDate: (taskId: string, date: string | null) => void;
  onChangeDueDate: (taskId: string, date: string | null) => void;
  onChangeDuration: (taskId: string, days: number) => void;
  onChangeLag: (taskId: string, lagDays: number) => void;
  onChangeAssignees: (taskId: string, userIds: string[]) => void;
  onCreateTask: (title: string, parentTaskId: string | null) => void;
  onRenameTask?: (taskId: string, title: string) => void;
  onChangeValue: (taskId: string, fieldDefinitionId: string, value: Json) => void;
  onAttachField: (fieldDefinitionId: string) => void;
  onCreateAndAttachField: (input: { name: string; name_ar: string; type: FieldType; config: Json }) => void;
  onDetachColumn: (boardColumnId: string) => void;
  onSetColumnVisibility: (boardColumnId: string, visible: boolean) => void;
  onRenameField: (fieldDefinitionId: string, name_ar: string) => void;
  onMoveTaskTo: (input: { id: string; newParentId: string | null; beforeId: string | null }) => void;
  /** The board's project, for ordering the bulk-assign picker. */
  projectId: string | null;
  /** Bulk actions for the selection bar. Each rejects on failure (the
   * tasks error toast has already shown why). */
  onBulkSetStatus: (taskIds: string[], statusId: string) => Promise<unknown>;
  onBulkSetPriority: (taskIds: string[], priority: Priority | null) => Promise<unknown>;
  onBulkAssign: (taskIds: string[], add: string[], remove: string[]) => Promise<unknown>;
  onBulkDelete: (taskIds: string[]) => Promise<unknown>;
  /** When set, the selection bar also offers "add to boards…" for the
   * selected tasks (template push — see useTemplateSync.ts). */
  onPushSelected?: (taskIds: string[]) => void;
  onCopySelectedToZones?: (taskIds: string[]) => void;
}

export default function TaskTable({
  boardId,
  boardZoneId,
  zoneName,
  tasks,
  statuses,
  employeesById,
  allEmployees,
  assigneesByTask,
  taskTypes,
  departmentNamesById,
  linkedTaskIds,
  dependencyFlags,
  dependencyLinks,
  onLink,
  onUnlink,
  unmetRequirementTaskIds,
  attachedTaskIds,
  commentedTaskIds,
  tagsByTask,
  subtaskProgressByTask,
  customColumns,
  hiddenColumns,
  valuesByTask,
  featureSettings,
  onChangeStatus,
  onChangeTaskType,
  onChangePriority,
  onChangeStartDate,
  onChangeDueDate,
  onChangeDuration,
  onChangeLag,
  onChangeAssignees,
  onCreateTask,
  onRenameTask,
  onChangeValue,
  onAttachField,
  onCreateAndAttachField,
  onDetachColumn,
  onSetColumnVisibility,
  onRenameField,
  onMoveTaskTo,
  projectId,
  onBulkSetStatus,
  onBulkSetPriority,
  onBulkAssign,
  onBulkDelete,
  onPushSelected,
  onCopySelectedToZones,
}: TaskTableProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const hasSeededCollapse = useRef(false);
  const [showColumnEditor, setShowColumnEditor] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { spaceCaps, assigneeCaps, myUserId } = useBoardAccess();
  // What I may do on a given task: the space's rights plus an assignee's own.
  const capsOf = (taskId: string) =>
    taskRowCaps(spaceCaps, assigneeCaps, !!myUserId && (assigneesByTask.get(taskId) ?? []).includes(myUserId));
  const [sort, setSortState] = useState<{ key: TaskSortKey; dir: SortDirection }>(loadBoardSort);
  const setSort = (next: { key: TaskSortKey; dir: SortDirection }) => {
    setSortState(next);
    saveBoardSort(next);
  };
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);

  // Completed tasks (done / closed) are hidden unless asked for. An open
  // subtask of a hidden completed parent is promoted to the top level
  // (parent_task_id nulled, as TaskBoardPage does for assignee-only views)
  // so open work never disappears with its parent. `tasks` stays the full
  // list for anything that must see everything (e.g. delete wording).
  const [showCompleted, setShowCompleted] = useState(false);
  const isCompleted = (t: TaskRowType) => {
    const category = statusById.get(t.status_id)?.category;
    return category === "done" || category === "closed";
  };
  const completedCount = useMemo(
    () => tasks.filter(isCompleted).length,
    [tasks, statusById],
  );
  const visibleTasks = useMemo(() => {
    if (showCompleted) return tasks;
    const shown = tasks.filter((t) => !isCompleted(t));
    const shownIds = new Set(shown.map((t) => t.id));
    return shown.map((t) =>
      t.parent_task_id && !shownIds.has(t.parent_task_id) ? { ...t, parent_task_id: null } : t,
    );
  }, [tasks, statusById, showCompleted]);

  // Drop selected ids whose task is gone (deleted here or elsewhere,
  // archived) or no longer on screen (completed and hidden) so counts and
  // bulk actions never refer to a ghost.
  const taskIdSet = useMemo(() => new Set(visibleTasks.map((t) => t.id)), [visibleTasks]);
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => taskIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [taskIdSet]);

  // Select-all covers every task on screen, subtasks under collapsed
  // parents included — the bulk bar's delete wording says how many go.
  const selectableIds = visibleTasks.filter((t) => capsOf(t.id).status).map((t) => t.id);
  const allSelected = selectableIds.length > 0 && selectedIds.size === selectableIds.length;
  const someSelected = selectedIds.size > 0 && !allSelected;
  const selectAll = () => setSelectedIds(new Set(selectableIds));
  const clearSelection = () => setSelectedIds(new Set());
  const selectAllRef = useCallback(
    (el: HTMLInputElement | null) => {
      if (el) el.indeterminate = someSelected;
    },
    [someSelected],
  );

  const selectedTasks = tasks.filter((t) => selectedIds.has(t.id));
  const firstDoneStatus = useMemo(
    () => statuses.filter((s) => s.category === "done").sort((a, b) => a.sort_order - b.sort_order)[0],
    [statuses],
  );
  const incompleteSelected = selectedTasks.filter((t) => {
    const category = statusById.get(t.status_id)?.category;
    return category !== "done" && category !== "closed";
  });
  // Ticked only when every selected task has the person.
  const commonAssigneeIds = useMemo(() => {
    if (selectedTasks.length === 0) return [];
    const [first, ...rest] = selectedTasks.map((t) => assigneesByTask.get(t.id) ?? []);
    return first.filter((id) => rest.every((ids) => ids.includes(id)));
  }, [selectedIds, tasks, assigneesByTask]);
  const deleteMessage = (() => {
    const total = withDescendants(tasks, selectedIds).size;
    const extra = total - selectedIds.size;
    return extra > 0
      ? `سيتم حذف ${selectedIds.size} مهمة محددة و${extra} مهمة فرعية تحتها نهائياً.`
      : `سيتم حذف ${selectedIds.size} مهمة نهائياً.`;
  })();

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, TaskRowType[]>();
    for (const t of visibleTasks) {
      const key = t.parent_task_id;
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [visibleTasks]);

  // Seed the collapsed set exactly once per board (the parent remounts
  // this component with key={boardId}) — every task with subtasks starts
  // collapsed, at every depth, not just nested ones: a top-level task's
  // own subtasks used to show open by default, which made a board full
  // of them just as noisy as no collapsing at all. Guarded by a ref
  // rather than "is collapsedIds empty" so that a user expanding every
  // row back to an empty set doesn't get re-collapsed by the next
  // mutation's refetch.
  if (!hasSeededCollapse.current && tasks.length > 0) {
    hasSeededCollapse.current = true;
    const initial = new Set(visibleTasks.filter((t) => childrenByParent.has(t.id)).map((t) => t.id));
    if (initial.size > 0) setCollapsedIds(initial);
  }

  const toggleCollapse = (taskId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const collapseAll = () => {
    setCollapsedIds(new Set(visibleTasks.filter((t) => childrenByParent.has(t.id)).map((t) => t.id)));
  };
  const expandAll = () => setCollapsedIds(new Set());

  // Each level (top-level tasks, and every task's own subtasks) is sorted
  // on its own, so the tree shape never changes — only sibling order.
  const statusOrderById = useMemo(() => new Map(statuses.map((s) => [s.id, s.sort_order])), [statuses]);
  const sortedChildrenByParent = useMemo(() => {
    if (sort.key === "manual" && sort.dir === "asc") return childrenByParent;
    const map = new Map<string | null, TaskRowType[]>();
    for (const [parentId, list] of childrenByParent) {
      map.set(parentId, sortTasks(list, sort.key, sort.dir, statusOrderById));
    }
    return map;
  }, [childrenByParent, sort, statusOrderById]);
  // Drag-and-drop writes the manual order, so it only makes sense while
  // that's the order on screen.
  const canDrag = sort.key === "manual" && sort.dir === "asc";

  const topLevel = sortedChildrenByParent.get(null) ?? [];

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: null, tasks: topLevel }];

    const groupKey = (t: TaskRowType): { key: string; label: string | null } => {
      switch (groupBy) {
        case "zone": {
          if (!t.zone_id) return { key: "none", label: "بدون منطقة" };
          if (t.zone_id === boardZoneId) {
            return { key: t.zone_id, label: zoneName ?? "المنطقة الحالية" };
          }
          return { key: t.zone_id, label: "منطقة أخرى" };
        }
        case "department":
          return t.department_id
            ? { key: t.department_id, label: departmentNamesById.get(t.department_id) ?? "قسم" }
            : { key: "none", label: "بدون قسم" };
        case "assignee": {
          const ids = assigneesByTask.get(t.id) ?? [];
          if (ids.length === 0) return { key: "none", label: "غير معين" };
          const first = employeesById.get(ids[0]);
          return {
            key: ids[0],
            label: first ? `${first.first_name} ${first.last_name ?? ""}` : "موظف",
          };
        }
        case "task_type": {
          const type = taskTypes.get(t.task_type_id);
          return { key: t.task_type_id, label: type?.name_ar ?? "نوع" };
        }
        default:
          return { key: "all", label: null };
      }
    };

    const map = new Map<string, { label: string | null; tasks: TaskRowType[] }>();
    for (const t of topLevel) {
      const { key, label } = groupKey(t);
      const entry = map.get(key) ?? { label, tasks: [] };
      entry.tasks.push(t);
      map.set(key, entry);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, label: v.label, tasks: v.tasks }));
  }, [groupBy, topLevel, boardZoneId, zoneName, departmentNamesById, assigneesByTask, employeesById, taskTypes]);

  // The bulk bar fades out as well as in: it stays mounted for the length of
  // the transition after the selection empties, rendered from the last
  // non-empty selection's props so it doesn't flash "0 selected".
  const hasSelection = selectedIds.size > 0;
  const [panelMounted, setPanelMounted] = useState(false);
  useEffect(() => {
    if (hasSelection) {
      setPanelMounted(true);
      return;
    }
    const timer = setTimeout(() => setPanelMounted(false), 220);
    return () => clearTimeout(timer);
  }, [hasSelection]);
  const lastPanelElement = useRef<ReactElement<{ visible: boolean }> | null>(null);
  if (hasSelection) {
    lastPanelElement.current = (
        <BulkActionPanel
          selectedCount={selectedIds.size}
          totalCount={selectableIds.length}
          canStatus={selectedTasks.every((t) => capsOf(t.id).status)}
          canEdit={selectedTasks.every((t) => capsOf(t.id).edit)}
          canDelete={selectedTasks.every((t) => capsOf(t.id).delete)}
          statuses={statuses}
          showPriority={featureSettings.priorities}
          employeesById={employeesById}
          allEmployees={allEmployees}
          projectId={projectId}
          commonAssigneeIds={commonAssigneeIds}
          incompleteCount={incompleteSelected.length}
          deleteMessage={deleteMessage}
          onSelectAll={selectAll}
          onClear={clearSelection}
          onComplete={async () => {
            if (!firstDoneStatus) return;
            await onBulkSetStatus(
              incompleteSelected.map((t) => t.id),
              firstDoneStatus.id,
            );
            clearSelection();
          }}
          onSetStatus={async (statusId) => {
            await onBulkSetStatus(Array.from(selectedIds), statusId);
            clearSelection();
          }}
          onSetPriority={async (priority) => {
            await onBulkSetPriority(Array.from(selectedIds), priority);
            clearSelection();
          }}
          onAssignChange={(add, remove) => onBulkAssign(Array.from(selectedIds), add, remove)}
          onDelete={async () => {
            await onBulkDelete(Array.from(selectedIds));
            clearSelection();
          }}
          onPush={
            onPushSelected
              ? () => {
                  onPushSelected(Array.from(selectedIds));
                  clearSelection();
                }
              : undefined
          }
          onCopyToZones={
            onCopySelectedToZones
              ? () => {
                  onCopySelectedToZones(Array.from(selectedIds));
                  clearSelection();
                }
              : undefined
          }
          visible
        />
    );
  } else if (lastPanelElement.current) {
    lastPanelElement.current = cloneElement(lastPanelElement.current, { visible: false });
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-600 outline-none"
        >
          {(Object.keys(GROUP_LABELS) as GroupBy[])
            .filter((g) => g !== "task_type" || featureSettings.task_types)
            .map((g) => (
              <option key={g} value={g}>
                {GROUP_LABELS[g]}
              </option>
            ))}
        </select>
        <div className="flex items-center gap-1.5">
          <select
            value={sort.key}
            onChange={(e) => {
              const key = e.target.value as TaskSortKey;
              setSort({ key, dir: taskSortOption(key).defaultDir });
            }}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 outline-none"
            title="ترتيب المهام"
          >
            {TASK_SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                ترتيب: {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setSort({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" })}
            className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            title={canDrag ? "عكس الاتجاه" : "عكس الاتجاه — السحب والإفلات متاح في الترتيب اليدوي فقط"}
          >
            {sort.dir === "asc" ? <ArrowUpNarrowWide className="h-3.5 w-3.5" /> : <ArrowDownWideNarrow className="h-3.5 w-3.5" />}
            {sort.dir === "asc" ? taskSortOption(sort.key).ascLabel : taskSortOption(sort.key).descLabel}
          </button>
          <span className="mx-1 h-4 w-px bg-gray-200" />
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
              showCompleted
                ? "border-primary bg-primary-superLight text-primary"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            title={showCompleted ? "إخفاء المهام المكتملة" : "إظهار المهام المكتملة"}
          >
            {showCompleted ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showCompleted ? "إخفاء المكتملة" : "إظهار المكتملة"}
            {completedCount > 0 && <span className="text-gray-400">({completedCount})</span>}
          </button>
          <button
            onClick={expandAll}
            className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            <ChevronsDown className="h-3.5 w-3.5" />
            توسيع الكل
          </button>
          <button
            onClick={collapseAll}
            className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            <ChevronsUp className="h-3.5 w-3.5" />
            طي الكل
          </button>
        </div>
      </div>

      {panelMounted && lastPanelElement.current}

      <div
        style={rowGridStyle(customColumns.length, featureSettings.priorities)}
        className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-2 py-2 text-xs font-semibold text-gray-500"
      >
        <div className="flex min-w-0 items-center gap-1">
          {/* same slot order as TaskRow: drag grip, then the checkbox */}
          <span className="w-4 shrink-0" />
          <span className="flex w-4 shrink-0 items-center">
            {selectableIds.length > 0 && (
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={() => (allSelected ? clearSelection() : selectAll())}
                className="h-3.5 w-3.5 cursor-pointer"
                title={allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
              />
            )}
          </span>
          عنوان المهمة
        </div>
        <div>الحالة</div>
        {featureSettings.priorities && <div>الأولوية</div>}
        <div>الفريق</div>
        <div>تاريخ البدء</div>
        <div title="أيام العمل (بدون الجمعة)">المدة</div>
        <div>الاستحقاق</div>
        <div>القسم</div>
        {customColumns.map((col) => (
          <CustomColumnHeader
            key={col.boardColumnId}
            column={col}
            canManage={spaceCaps.manage}
            onRename={(name_ar) => onRenameField(col.fieldDefinitionId, name_ar)}
            onDetach={() => onDetachColumn(col.boardColumnId)}
            onHide={() => onSetColumnVisibility(col.boardColumnId, false)}
          />
        ))}
        {spaceCaps.manage ? (
          <button
            onClick={() => setShowColumnEditor(true)}
            title="إضافة عمود"
            className="flex items-center justify-center text-gray-300 hover:text-gray-500"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        ) : (
          <div />
        )}
      </div>

      {showColumnEditor && (
        <ColumnEditorModal
          attachedFieldIds={new Set(customColumns.map((c) => c.fieldDefinitionId))}
          hiddenColumns={hiddenColumns}
          onAttach={(fieldId) => {
            onAttachField(fieldId);
            setShowColumnEditor(false);
          }}
          onCreate={(input) => {
            onCreateAndAttachField({ ...input, config: input.config as Json });
            setShowColumnEditor(false);
          }}
          onUnhide={(boardColumnId) => onSetColumnVisibility(boardColumnId, true)}
          onClose={() => setShowColumnEditor(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.key}>
            {group.label && (
              <div className="border-b border-gray-100 bg-gray-50/60 px-3 py-1.5 text-xs font-medium text-gray-500">
                {group.label}{" "}
                <span className="text-gray-400">({group.tasks.length})</span>
              </div>
            )}
            {group.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                boardId={boardId}
                depth={0}
                childrenByParent={sortedChildrenByParent}
                canDrag={canDrag}
                collapsedIds={collapsedIds}
                onToggleCollapse={toggleCollapse}
                statuses={statuses}
                employeesById={employeesById}
                allEmployees={allEmployees}
                assigneesByTask={assigneesByTask}
                taskTypes={taskTypes}
                departmentNamesById={departmentNamesById}
                linkedTaskIds={linkedTaskIds}
                dependencyFlags={dependencyFlags}
                dependencyLinks={dependencyLinks}
                onLink={onLink}
                onUnlink={onUnlink}
                unmetRequirementTaskIds={unmetRequirementTaskIds}
                attachedTaskIds={attachedTaskIds}
                commentedTaskIds={commentedTaskIds}
                tagsByTask={tagsByTask}
                subtaskProgressByTask={subtaskProgressByTask}
                customColumns={customColumns}
                valuesByTask={valuesByTask}
                showPriority={featureSettings.priorities}
                showTaskType={featureSettings.task_types}
                onChangeStatus={onChangeStatus}
                onChangeTaskType={onChangeTaskType}
                onChangePriority={onChangePriority}
                onChangeStartDate={onChangeStartDate}
                onChangeDueDate={onChangeDueDate}
                onChangeDuration={onChangeDuration}
                onChangeLag={onChangeLag}
                onChangeAssignees={onChangeAssignees}
                onCreateTask={onCreateTask}
                onRenameTask={onRenameTask}
                onChangeValue={onChangeValue}
                draggedId={draggedId}
                onDragStart={setDraggedId}
                onDragEnd={() => setDraggedId(null)}
                onMoveTaskTo={onMoveTaskTo}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        ))}

        {tasks.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-400">
            لا توجد مهام في هذه اللوحة بعد
          </div>
        )}
        {tasks.length > 0 && visibleTasks.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-400">
            كل مهام هذه اللوحة مكتملة ({completedCount}) — اضغط «إظهار المكتملة» لعرضها
          </div>
        )}

        {spaceCaps.create && (
          // A task needs a start and its working days, so adding one always
          // goes through the create dialog.
          <button
            onClick={() => onCreateTask("", null)}
            className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600"
          >
            <Plus className="h-3.5 w-3.5" />
            إضافة مهمة
          </button>
        )}
      </div>
    </div>
  );
}

const FIELD_TYPE_LABELS: Record<CustomColumn["type"], string> = {
  text: "نص",
  long_text: "نص طويل",
  number: "رقم",
  currency: "عملة",
  date: "تاريخ",
  select: "اختيار واحد",
  multi_select: "اختيار متعدد",
  user: "مستخدم",
  checkbox: "مربع اختيار",
  url: "رابط",
  email: "بريد إلكتروني",
  phone: "هاتف",
  formula: "معادلة",
  relationship: "علاقة",
};

// The fixed built-in columns (status/priority/assignee/date/department)
// aren't backed by field_definitions, so there's nothing for a "···" on
// them to actually edit/hide/delete — only attached custom columns get
// one, and it does something real (rename the shared field, or detach
// this column from just this board, which build plan §4.11 confirms is
// non-destructive since task_values survive it). "Hide" is reversible —
// setColumnVisibility just flips is_visible, and the "+" modal's hidden-
// columns list is the only way back, so both must ship together.
function CustomColumnHeader({
  column,
  canManage,
  onRename,
  onDetach,
  onHide,
}: {
  column: CustomColumn;
  canManage: boolean;
  onRename: (name_ar: string) => void;
  onDetach: () => void;
  onHide: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(column.name_ar);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => {
    setOpen(false);
    setRenaming(false);
  });

  if (renaming) {
    return (
      <input
        autoFocus
        value={nameDraft}
        onChange={(e) => setNameDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        onBlur={() => {
          const value = nameDraft.trim();
          if (value && value !== column.name_ar) onRename(value);
          setRenaming(false);
        }}
        className="w-full rounded border border-gray-300 bg-white px-1 py-0.5 text-xs outline-none"
      />
    );
  }

  return (
    <div ref={ref} className="relative flex items-center justify-between gap-1">
      <span className="truncate" title={FIELD_TYPE_LABELS[column.type]}>
        {column.name_ar}
        <span className="mr-1 text-[10px] font-normal text-gray-400">({FIELD_TYPE_LABELS[column.type]})</span>
      </span>
      {canManage && (
        <button onClick={() => setOpen((v) => !v)} className="shrink-0 text-gray-300 hover:text-gray-500">
          <MoreHorizontal className="h-3 w-3" />
        </button>
      )}
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            onClick={() => {
              setRenaming(true);
              setOpen(false);
            }}
            className="block w-full px-3 py-1.5 text-right text-xs hover:bg-gray-50"
          >
            تعديل الاسم
          </button>
          <button
            onClick={() => {
              onHide();
              setOpen(false);
            }}
            className="block w-full px-3 py-1.5 text-right text-xs hover:bg-gray-50"
          >
            إخفاء العمود
          </button>
          <button onClick={onDetach} className="block w-full px-3 py-1.5 text-right text-xs text-red-500 hover:bg-red-50">
            إزالة العمود
          </button>
        </div>
      )}
    </div>
  );
}

// The board's sort choice, remembered per browser (a convenience — it's
// fine for it to be missing, e.g. storage blocked, and fall back to manual).
const BOARD_SORT_STORAGE_KEY = "tasks.boardSort";

function loadBoardSort(): { key: TaskSortKey; dir: SortDirection } {
  try {
    const raw = localStorage.getItem(BOARD_SORT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { key?: string; dir?: string };
      if (TASK_SORT_OPTIONS.some((o) => o.key === parsed.key) && (parsed.dir === "asc" || parsed.dir === "desc")) {
        return { key: parsed.key as TaskSortKey, dir: parsed.dir };
      }
    }
  } catch {
    // unreadable storage — use the default
  }
  return { key: "manual", dir: "asc" };
}

function saveBoardSort(sort: { key: TaskSortKey; dir: SortDirection }) {
  try {
    localStorage.setItem(BOARD_SORT_STORAGE_KEY, JSON.stringify(sort));
  } catch {
    // storage unavailable — the choice just won't be remembered
  }
}
