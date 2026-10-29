import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Check, Plus } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import type { StatusRow, TaskRow, TaskTypeLite } from "../../../hooks/tasks/useTaskBoard";
import type { AssignablePerson } from "../../../hooks/tasks/useAssignablePeople";
import type { DependencyFlags } from "../../../hooks/tasks/dependencyFlags";
import { taskRowCaps } from "../../../hooks/tasks/useTaskAccess";
import { emitTaskError } from "../../../hooks/tasks/taskErrorBus";
import { extractErrorMessage } from "../../../hooks/tasks/extractErrorMessage";
import { useBoardAccess } from "../BoardAccessContext";
import { useTemplateMode } from "../TemplateModeContext";
import { HOLD_STYLE, WAIT_STYLE } from "../board/DependencyBadges";
import { colorFor, initials } from "../board/employeeAvatar";
import { typeBadges, type TypeBadge } from "../board/taskTypeBadge";
import { Badge } from "../gantt/GanttBar";
import { dayAdapter, daysShort, spanShort } from "../gantt/ganttScale";
import { workingDaysBetween } from "../board/workingDays";

// الأنواع — the board's tasks in one column per task type, Construction
// Flow's "Task type" board (plans/construction-flow-comparison/), with our
// task types as its categories. Reached at /tasks/board/:id/types.
//
// Dragging a card to another column changes the task's type (the board's
// updateTaskType, which records undo — Ctrl+Z puts it back). A task always
// has a type (task_type_id is required), so there is no "no type" column.
// Cards are every task of the board, subtasks included (a type is per task),
// in start-date order, with the parent's name above a subtask's title.
//
// With edit_all_tasks a last column adds a type (name + colour). Renaming and
// deleting types stay on the admin page (FieldsAdminPage), which shows how
// many tasks use one before it goes.

const NEW_TYPE_COLORS = ["#e5534b", "#a06cd5", "#d4a72c", "#2fa8a0", "#e07aa8", "#7a8a99"];
const DEFAULT_STATUS_COLOR = "#6B7280";

const isFinished = (category: string | undefined) => category === "done" || category === "closed";

interface TaskTypeBoardProps {
  tasks: TaskRow[];
  statuses: StatusRow[];
  taskTypes: Map<string, TaskTypeLite>;
  assigneesByTask: Map<string, string[]>;
  employeesById: Map<string, AssignablePerson>;
  dependencyFlags: Map<string, DependencyFlags>;
  onOpenTask: (taskId: string) => void;
  onChangeTaskType: (taskId: string, taskTypeId: string) => void;
  /** edit_all_tasks: the "new type" column. */
  canAddType: boolean;
  /** Highlight colour fills (the diagram's 🖍️), by task. */
  highlights?: Map<string, string>;
}

export default function TaskTypeBoard({
  tasks,
  statuses,
  taskTypes,
  assigneesByTask,
  employeesById,
  dependencyFlags,
  onOpenTask,
  onChangeTaskType,
  canAddType,
  highlights,
}: TaskTypeBoardProps) {
  const isTemplate = useTemplateMode();
  const adapter = useMemo(() => dayAdapter(isTemplate), [isTemplate]);
  const badges = useMemo(() => typeBadges(taskTypes), [taskTypes]);
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const titleById = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);
  const { spaceCaps, assigneeCaps, myUserId } = useBoardAccess();
  const canEdit = (taskId: string) =>
    taskRowCaps(spaceCaps, assigneeCaps, !!myUserId && (assigneesByTask.get(taskId) ?? []).includes(myUserId)).edit;

  const types = useMemo(
    () => Array.from(taskTypes.values()).sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar")),
    [taskTypes],
  );
  const columns = useMemo(() => {
    const byType = new Map<string, TaskRow[]>(types.map((t) => [t.id, []]));
    const ordered = tasks
      .map((task, index) => ({ task, index, start: task.start_date ? adapter.toDay(task.start_date) : Number.POSITIVE_INFINITY }))
      .sort((a, b) => (a.start === b.start ? a.index - b.index : a.start < b.start ? -1 : 1));
    for (const { task } of ordered) byType.get(task.task_type_id)?.push(task);
    return byType;
  }, [tasks, types, adapter]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [dragging, setDragging] = useState<TaskRow | null>(null);
  const onDragStart = (e: DragStartEvent) => setDragging(tasks.find((t) => t.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const task = tasks.find((t) => t.id === e.active.id);
    const typeId = e.over?.id;
    if (task && typeof typeId === "string" && typeId !== task.task_type_id) onChangeTaskType(task.id, typeId);
  };

  const subtitle = (task: TaskRow) => {
    if (!task.start_date || !task.due_date) return "غير مجدولة";
    const s = adapter.toDay(task.start_date);
    const e = adapter.toDay(task.due_date);
    return `${spanShort(s, e, adapter)} · ${daysShort(task.duration_days ?? workingDaysBetween(s, e, isTemplate))}`;
  };
  const card = (task: TaskRow, overlay = false) => (
    <TaskCard
      task={task}
      parentTitle={task.parent_task_id ? titleById.get(task.parent_task_id) ?? null : null}
      subtitle={subtitle(task)}
      status={statusById.get(task.status_id) ?? null}
      assignees={(assigneesByTask.get(task.id) ?? []).map((id) => employeesById.get(id)).filter((p): p is AssignablePerson => !!p)}
      dependency={dependencyFlags.get(task.id)}
      draggable={canEdit(task.id)}
      overlay={overlay}
      highlight={highlights?.get(task.id) ?? null}
      onOpen={() => onOpenTask(task.id)}
    />
  );

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="flex h-full items-start gap-3 overflow-auto bg-gray-50 p-4">
        {types.map((type) => (
          <TypeColumn
            key={type.id}
            type={type}
            badge={badges.get(type.id) ?? null}
            count={columns.get(type.id)?.length ?? 0}
            isSource={dragging?.task_type_id === type.id}
          >
            {(columns.get(type.id) ?? []).map((task) => (
              <div key={task.id}>{card(task)}</div>
            ))}
          </TypeColumn>
        ))}
        {canAddType && <NewTypeColumn />}
      </div>
      <DragOverlay dropAnimation={null}>{dragging ? card(dragging, true) : null}</DragOverlay>
    </DndContext>
  );
}

