import type { CSSProperties, ReactNode } from "react";
import { Link2, Camera, Paperclip, MessageSquare, AlignLeft } from "lucide-react";
import DependencyBadges from "./DependencyBadges";
import { RowDependencyIcons, RowLinkOverlays, useRowLinkMenu } from "./RowLinkMenu";
import type { DependencyFlags, TaskLinks } from "../../../hooks/tasks/dependencyFlags";
import StatusCell from "./StatusCell";
import PriorityCell from "./PriorityCell";
import DateCell from "./DateCell";
import StartDateCell from "./StartDateCell";
import CompletedAtCell from "./CompletedAtCell";
import TaskSourceCell from "./TaskSourceCell";
import AssigneeCell from "./AssigneeCell";
import TaskTypeCell from "./TaskTypeCell";
import Tooltip from "../../ui/Tooltip";
import type { DependencyPair, StatusRow, TaskRow as TaskRowType, TaskTypeLite, TagLite } from "../../../hooks/tasks/useTaskBoard";
import type { AssignablePerson } from "../../../hooks/tasks/useAssignablePeople";
import { NO_CAPS, taskRowCaps, useMyTaskAccess } from "../../../hooks/tasks/useTaskAccess";
import { useDirectoryColumns } from "./DirectoryColumnContext";

// A leaner sibling of board/TaskRow.tsx for the cross-board directory
// views (AssigneeViewPage, TaskTypeViewPage) — same inline-edit cells
// (StatusCell/PriorityCell/AssigneeCell/StartDateCell/DateCell/
// TaskTypeCell, all already self-contained/portal-based), but flat: no
// per-board custom columns, no drag-to-reorder, no depth/tree nesting —
// grouping by assignee or task type cuts across the parent/child tree,
// so a subtask renders as its own row with a small parent-link instead
// of nested under its parent.

// Every optional column is opt-in because four pages share this grid —
// AssigneeViewPage, TaskTypeViewPage, ProjectViewPage and SpaceTasksPage
// — and each renders its own hardcoded header-label row. Adding a track
// unconditionally would silently knock the others' headers out of
// alignment with their rows.
//
// Built as a track list rather than by concatenating strings because the
// source column sits in the MIDDLE (right after the title), so position
// matters and a `${fixed} 104px` suffix can't express it. The order here
// must match the order the cells are rendered in below, and the order of
// the <div> labels in each page's header row.
export interface DirectoryColumnOptions {
  showPriority?: boolean;
  /** Space › board, for the cross-board views where a row's origin isn't
   * implied by its grouping. */
  showSource?: boolean;
  /** Read-only completion time. */
  showCompleted?: boolean;
}

export function directoryRowGridStyle({
  showPriority = true,
  showSource = false,
  showCompleted = false,
}: DirectoryColumnOptions = {}): CSSProperties {
  const tracks = ["minmax(320px, 2fr)"]; // title
  if (showSource) tracks.push("160px"); // zone
  tracks.push("140px"); // status
  if (showPriority) tracks.push("100px"); // priority
  tracks.push("130px", "130px", "130px"); // team, start date, due date
  if (showCompleted) tracks.push("135px");

  return {
    display: "grid",
    gridTemplateColumns: tracks.join(" "),
    alignItems: "center",
    gap: "1rem",
  };
}

