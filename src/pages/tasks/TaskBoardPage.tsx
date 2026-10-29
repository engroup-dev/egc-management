import { useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { FileStack, ChevronRight, List, ChartGantt, Workflow, SquareKanban } from "lucide-react";
import { useTaskBoard } from "../../hooks/tasks/useTaskBoard";
import TaskTable from "../../components/tasks/board/TaskTable";
import BoardSwitcher from "../../components/tasks/board/BoardSwitcher";
import TaskGantt from "../../components/tasks/gantt/TaskGantt";
import TaskFlow from "../../components/tasks/flow/TaskFlow";
import TaskTypeBoard from "../../components/tasks/kanban/TaskTypeBoard";
import TemplatePickerModal from "../../components/tasks/templates/TemplatePickerModal";
import ZoneBar from "../../components/tasks/zones/ZoneBar";
import ImportTasksDialog from "../../components/tasks/zones/ImportTasksDialog";
import CopyToZonesDialog from "../../components/tasks/zones/CopyToZonesDialog";
import { TemplateModeProvider } from "../../components/tasks/TemplateModeContext";
import { TemplateRolesProvider } from "../../components/tasks/TemplateRolesContext";
import { useTaskRoles } from "../../hooks/tasks/useTaskRoles";
import TemplateSyncBanner from "../../components/tasks/templates/TemplateSyncBanner";
import PushToBoardsModal from "../../components/tasks/templates/PushToBoardsModal";
import TemplateChangesModal from "../../components/tasks/templates/TemplateChangesModal";
import { useTemplateSyncActions, useTemplateSyncStatus } from "../../hooks/tasks/useTemplateSync";
import { NO_CAPS, taskRowCaps, useMyTaskAccess, useSpaceCaps } from "../../hooks/tasks/useTaskAccess";
import { HIGHLIGHT_FILL, useFlowState } from "../../hooks/tasks/useFlowState";
import { archiveTasks } from "../../hooks/tasks/taskArchive";
import { BoardAccessProvider } from "../../components/tasks/BoardAccessContext";
import { TaskListPageSkeleton } from "../../components/tasks/TasksSkeletons";
import { useCreateTaskDialog } from "../../components/tasks/schedule/CreateTaskDialogContext";
import { useDependencyEdit } from "../../hooks/tasks/dependencyEdit";

// D2 — Zone board (list view), the main screen (build plan Part 7).
// Also the template editor: a template is a board with is_template set
// (opened from /tasks/admin/templates), rendered here in template mode —
// see TemplateModeContext.tsx for what that changes.
//
// `view` comes from the route (TasksRoutes.tsx): board/:id is the list,
// board/:id/gantt the Gantt, board/:id/flow the link diagram and
// board/:id/types the board by task type — the last two (and the Gantt's
// 2026-10-17 redesign) after Construction Flow, the tool a client gave us as
// the model (plans/construction-flow-comparison/). All four read the same
// useTaskBoard query, so switching is instant and edits made in one show up
// in the others.
export type BoardView = "list" | "gantt" | "flow" | "types";

const VIEW_TABS: { view: BoardView; path: string; label: string; Icon: typeof List }[] = [
  { view: "list", path: "", label: "قائمة", Icon: List },
  { view: "gantt", path: "/gantt", label: "مخطط زمني", Icon: ChartGantt },
  { view: "flow", path: "/flow", label: "مخطط الروابط", Icon: Workflow },
  { view: "types", path: "/types", label: "الأنواع", Icon: SquareKanban },
];

export default function TaskBoardPage({ view }: { view: BoardView }) {
  const { boardId } = useParams<{ boardId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    data,
    loading,
    error,
    employeesById,
    updateStatus,
    updateTaskType,
    updatePriority,
    updateTitle,
    updateStartDate,
    updateDueDate,
    updateTaskDates,
    updateDuration,
    updateLag,
    setAssignees,
    bulkSetStatus,
    bulkSetPriority,
    bulkAssign,
    bulkDelete,
    setTaskValue,
    attachField,
    createAndAttachField,
    detachColumn,
    setColumnVisibility,
    renameField,
    moveTaskTo,
  } = useTaskBoard(boardId);
  const { openCreateTask } = useCreateTaskDialog();
  const { link, unlink, reverse, setLinkType } = useDependencyEdit(boardId);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showImport, setShowImport] = useState(false);
  // "نسخ إلى مناطق أخرى": the tasks the dialog copies.
  const [copyTaskIds, setCopyTaskIds] = useState<string[] | null>(null);
  // The free diagram's shared layout + the tasks' highlight colours (every view shows them).
  const flowState = useFlowState(boardId, data?.tasks.map((t) => t.id) ?? []);
  // Template push (useTemplateSync.ts): the task ids the dialog opens with.
  const [pushTaskIds, setPushTaskIds] = useState<string[] | null>(null);
  const [reviewingChanges, setReviewingChanges] = useState(false);
  const { status: syncStatus } = useTemplateSyncStatus(boardId);
  const { dismiss } = useTemplateSyncActions();
  // Project roles on a template's tasks (useTaskRoles.ts) — loaded only for templates.
  const { rolesByTask, setTaskRoles } = useTaskRoles(
    boardId,
    data?.tasks.map((t) => t.id) ?? [],
    !!data?.board.is_template,
  );

  // What I may do here. The server computes it (tasks.my_access); all false
  // until it answers, so nothing editable flashes up for a moment.
  const { access, userId } = useMyTaskAccess();
  const spaceCaps = useSpaceCaps(data?.board.space_id);
  const boardAccess = useMemo(
    () => ({ spaceCaps, assigneeCaps: access?.assignee_caps ?? NO_CAPS, myUserId: userId }),
    [spaceCaps, access, userId],
  );

  if (loading) {
    return <TaskListPageSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        اللوحة غير متاحة أو تعذّر تحميلها
      </div>
    );
  }

  const isTemplate = data.board.is_template;
  // Per task: an assignee may edit their own task even without space rights.
  const canEditTask = (taskId: string) =>
    taskRowCaps(spaceCaps, access?.assignee_caps, !!userId && (data.assigneesByTask.get(taskId) ?? []).includes(userId)).edit;
  const highlightFills = new Map(
    Array.from(flowState.state.highlights, ([taskId, color]) => [taskId, HIGHLIGHT_FILL[color]]),
  );
  const deleteTasks = (taskIds: string[]) => {
    const titles = taskIds.map((id) => data.tasks.find((t) => t.id === id)?.title ?? "");
    void archiveTasks(taskIds, taskIds.length > 1 ? `حذف ${taskIds.length} مهام` : `حذف «${titles[0]}»`);
    const openTaskId = location.pathname.match(/\/task\/([^/]+)$/)?.[1];
    if (openTaskId && taskIds.includes(openTaskId)) navigate(location.pathname.replace(/\/task\/[^/]+$/, ""));
  };
  // A task needs a start and working days (a "Day N" on a template): always
  // the create dialog.
  const addTask = (title: string, parentTaskId: string | null) =>
    openCreateTask({ boardId: data.board.id, parentTaskId, title });

  // Without a view on the whole space (an assignee reaching the board from
  // the sidebar) the board shows only the tasks assigned to me. A task whose
  // parent is not one of mine is shown at the top level. (Row-level security
  // would do this on the server; until then the screen does it.)
  const boardTasks = spaceCaps.view || !userId
    ? data.tasks
    : data.tasks
        .filter((t) => (data.assigneesByTask.get(t.id) ?? []).includes(userId))
        .map((t, _i, mine) =>
          t.parent_task_id && !mine.some((m) => m.id === t.parent_task_id) ? { ...t, parent_task_id: null } : t,
        );
  // Pushing only makes sense on a template, or on a board built from one.
  const canPush = !!syncStatus && (isTemplate || syncStatus.templateBoards.length > 0);
  const pendingTaskIds = canPush && spaceCaps.edit ? syncStatus.pendingTaskIds : [];
  // edits / removals on a template since boards took their copies
  const changedCount = isTemplate && spaceCaps.edit ? (syncStatus?.changedTaskIds.length ?? 0) : 0;
  const removedCount = isTemplate && spaceCaps.edit ? (syncStatus?.removedCount ?? 0) : 0;

  return (
    <TemplateModeProvider value={isTemplate}>
    <TemplateRolesProvider value={isTemplate ? { rolesByTask, setTaskRoles } : null}>
    <BoardAccessProvider value={boardAccess}>
    <div className="flex h-full flex-col" dir="rtl">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-2">
          {isTemplate && (
            <Link to="/tasks/admin/templates" className="text-gray-400 hover:text-gray-600" title="القوالب">
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
          <h1 className="text-base font-semibold text-gray-900">{data.board.name}</h1>
          {!isTemplate && (
            <BoardSwitcher spaceId={data.board.space_id} currentBoardId={data.board.id} view={view} />
          )}
          {isTemplate && (
            <span className="flex items-center gap-1 rounded-full bg-primary-superLight px-2 py-0.5 text-xs font-medium text-primary">
              <FileStack className="h-3 w-3" />
              قالب
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-gray-200 text-sm">
            {VIEW_TABS.map(({ view: tab, path, label, Icon }, i) => (
              <Link
                key={tab}
                to={`/tasks/board/${data.board.id}${path}`}
                className={`flex items-center gap-1.5 px-3 py-1.5 ${i > 0 ? "border-r border-gray-200" : ""} ${
                  view === tab ? "bg-primary-superLight font-medium text-primary" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            ))}
          </div>
          {spaceCaps.create && (
          <button
            onClick={() => setShowTemplatePicker(true)}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <FileStack className="h-3.5 w-3.5" />
            استخدام قالب
          </button>
          )}
        </div>
      </div>

      {!isTemplate && (
        <ZoneBar
          spaceId={data.board.space_id}
          projectId={data.projectId}
          currentBoardId={data.board.id}
          view={view}
          canCreate={spaceCaps.create}
          canEdit={spaceCaps.edit}
          currentRootTaskIds={data.tasks.filter((t) => !t.parent_task_id).map((t) => t.id)}
          onImport={() => setShowImport(true)}
        />
      )}

      {(pendingTaskIds.length > 0 || changedCount > 0 || removedCount > 0) && (
        <TemplateSyncBanner
          isTemplate={isTemplate}
          pendingCount={pendingTaskIds.length}
          changedCount={changedCount}
          removedCount={removedCount}
          onPush={() => setPushTaskIds(pendingTaskIds)}
          onDismiss={() => dismiss({ boardId: data.board.id, taskIds: pendingTaskIds })}
          onReviewChanges={() => setReviewingChanges(true)}
        />
      )}

      <div className="flex-1 overflow-hidden">
        {view === "flow" ? (
          <TaskFlow
            key={boardId}
            tasks={boardTasks}
            statuses={data.statuses}
            taskTypes={data.taskTypes}
            dependencies={data.dependencies}
            dependencyFlags={data.dependencyFlags}
            onOpenTask={(taskId) => navigate(`/tasks/board/${data.board.id}/flow/task/${taskId}`)}
            onLink={(pair) => link(pair)}
            onUnlink={(pair) => unlink([pair])}
            onReverseLink={(pair) => reverse(pair)}
            onChangeLinkType={(pair, linkType) => setLinkType({ pair, linkType })}
            onAddAfter={
              spaceCaps.create
                ? (taskId, parentTaskId) =>
                    openCreateTask({
                      boardId: data.board.id,
                      parentTaskId,
                      // "after" needs a scheduled task; an unscheduled one just gives the parent
                      anchorTaskId: data.tasks.find((t) => t.id === taskId)?.start_date ? taskId : undefined,
                    })
                : undefined
            }
            onAddTask={spaceCaps.create ? (parentTaskId) => addTask("", parentTaskId) : undefined}
            readOnly={!spaceCaps.edit && !boardTasks.some((t) => canEditTask(t.id))}
            canEditTask={canEditTask}
            flow={{
              state: flowState.state,
              canEditLayout: spaceCaps.edit,
              onSavePositions: (moved, seed) => flowState.savePositions({ moved, seed }),
              onSetMode: (mode, seed) => flowState.setMode({ mode, seed }),
              onSetKeepAfterBlockers: flowState.setKeepAfterBlockers,
              onSetHighlight: (taskIds, color) => flowState.setHighlight({ taskIds, color }),
              onClearHighlights: () => flowState.clearHighlights(),
              onTaskToItem: (taskId, targetId, title) => flowState.taskToItem({ taskId, targetId, title }),
              onItemToTask: (item) => flowState.itemToTask({ item }),
              onToggleItem: (itemId, checked) => flowState.toggleItem({ itemId, checked }),
            }}
            onRenameTask={(taskId, title) => updateTitle({ taskId, title })}
            onChangeDays={(taskId, days) => updateDuration({ taskId, days })}
            onDeleteTasks={deleteTasks}
            onCopyToZones={!isTemplate && spaceCaps.create ? setCopyTaskIds : undefined}
            storageKey={data.board.id}
          />
        ) : view === "types" ? (
          <TaskTypeBoard
            key={boardId}
            tasks={boardTasks}
            statuses={data.statuses}
            taskTypes={data.taskTypes}
            assigneesByTask={data.assigneesByTask}
            employeesById={employeesById}
            dependencyFlags={data.dependencyFlags}
            onOpenTask={(taskId) => navigate(`/tasks/board/${data.board.id}/types/task/${taskId}`)}
            onChangeTaskType={(taskId, taskTypeId) => updateTaskType({ taskId, taskTypeId })}
            canAddType={!!access?.edit_all}
            highlights={highlightFills}
          />
        ) : view === "gantt" ? (
          <TaskGantt
            key={boardId}
            tasks={boardTasks}
            highlights={highlightFills}
            onOpenTask={(taskId) => navigate(`/tasks/board/${data.board.id}/gantt/task/${taskId}`)}
            statuses={data.statuses}
            taskTypes={data.taskTypes}
            dependencies={data.dependencies}
            dependencyFlags={data.dependencyFlags}
            onChangeDates={(taskId, change) => updateTaskDates({ taskId, ...change })}
            onLink={(pair) => link(pair)}
            onUnlink={(pair) => unlink([pair])}
            onReverseLink={(pair) => reverse(pair)}
            onAddTask={spaceCaps.create ? () => addTask("", null) : undefined}
            readOnly={!spaceCaps.edit}
          />
        ) : (
          <TaskTable
            key={boardId}
            boardId={data.board.id}
            boardZoneId={data.board.zone_id}
            zoneName={data.zoneName}
            tasks={boardTasks}
            statuses={data.statuses}
            employeesById={employeesById}
            allEmployees={data.employees}
            assigneesByTask={data.assigneesByTask}
            taskTypes={data.taskTypes}
            departmentNamesById={data.departmentNamesById}
            linkedTaskIds={data.linkedTaskIds}
            dependencyFlags={data.dependencyFlags}
            dependencyLinks={data.dependencyLinks}
            onLink={(pair) => link(pair)}
            onUnlink={(pairs) => unlink(pairs)}
            unmetRequirementTaskIds={data.unmetRequirementTaskIds}
            attachedTaskIds={data.attachedTaskIds}
            commentedTaskIds={data.commentedTaskIds}
            tagsByTask={data.tagsByTask}
            subtaskProgressByTask={data.subtaskProgressByTask}
            customColumns={data.customColumns}
            hiddenColumns={data.hiddenColumns}
            valuesByTask={data.valuesByTask}
            featureSettings={data.featureSettings}
            onChangeStatus={(taskId, statusId) => updateStatus({ taskId, statusId })}
            onChangeTaskType={(taskId, taskTypeId) => updateTaskType({ taskId, taskTypeId })}
            onChangePriority={(taskId, priority) => updatePriority({ taskId, priority })}
            onChangeStartDate={(taskId, startDate) => updateStartDate({ taskId, startDate })}
            onChangeDueDate={(taskId, dueDate) => updateDueDate({ taskId, dueDate })}
            onChangeDuration={(taskId, days) => updateDuration({ taskId, days })}
            onChangeLag={(taskId, lagDays) => updateLag({ taskId, lagDays })}
            onChangeAssignees={(taskId, userIds) => setAssignees({ taskId, userIds })}
            onCreateTask={addTask}
            onRenameTask={(taskId, title) => updateTitle({ taskId, title })}
            onChangeValue={(taskId, fieldDefinitionId, value) => setTaskValue({ taskId, fieldDefinitionId, value })}
            onAttachField={attachField}
            onCreateAndAttachField={createAndAttachField}
            onDetachColumn={detachColumn}
            onSetColumnVisibility={(boardColumnId, visible) => setColumnVisibility({ boardColumnId, visible })}
            onRenameField={(fieldDefinitionId, name_ar) => renameField({ fieldDefinitionId, name_ar })}
            onMoveTaskTo={moveTaskTo}
            projectId={data.projectId}
            onBulkSetStatus={(taskIds, statusId) => bulkSetStatus({ taskIds, statusId })}
            onBulkSetPriority={(taskIds, priority) => bulkSetPriority({ taskIds, priority })}
            onBulkAssign={(taskIds, add, remove) => bulkAssign({ taskIds, add, remove })}
            onBulkDelete={async (taskIds) => {
              const deletedIds = await bulkDelete({ taskIds });
              // The detail slide-over may be open on a task that just went.
              const openTaskId = location.pathname.match(/\/task\/([^/]+)$/)?.[1];
              if (openTaskId && deletedIds.has(openTaskId)) {
                navigate(location.pathname.replace(/\/task\/[^/]+$/, ""));
              }
            }}
            onPushSelected={canPush && spaceCaps.edit ? setPushTaskIds : undefined}
            onCopySelectedToZones={!isTemplate && spaceCaps.create && data.board.zone_id ? setCopyTaskIds : undefined}
          />
        )}
      </div>

      {/* D3 slide-over, nested route board/:boardId/task/:taskId — see
          TasksRoutes.tsx. TaskDetailPanel itself is a fixed overlay, so
          this Outlet mounting here (rather than replacing the list) is
          what keeps the board visible behind it. */}
      <Outlet />

      {showTemplatePicker && (
        <TemplatePickerModal
          spaceId={data.board.space_id}
          currentBoardId={data.board.id}
          onClose={() => setShowTemplatePicker(false)}
          onApplied={() => setShowTemplatePicker(false)}
        />
      )}

      {pushTaskIds && syncStatus && (
        <PushToBoardsModal
          boardId={data.board.id}
          isTemplate={isTemplate}
          status={syncStatus}
          tasks={data.tasks}
          initialTaskIds={pushTaskIds}
          onClose={() => setPushTaskIds(null)}
        />
      )}

      {reviewingChanges && (
        <TemplateChangesModal templateBoardId={data.board.id} onClose={() => setReviewingChanges(false)} />
      )}

      {showImport && (
        <ImportTasksDialog
          spaceId={data.board.space_id}
          targetBoardId={data.board.id}
          targetZoneName={data.zoneName ?? data.board.name}
          targetTasks={data.tasks}
          onClose={() => setShowImport(false)}
        />
      )}

      {copyTaskIds && copyTaskIds.length > 0 && (
        <CopyToZonesDialog
          spaceId={data.board.space_id}
          sourceBoardId={data.board.id}
          taskIds={copyTaskIds}
          label={
            copyTaskIds.length === 1
              ? (data.tasks.find((t) => t.id === copyTaskIds[0])?.title ?? "")
              : `${copyTaskIds.length} مهام`
          }
          onClose={() => setCopyTaskIds(null)}
        />
      )}
    </div>
    </BoardAccessProvider>
    </TemplateRolesProvider>
    </TemplateModeProvider>
  );
}