function TypeColumn({
  type,
  badge,
  count,
  isSource,
  children,
}: {
  type: TaskTypeLite;
  badge: TypeBadge | null;
  count: number;
  isSource: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: type.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex max-h-full w-72 shrink-0 flex-col rounded-xl border bg-white transition-colors ${
        isOver && !isSource ? "border-primary ring-2 ring-primary/20" : "border-gray-200"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5" style={{ borderTop: `3px solid ${type.color ?? "#6B7280"}`, borderRadius: "0.75rem 0.75rem 0 0" }}>
        {badge && <Badge badge={badge} size={20} />}
        <span className="truncate text-sm font-semibold text-gray-800">{type.name_ar}</span>
        <span className="mr-auto rounded-full bg-gray-100 px-2 text-xs text-gray-500">{count}</span>
      </div>
      <div className="flex min-h-[80px] flex-col gap-2 overflow-y-auto p-2">
        {count === 0 ? <div className="py-6 text-center text-xs text-gray-400">لا توجد مهام</div> : children}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  parentTitle,
  subtitle,
  status,
  assignees,
  dependency,
  draggable,
  overlay,
  highlight,
  onOpen,
}: {
  task: TaskRow;
  parentTitle: string | null;
  subtitle: string;
  status: StatusRow | null;
  assignees: AssignablePerson[];
  dependency?: DependencyFlags;
  draggable: boolean;
  overlay: boolean;
  highlight: string | null;
  onOpen: () => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.id, disabled: !draggable || overlay });
  const done = isFinished(status?.category);
  const color = status?.color ?? DEFAULT_STATUS_COLOR;
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      onClick={onOpen}
      className={`rounded-lg border bg-white p-2.5 text-right shadow-sm transition-shadow hover:shadow ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${isDragging ? "opacity-40" : ""} ${overlay ? "w-[17rem] rotate-1 shadow-lg" : ""} ${
        task.is_overdue && !done ? "border-red-200" : "border-gray-200"
      }`}
      style={{ borderRightWidth: 4, borderRightColor: done ? "#9CA3AF" : color, ...(highlight && { background: highlight }) }}
    >
      {parentTitle && <div className="mb-0.5 truncate text-[11px] text-gray-400">{parentTitle}</div>}
      <div className={`flex min-w-0 items-center gap-1 text-[13px] font-semibold ${done ? "text-gray-500" : "text-gray-900"}`}>
        {dependency?.waitingOn.length ? <WAIT_STYLE.Icon className={`h-3.5 w-3.5 shrink-0 ${WAIT_STYLE.text}`} /> : null}
        {dependency?.holding.length ? <HOLD_STYLE.Icon className={`h-3.5 w-3.5 shrink-0 ${HOLD_STYLE.text}`} /> : null}
        {done && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
        <span className={`truncate ${done ? "line-through decoration-gray-400" : ""}`}>{task.title}</span>
      </div>
      <div className="mt-0.5 truncate text-[11px] text-gray-500">{subtitle}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {status ? (
          <span
            className="truncate rounded-full border px-2 py-0.5 text-[11px] font-medium"
            style={{ color, borderColor: `color-mix(in srgb, ${color} 35%, white)`, background: `color-mix(in srgb, ${color} 10%, white)` }}
          >
            {status.label_ar}
          </span>
        ) : (
          <span />
        )}
        {assignees.length > 0 && (
          <span className="flex shrink-0 items-center -space-x-1.5 rtl:space-x-reverse">
            {assignees.slice(0, 3).map((p) => (
              <span
                key={p.id}
                title={`${p.first_name} ${p.last_name ?? ""}`.trim()}
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white"
                style={{ background: colorFor(p.id) }}
              >
                {initials(p)}
              </span>
            ))}
            {assignees.length > 3 && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-[10px] text-gray-600">
                +{assignees.length - 3}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** Construction Flow's "＋ Add category": a name and one of six colours. */
function NewTypeColumn() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState(NEW_TYPE_COLORS[0]);
  const create = useMutation({
    mutationFn: async () => {
      const nameAr = name.trim();
      // `name` is the stable key logic may read; a type made here has no
      // system meaning, so the Arabic name serves.
      const { error } = await supabase.schema("tasks").from("task_types").insert({ name: nameAr, name_ar: nameAr, color });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      for (const key of ["task-board", "task-directory", "admin-catalog"]) queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (error) => emitTaskError(extractErrorMessage(error)),
  });
  const submit = () => {
    if (name.trim() && !create.isPending) create.mutate();
  };
  return (
    <div className="flex w-64 shrink-0 flex-col gap-2 rounded-xl border border-dashed border-gray-300 bg-white/60 p-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
        <Plus className="h-4 w-4" />
        نوع جديد
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="مثلاً: يحتاج مواد"
        className="rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
      />
      <div className="flex gap-1.5">
        {NEW_TYPE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-gray-800" : "border-white"}`}
            style={{ background: c }}
            aria-label={c}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={!name.trim() || create.isPending}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        إضافة النوع
      </button>
      <p className="text-[11px] leading-relaxed text-gray-400">يظهر النوع الجديد عموداً هنا وفي قائمة أنواع المهام. التعديل والحذف من صفحة الإدارة.</p>
    </div>
  );
}