interface DirectoryTaskRowProps {
  task: TaskRowType;
  statuses: StatusRow[];
  employeesById: Map<string, AssignablePerson>;
  allEmployees: AssignablePerson[];
  assigneesByTask: Map<string, string[]>;
  taskTypes: Map<string, TaskTypeLite>;
  tagsByTask: Map<string, TagLite[]>;
  parentTitle?: string;
  /** The space this task's board lives in — what I may do here depends on it. */
  spaceId?: string;
  linkedTaskIds: Set<string>;
  dependencyFlags: Map<string, DependencyFlags>;
  unmetRequirementTaskIds: Set<string>;
  attachedTaskIds: Set<string>;
  commentedTaskIds: Set<string>;
  showPriority?: boolean;
  /** Adds a read-only "space › board" column. Needs boardNamesById and
   * spaceNameByBoardId to be passed too. */
  showSource?: boolean;
  /** Adds a read-only completion-time column. */
  showCompleted?: boolean;
  /** Both only read when showSource is set. */
  boardNamesById?: Map<string, string>;
  spaceNameByBoardId?: Map<string, string>;
  /** Small extra marker right after the title (the space tour's "this
   * week" / "updated" pills). */
  titleBadge?: ReactNode;
  onOpenTask: (taskId: string) => void;
  onChangeStatus: (taskId: string, statusId: string) => void;
  onChangeTaskType: (taskId: string, taskTypeId: string) => void;
  onChangePriority: (taskId: string, priority: TaskRowType["priority"]) => void;
  onChangeStartDate: (taskId: string, date: string | null) => void;
  onChangeDueDate: (taskId: string, date: string | null) => void;
  onChangeAssignees: (taskId: string, userIds: string[]) => void;
  /** Remove a linked task's wait gap (useTaskDirectory's clearLag). */
  onClearLag?: (taskId: string) => void;
  /** Link editing like the board row (right-click menu, clickable ⛔ / !
   * icons). All four together; without them the row has neither. */
  linkEditing?: {
    dependencyLinks: Map<string, TaskLinks>;
    /** The task's board, in board order (not this page's sort). */
    childrenByParent: Map<string | null, TaskRowType[]>;
    onLink: (pair: DependencyPair) => void;
    onUnlink: (pairs: DependencyPair[]) => void;
  };
}

