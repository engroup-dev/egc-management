import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { X, Loader2, ChevronLeft, Trash2, Plus, CopyPlus } from "lucide-react";
import { useTaskDetail } from "../../../hooks/tasks/useTaskDetail";
import { colorFor, initials } from "../board/employeeAvatar";
import { useMyTaskAccess, useTaskCaps } from "../../../hooks/tasks/useTaskAccess";
import EditGuard from "../EditGuard";
import StatusCell from "../board/StatusCell";
import PriorityCell from "../board/PriorityCell";
import AssigneeCell from "../board/AssigneeCell";
import RoleAssigneeCell from "../board/RoleAssigneeCell";
import { useTaskRoles } from "../../../hooks/tasks/useTaskRoles";
import StartDateCell from "../board/StartDateCell";
import DateCell from "../board/DateCell";
import DurationCell from "../board/DurationCell";
import { useCreateTaskDialog } from "../schedule/CreateTaskDialogContext";
import { workingDaysLabel } from "../board/workingDays";
import CustomFieldCell from "../board/CustomFieldCell";
import LinkedRecordCard from "./LinkedRecordCard";
import LinkRecordPicker from "./LinkRecordPicker";
import RequirementsSection from "./RequirementsSection";
import DependenciesSection from "./DependenciesSection";
import ChecklistsSection from "./ChecklistsSection";
import SubtasksSection from "./SubtasksSection";
import RelationshipsSection from "./RelationshipsSection";
import AttachmentsSection from "./AttachmentsSection";
import CommentsSection from "./CommentsSection";
import CommentComposer from "./CommentComposer";
import ActivitySection from "./ActivitySection";
import TagPicker from "./TagPicker";
import RecurrenceSection from "./RecurrenceSection";
import MentionTextarea from "./MentionTextarea";
import { TemplateModeProvider } from "../TemplateModeContext";
import { TaskDetailSkeleton } from "../TasksSkeletons";
import ConfirmDialog from "../../ui/ConfirmDialog";
import CopyToZonesDialog from "../zones/CopyToZonesDialog";
import { useSpaceZones } from "../../../hooks/tasks/useZones";
import { useTaskTypeOptions } from "../../../hooks/tasks/useTaskTypeOptions";

// =====================================================================
// D3 — Task detail (slide-over panel), build plan Part 7.
// =====================================================================
// Rendered as a nested task/:taskId route under board/:boardId, D6's
// department/:departmentId, or D7's my-work (see TasksRoutes.tsx) — the
// parent route's element renders this via <Outlet/> as an
// absolutely-positioned overlay so the list stays mounted and visible
// behind it, never a full page navigation, per the build plan's explicit
// rule for this screen. Since three different parents can host it, this
// component never hardcodes "/tasks/board/..." — basePath below strips
// the trailing "/task/:taskId" off the current URL, so close() and every
// internal link (breadcrumb parent, subtasks) return to whichever list
// actually opened this panel.

/** A linked task's wait gap: working days between its predecessors' end and its start. */
function LagField({ lagDays, readOnly, onChange }: { lagDays: number; readOnly: boolean; onChange: (lagDays: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Math.floor(Number(draft));
    setDraft(null);
    if (Number.isFinite(n) && n >= 0 && n <= 3650 && n !== lagDays) onChange(n);
  };
  if (draft !== null) {
    return (
      <input
        autoFocus
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
        className="w-20 rounded border border-primary px-1.5 py-0.5 text-center text-xs outline-none"
        dir="ltr"
      />
    );
  }
  return (
    <button
      onClick={() => !readOnly && setDraft(String(lagDays))}
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${
        lagDays > 0 ? "bg-amber-50 font-medium text-amber-700" : "bg-gray-50 text-gray-500"
      } ${readOnly ? "cursor-default" : "hover:bg-gray-100"}`}
      title="أيام عمل بين انتهاء المهام السابقة وبداية هذه المهمة"
    >
      {lagDays > 0 ? `${lagDays} يوم عمل` : "بدون انتظار"}
    </button>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-gray-500">{label}</span>
      <div>{children}</div>
    </div>
  );
}

export default function TaskDetailPanel() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.replace(/\/task\/[^/]+$/, "");
  const {
    data,
    loading,
    refetch,
    updateField,
    updateSchedule,
    setAssignees,
    satisfyRequirement,
    setCustomValue,
    addRequirement,
    deleteRequirement,
    addChecklist,
    addChecklistItem,
    toggleChecklistItem,
    renameChecklistItem,
    deleteChecklistItem,
    checklistItemToTask,
    addRelationship,
    removeRelationship,
    addDependency,
    removeDependency,
    syncMentions,
    addLink,
    removeLink,
    addComment,
    editComment,
    deleteComment,
    toggleCommentResolved,
    toggleTag,
    deleteTask,
    deletingTask,
  } = useTaskDetail(taskId);
  const { openCreateTask } = useCreateTaskDialog();
  // What I may do on THIS task, as answered by the database (tasks.task_caps).
  // Everything below is a courtesy for people who cannot edit; row-level
  // security refuses the same writes regardless of what the screen shows.
  const { caps, loading: capsLoading, unavailable } = useTaskCaps(taskId);
  const { access } = useMyTaskAccess();
  // Contractors/vendors only ever see the task itself, its comments, files,
  // checklists and requirements — not field values, ERP links, activity.
  const isExternal = !!access && !access.is_internal;
  // Template tasks can also be assigned by project role (useTaskRoles.ts).
  const isTemplateTask = !!data?.task.is_template;
  const { rolesByTask, setTaskRoles } = useTaskRoles(
    taskId ? `task:${taskId}` : undefined,
    taskId ? [taskId] : [],
    isTemplateTask,
  );

  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null);

  // Delete archives the task (and its subtasks): Ctrl+Z brings it back.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const handleDelete = async () => {
    setConfirmingDelete(false);
    await deleteTask();
    navigate(basePath);
  };
  const [copyingToZones, setCopyingToZones] = useState(false);
  const { zones } = useSpaceZones(data?.task.is_template ? undefined : data?.breadcrumb.spaceId);
  const inZone = !!data && zones.length > 1 && zones.some((z) => z.boardId === data.breadcrumb.boardId);
  const taskTypes = useTaskTypeOptions(!!data);

  // Slides in from the left edge on open and back out on close. Opening a
  // different task from inside the panel (breadcrumb, subtasks) keeps this
  // same instance mounted, so it doesn't replay.
  const [entered, setEntered] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => {
      cancelAnimationFrame(frame);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const close = () => {
    if (closeTimer.current) return;
    setEntered(false);
    closeTimer.current = setTimeout(() => navigate(basePath), 200);
  };

  // A task on a template board gets the same panel, in template mode
  // (Day N dates, no notifications, links kept inside the template).
  return (
    <TemplateModeProvider value={!!data?.task.is_template}>
    <div className="fixed inset-0 z-40 flex justify-end overflow-hidden" dir="rtl">
      <button
        aria-label="إغلاق"
        onClick={close}
        className={`absolute inset-0 bg-black/20 transition-opacity duration-200 motion-reduce:transition-none ${
          entered ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        className={`relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none ${
          entered ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          {data ? (
            <nav className="flex items-center gap-1 truncate text-xs text-gray-400">
              {data.breadcrumb.projectName && <span>{data.breadcrumb.projectName}</span>}
              {data.breadcrumb.zoneName && (
                <>
                  <ChevronLeft className="h-3 w-3" />
                  <span>{data.breadcrumb.zoneName}</span>
                </>
              )}
              {data.breadcrumb.parentTitle && (
                <>
                  <ChevronLeft className="h-3 w-3" />
                  <button
                    onClick={() => navigate(`${basePath}/task/${data.breadcrumb.parentId}`)}
                    className="truncate hover:text-gray-600 hover:underline"
                  >
                    {data.breadcrumb.parentTitle}
                  </button>
                </>
              )}
            </nav>
          ) : (
            <span />
          )}
          <button onClick={close} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {loading || !data || capsLoading ? <TaskDetailSkeleton /> : unavailable ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center text-sm text-gray-500">
            <span className="font-medium text-gray-700">المهمة غير متاحة</span>
            <span className="text-xs text-gray-400">قد تكون محذوفة أو غير مُسندة إليك.</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <input
              value={titleDraft ?? data.task.title}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                const title = (titleDraft ?? "").trim();
                if (title && title !== data.task.title) updateField({ title });
                setTitleDraft(null);
              }}
              readOnly={!caps.edit}
              className="w-full border-none text-lg font-semibold text-gray-900 outline-none"
            />

            {inZone && caps.create && (
              <button
                onClick={() => setCopyingToZones(true)}
                className="mt-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-50 hover:text-primary"
              >
                <CopyPlus className="h-3.5 w-3.5" />
                نسخ إلى مناطق أخرى
              </button>
            )}

            <div className="mt-1.5">
              <EditGuard disabled={!caps.edit}>
                <TagPicker
                  allTags={data.allTags}
                  tagIds={data.tagIds}
                  onToggle={(tagId, attached) => toggleTag({ tagId, attached })}
                />
              </EditGuard>
            </div>

            {/* description is JSON (build plan §4.7), not HTML — no rich-text
                editor exists in this repo yet, so this stores {text: string}
                as a placeholder shape rather than a real doc model. Typing
                "@task title" opens a search dropdown (MentionTextarea) —
                the token it inserts renders as raw text here (no view/edit
                split for this field) but still creates the reference
                relationship on save, per build plan §4.13. */}
            <EditGuard disabled={!caps.edit}>
            <MentionTextarea
              value={
                descriptionDraft ??
                ((data.task.description as { text?: string } | null)?.text ?? "")
              }
              onChange={setDescriptionDraft}
              excludeTaskId={data.task.id}
              onBlur={() => {
                if (descriptionDraft !== null) {
                  updateField({ description: { text: descriptionDraft } });
                  syncMentions(descriptionDraft);
                }
                setDescriptionDraft(null);
              }}
              placeholder="إضافة وصف..."
              rows={3}
              className="mt-2 w-full resize-none rounded-md border-none text-sm text-gray-600 outline-none placeholder:text-gray-300"
            />
            </EditGuard>

            <Section title="التعليقات">
              <CommentsSection
                comments={data.comments}
                employeesById={data.employeesById}
                excludeTaskId={data.task.id}
                onEditComment={async (id, text) => {
                  await editComment({ id, text });
                  syncMentions(text);
                }}
                onDeleteComment={deleteComment}
                onToggleResolved={(id, resolved) => toggleCommentResolved({ id, resolved })}
                canResolve={caps.edit}
                onNavigateToTask={(id) => navigate(`${basePath}/task/${id}`)}
              />
            </Section>

            <div className="mt-3 divide-y divide-gray-50 border-y border-gray-100">
              <FieldRow label="الحالة">
                <StatusCell
                  statuses={data.statuses}
                  currentStatusId={data.task.status_id}
                  onChange={(statusId) => updateField({ status_id: statusId })}
                  align="left"
                  readOnly={!caps.status}
                />
              </FieldRow>
              <FieldRow label="النوع">
                <select
                  value={data.task.task_type_id}
                  disabled={!caps.edit}
                  onChange={(e) => updateField({ task_type_id: e.target.value })}
                  className="rounded-md border border-gray-200 px-2 py-1 text-sm outline-none"
                >
                  {taskTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name_ar}
                    </option>
                  ))}
                </select>
              </FieldRow>
              <FieldRow label="الأولوية">
                <PriorityCell
                  priority={data.task.priority}
                  onChange={(priority) => updateField({ priority })}
                  align="left"
                  readOnly={!caps.edit}
                />
              </FieldRow>
              <FieldRow label="القسم">
                <select
                  value={data.task.department_id ?? ""}
                  disabled={!caps.edit}
                  onChange={(e) => updateField({ department_id: e.target.value || null })}
                  className="rounded-md border border-gray-200 px-2 py-1 text-sm outline-none"
                >
                  <option value="">—</option>
                  {data.allDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </FieldRow>
              {/* One row per person with its own X, instead of overlapping
                  avatars — removing someone no longer means opening the
                  picker and unticking them. */}
              <div className="py-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-500">المسؤولون</span>
                  <div className="flex items-center gap-1.5">
                    {isTemplateTask && (
                      <RoleAssigneeCell
                        roleIds={rolesByTask.get(data.task.id) ?? []}
                        onChange={(roleIds) => setTaskRoles({ taskId: data.task.id, roleIds })}
                        align="left"
                        readOnly={!caps.edit}
                      />
                    )}
                    {caps.edit && (
                    <AssigneeCell
                      variant="button"
                      buttonClassName="flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700"
                      buttonContent={
                        <>
                          <Plus className="h-3 w-3" />
                          إضافة
                        </>
                      }
                      assigneeIds={data.assigneeIds}
                      employeesById={data.employeesById}
                      allEmployees={data.employees}
                      projectId={data.task.project_id}
                      onChange={(userIds) => setAssignees(userIds)}
                      align="left"
                    />
                    )}
                  </div>
                </div>
                {data.assigneeIds.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {data.assigneeIds.map((userId) => {
                      const person = data.employeesById.get(userId);
                      return (
                        <li
                          key={userId}
                          className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1 text-sm text-gray-700"
                        >
                          <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                            style={{ background: colorFor(userId) }}
                          >
                            {person ? initials(person) : "?"}
                          </span>
                          <span className="truncate">
                            {person ? `${person.first_name} ${person.last_name ?? ""}` : "—"}
                          </span>
                          {person?.person_type === "contractor" && (
                            <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-700">
                              مقاول
                            </span>
                          )}
                          {caps.edit && (
                            <button
                              onClick={() => setAssignees(data.assigneeIds.filter((id) => id !== userId))}
                              title="إزالة"
                              aria-label="إزالة"
                              className="ms-auto shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {/* Dates are a start plus days; the scheduler (updateSchedule)
                  derives the due date and moves the tasks linked after this
                  one. On a template the start and due are "Day N" and every
                  day counts. */}
              <FieldRow label="تاريخ البدء">
                <StartDateCell
                  startDate={data.task.start_date}
                  onChange={(date) => date && updateSchedule({ startDate: date })}
                  align="left"
                  readOnly={!caps.edit}
                  earliestStart={data.task.earliest_start}
                  lagDays={data.task.start_lag_days}
                  isSummary={data.task.is_summary}
                  onClearLag={() => updateSchedule({ lagDays: 0 })}
                />
              </FieldRow>
              <FieldRow label="المدة">
                <DurationCell
                  days={data.task.duration_days}
                  onChange={(days) => updateSchedule({ durationDays: days })}
                  readOnly={!caps.edit}
                  isSummary={data.task.is_summary}
                  size="md"
                />
              </FieldRow>
              <FieldRow label="تاريخ الاستحقاق">
                <DateCell
                  dueDate={data.task.due_date}
                  isOverdue={data.task.is_overdue}
                  statusCategory={data.statuses.find((s) => s.id === data.task.status_id)?.category}
                  completedAt={data.task.completed_at}
                  onChange={(date) => date && updateSchedule({ dueDate: date })}
                  align="left"
                  readOnly={!caps.edit}
                  minDate={data.task.start_date}
                  isSummary={data.task.is_summary}
                />
              </FieldRow>
              {data.task.earliest_start && !data.task.is_summary && (
                <FieldRow label="انتظار قبل البدء">
                  <LagField
                    lagDays={data.task.start_lag_days}
                    readOnly={!caps.edit}
                    onChange={(lagDays) => updateSchedule({ lagDays })}
                  />
                </FieldRow>
              )}
              {data.task.is_summary && (
                <p className="text-[11px] text-gray-400">
                  تواريخ هذه المهمة تُحسب من مهامها الفرعية
                  {data.task.duration_days ? ` (${workingDaysLabel(data.task.duration_days)})` : ""}.
                </p>
              )}
              {/* The board's attached custom fields (D2's "+" column
                  editor) previously had no home in this panel — only the
                  dense board row could show or edit them. */}
              {!isExternal && data.customColumns.map((col) => (
                <FieldRow key={col.boardColumnId} label={col.name_ar}>
                  <EditGuard disabled={!caps.edit}>
                  <CustomFieldCell
                    column={col}
                    value={data.customValues.get(col.fieldDefinitionId)}
                    employeesById={data.employeesById}
                    allEmployees={data.employees}
                    onChange={(value) => setCustomValue({ fieldDefinitionId: col.fieldDefinitionId, value })}
                    align="left"
                  />
                  </EditGuard>
                </FieldRow>
              ))}
            </div>

            <Section title="السجل المرتبط" hidden={isExternal}>
              <EditGuard disabled={!caps.edit}>
                <div className="space-y-1.5">
                  <LinkedRecordCard links={data.links} onRemove={removeLink} />
                  {caps.edit && (
                    <LinkRecordPicker
                      projectId={data.task.project_id}
                      onAdd={(input) => addLink({ recordType: input.recordType, recordId: input.recordId, linkMode: input.linkMode })}
                    />
                  )}
                </div>
              </EditGuard>
            </Section>

            <Section title="">
              <RequirementsSection
                requirements={data.requirements}
                onToggle={(id, satisfied) => satisfyRequirement({ requirementId: id, satisfied })}
                onAdd={addRequirement}
                onDelete={deleteRequirement}
                canEdit={caps.edit}
                canSatisfy={caps.status}
              />
            </Section>

            <Section title="الاعتماديات" hidden={isExternal}>
              <EditGuard disabled={!caps.edit}>
              <DependenciesSection
                taskId={data.task.id}
                boardId={data.task.board_id}
                spaceId={data.breadcrumb.spaceId}
                blocking={data.blocking}
                blockedByMe={data.blockedByMe}
                selfDone={["done", "closed"].includes(data.statuses.find((s) => s.id === data.task.status_id)?.category ?? "")}
                onAdd={(relatedTaskId, direction) => addDependency({ relatedTaskId, direction })}
                onRemove={(dependencyId) => removeDependency(dependencyId)}
              />
              </EditGuard>
            </Section>

            <Section title="الروابط" hidden={isExternal}>
              <EditGuard disabled={!caps.edit}>
              <RelationshipsSection
                taskId={data.task.id}
                boardId={data.task.board_id}
                relationships={data.relationships}
                onAdd={(relatedTaskId, type) => addRelationship({ relatedTaskId, type })}
                onRemove={(id) => removeRelationship(id)}
              />
              </EditGuard>
            </Section>

            <Section title="قوائم التحقق">
              <ChecklistsSection
                checklists={data.checklists}
                onAddChecklist={(name) => addChecklist(name)}
                onAddItem={(checklistId, content) => addChecklistItem({ checklistId, content })}
                onToggleItem={(itemId, checked) => toggleChecklistItem({ itemId, checked })}
                onRenameItem={(itemId, content) => renameChecklistItem({ itemId, content })}
                onDeleteItem={(itemId) => deleteChecklistItem(itemId)}
                onItemToTask={
                  data.task.is_template
                    ? undefined
                    : (itemId) => void checklistItemToTask(itemId).then((id) => navigate(`${basePath}/task/${id}`))
                }
                canEdit={caps.edit}
                canTick={caps.status}
              />
            </Section>

            <Section title="المهام الفرعية">
              <SubtasksSection
                basePath={basePath}
                subtasks={data.subtasks}
                onOpenAdd={() => openCreateTask({ boardId: data.task.board_id, parentTaskId: data.task.id })}
                canAdd={caps.create}
              />
            </Section>

            <Section title="المرفقات">
              <AttachmentsSection
                taskId={data.task.id}
                attachments={data.attachments}
                onUploaded={() => refetch()}
                canUpload={caps.comment}
              />
            </Section>

            <Section title="إضافة تعليق" hidden={!caps.comment}>
              <CommentComposer
                excludeTaskId={data.task.id}
                onAddComment={async (text) => {
                  await addComment({ text });
                  syncMentions(text);
                }}
              />
            </Section>

            <Section title="النشاط" hidden={isExternal}>
              <ActivitySection activity={data.activity} employeesById={data.employeesById} />
            </Section>

            <Section title="التكرار" hidden={isExternal || !caps.edit}>
              <RecurrenceSection taskId={data.task.id} boardId={data.breadcrumb.boardId} />
            </Section>

            <Section title="منطقة الخطر" hidden={!caps.delete}>
              <div className="rounded-md border border-red-100 bg-red-50/50 p-3">
                <button
                  onClick={() => setConfirmingDelete(true)}
                  disabled={deletingTask}
                  className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  {deletingTask ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  حذف المهمة
                </button>
                <p className="mt-1 text-xs text-red-400">
                  {data.subtasks.length > 0 ? `تُحذف معها ${data.subtasks.length} مهمة فرعية. ` : ""}
                  يمكن التراجع بـ Ctrl+Z.
                </p>
              </div>
            </Section>
          </div>
        )}
      </div>
      {data && (
        <ConfirmDialog
          open={confirmingDelete}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmingDelete(false)}
          title="حذف المهمة؟"
          message={`حذف «${data.task.title}»${
            data.subtasks.length ? ` و${data.subtasks.length} مهمة فرعية تحتها` : ""
          }؟ يمكن التراجع بـ Ctrl+Z.`}
          confirmLabel="حذف"
          confirmVariant="error"
          loading={deletingTask}
        />
      )}
      {data && copyingToZones && (
        <CopyToZonesDialog
          spaceId={data.breadcrumb.spaceId}
          sourceBoardId={data.breadcrumb.boardId}
          taskIds={[data.task.id]}
          label={data.task.title}
          onClose={() => setCopyingToZones(false)}
        />
      )}
    </div>
    </TemplateModeProvider>
  );
}

function Section({
  title,
  hidden,
  children,
}: {
  title: string;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  if (hidden) return null;
  return (
    <div className="mt-4">
      {title && <div className="mb-1.5 text-xs font-semibold text-gray-500">{title}</div>}
      {children}
    </div>
  );
}