export default function DirectoryTaskRow({
  task,
  statuses,
  employeesById,
  allEmployees,
  assigneesByTask,
  taskTypes,
  tagsByTask,
  parentTitle,
  spaceId,
  linkedTaskIds,
  dependencyFlags,
  unmetRequirementTaskIds,
  attachedTaskIds,
  commentedTaskIds,
  showPriority = true,
  showSource = false,
  showCompleted = false,
  boardNamesById,
  spaceNameByBoardId,
  titleBadge,
  onOpenTask,
  onChangeStatus,
  onChangeTaskType,
  onChangePriority,
  onChangeStartDate,
  onChangeDueDate,
  onChangeAssignees,
  onClearLag,
  linkEditing,
}: DirectoryTaskRowProps) {
  // description is JSON, { text: string } — same read as board/TaskRow.tsx.
  const hasDescription = !!(task.description as { text?: string } | null)?.text?.trim();
  const tags = tagsByTask.get(task.id) ?? [];

  // The status menu offers this task's own set — the statuses of its board —
  // not every status the page loaded (a space can mix sets). The current
  // status picks the set, since a task always sits in its board's set.
  const currentStatus = statuses.find((s) => s.id === task.status_id);
  const rowStatuses = currentStatus
    ? statuses.filter((s) => s.status_set_id === currentStatus.status_set_id)
    : statuses;

  // What I may do to THIS task: my rights in its space, plus an assignee's own.
  const { access, userId: myUserId } = useMyTaskAccess();
  const rowCaps = taskRowCaps(
    (spaceId && access?.spaces[spaceId]?.caps) || NO_CAPS,
    access?.assignee_caps,
    !!myUserId && (assigneesByTask.get(task.id) ?? []).includes(myUserId),
  );
  const linkMenu = useRowLinkMenu();
  const flags = dependencyFlags.get(task.id);
  const dirColumns = useDirectoryColumns();
  const rowGridStyle = dirColumns
    ? dirColumns.getGridStyle({ showPriority, showSource, showCompleted })
    : directoryRowGridStyle({ showPriority, showSource, showCompleted });

  return (
    <>
    <div
      onContextMenu={linkEditing ? linkMenu.onContextMenu : undefined}
      style={rowGridStyle}
      className="min-h-[58px] border-b border-slate-200 px-4 py-3 transition-colors hover:bg-blue-50/50 even:bg-slate-50/50"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <TaskTypeCell
          taskTypes={taskTypes}
          currentTaskTypeId={task.task_type_id}
          onChange={(taskTypeId) => onChangeTaskType(task.id, taskTypeId)}
          readOnly={!rowCaps.edit}
        />

        {/* Separate overflow-hidden wrapper from TaskTypeCell above — see
            board/TaskRow.tsx's identical note: an overflow-hidden ancestor
            clips its popover otherwise. */}
        <div ref={linkMenu.titleRef} className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {parentTitle && task.parent_task_id && (
            <button
              onClick={() => onOpenTask(task.parent_task_id as string)}
              className="shrink-0 truncate text-sm text-slate-400 hover:text-slate-600 hover:underline"
              title={parentTitle}
            >
              ↳ {parentTitle}
            </button>
          )}
          <button onClick={() => onOpenTask(task.id)} className="truncate text-[16px] font-bold text-slate-900 hover:text-primary hover:underline transition-colors leading-normal">
            {task.title}
          </button>
          {titleBadge}

          {tags.length > 0 && (
            <span
              className="shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold"
              style={{ background: `${tags[0].color ?? "#6B7280"}1A`, color: tags[0].color ?? "#6B7280" }}
            >
              {tags[0].name}
            </span>
          )}
          {tags.length > 1 && (
            <Tooltip label={tags.slice(1).map((t) => t.name).join("، ")}>
              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                +{tags.length - 1}
              </span>
            </Tooltip>
          )}

          {linkedTaskIds.has(task.id) && (
            <Tooltip label="مرتبطة بسجل">
              <Link2 className="h-4 w-4 shrink-0 text-blue-500" aria-label="مرتبطة بسجل" />
            </Tooltip>
          )}
          {linkEditing ? (
            <RowDependencyIcons flags={flags} canEdit={rowCaps.edit} menu={linkMenu} />
          ) : (
            <DependencyBadges flags={flags} />
          )}
          {unmetRequirementTaskIds.has(task.id) && (
            <Tooltip label="متطلبات غير مكتملة">
              <Camera className="h-4 w-4 shrink-0 text-amber-500" aria-label="متطلبات غير مكتملة" />
            </Tooltip>
          )}
          {hasDescription && (
            <Tooltip label="تحتوي على وصف">
              <AlignLeft className="h-4 w-4 shrink-0 text-blue-500" aria-label="تحتوي على وصف" />
            </Tooltip>
          )}
          {attachedTaskIds.has(task.id) && (
            <Tooltip label="تحتوي على مرفقات">
              <Paperclip className="h-4 w-4 shrink-0 text-blue-500" aria-label="تحتوي على مرفقات" />
            </Tooltip>
          )}
          {commentedTaskIds.has(task.id) && (
            <Tooltip label="تحتوي على تعليقات">
              <MessageSquare className="h-4 w-4 shrink-0 text-blue-500" aria-label="تحتوي على تعليقات" />
            </Tooltip>
          )}
        </div>
      </div>

      {showSource && (
        <TaskSourceCell
          spaceName={spaceNameByBoardId?.get(task.board_id)}
          boardName={boardNamesById?.get(task.board_id)}
          boardId={task.board_id}
        />
      )}

      <StatusCell
        statuses={rowStatuses}
        currentStatusId={task.status_id}
        onChange={(statusId) => onChangeStatus(task.id, statusId)}
        readOnly={!rowCaps.status}
      />
      {showPriority && (
        <PriorityCell
          priority={task.priority}
          onChange={(priority) => onChangePriority(task.id, priority)}
          readOnly={!rowCaps.edit}
        />
      )}
      <AssigneeCell
        assigneeIds={assigneesByTask.get(task.id) ?? []}
        employeesById={employeesById}
        allEmployees={allEmployees}
        projectId={task.project_id}
        onChange={(userIds) => onChangeAssignees(task.id, userIds)}
        readOnly={!rowCaps.edit}
      />
      <StartDateCell
        startDate={task.start_date}
        onChange={(date) => onChangeStartDate(task.id, date)}
        readOnly={!rowCaps.edit}
        earliestStart={task.earliest_start}
        lagDays={task.start_lag_days}
        isSummary={task.is_summary}
        onClearLag={onClearLag ? () => onClearLag(task.id) : undefined}
      />
      <DateCell
        dueDate={task.due_date}
        isOverdue={task.is_overdue}
        statusCategory={statuses.find((s) => s.id === task.status_id)?.category}
        completedAt={task.completed_at}
        onChange={(date) => onChangeDueDate(task.id, date)}
        readOnly={!rowCaps.edit}
        minDate={task.is_template ? null : task.start_date}
        isSummary={task.is_summary}
      />
      {showCompleted && <CompletedAtCell completedAt={task.completed_at} />}
    </div>
    {linkEditing && (
      <RowLinkOverlays
        menu={linkMenu}
        task={task}
        flags={flags}
        links={linkEditing.dependencyLinks.get(task.id)}
        statusCategory={currentStatus?.category}
        childrenByParent={linkEditing.childrenByParent}
        canEdit={rowCaps.edit}
        onOpenTask={() => onOpenTask(task.id)}
        onLink={linkEditing.onLink}
        onUnlink={linkEditing.onUnlink}
      />
    )}
    </>
  );
}
