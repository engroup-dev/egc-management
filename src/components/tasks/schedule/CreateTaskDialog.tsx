import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, CornerDownLeft, Link2, Loader2, Search, Unlink, Equal, X } from "lucide-react";
import CalendarPopover from "../board/CalendarPopover";
import {
  useBoardScheduleTasks,
  useCreateScheduledTask,
  useCreateTaskPreview,
  type BoardScheduleTask,
  type CreateScheduledTaskInput,
} from "../../../hooks/tasks/useTaskSchedule";
import { extractErrorMessage } from "../../../hooks/tasks/extractErrorMessage";
import {
  daysFromDue,
  dueFromDays,
  formatDayWithWeekday,
  localToday,
  nextWorkingDayString,
  workingDayOnOrAfterString,
  workingDaysLabel,
} from "../board/workingDays";
import { dateToDayOffset, dayOffsetLabel, dayOffsetToDate } from "../board/templateDates";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../hooks/useAuth";
import { useAssignablePeople } from "../../../hooks/tasks/useAssignablePeople";
import { useTaskTypeOptions } from "../../../hooks/tasks/useTaskTypeOptions";
import { emitTaskError } from "../../../hooks/tasks/taskErrorBus";

// The one way to add a task to any board, a template included: a task needs
// a start and the number of working days it takes, and usually follows
// another task. Three placements:
//
//   بدون ارتباط   its own start date, nothing before it
//   بعد مهمة…     starts the working day after another task ends; with
//                  "ترحيل المهام التالية" the tasks that followed that one
//                  now follow the new task (inserted into the chain)
//   بالتزامن مع…  starts with another task (same predecessors), moves nothing
//
// Days and due date edit each other (Friday excluded, workingDays.ts). The
// box at the bottom is the server's dry run of exactly this create: the
// real start / end and every task that would move.
//
// On a template the start is a "Day N" number and every day counts; when the
// template is applied from a start date, Day N becomes the N-th working day
// after it (tasks/migrations/2026-10-14_templates_scheduling.sql).

const PLACEMENT_KEY = (boardId: string) => `tasks.createPlacement:${boardId}`;

function loadPlacement(boardId: string): "none" | "after" | null {
  try {
    const v = window.localStorage.getItem(PLACEMENT_KEY(boardId));
    return v === "after" || v === "none" ? v : null;
  } catch {
    return null;
  }
}

function savePlacement(boardId: string, placement: "none" | "after" | "with") {
  try {
    window.localStorage.setItem(PLACEMENT_KEY(boardId), placement === "with" ? "after" : placement);
  } catch {
    // private window / storage blocked: the default is fine
  }
}

const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);

export interface CreateTaskDialogOptions {
  boardId: string;
  parentTaskId?: string | null;
  title?: string;
  /** Start right after this task (placement "after"). */
  anchorTaskId?: string | null;
}

interface CreateTaskDialogProps extends CreateTaskDialogOptions {
  onClose: () => void;
}

type UiPlacement = "none" | "after" | "with";

export default function CreateTaskDialog({ boardId, parentTaskId = null, title: initialTitle = "", anchorTaskId = null, onClose }: CreateTaskDialogProps) {
  const { data: schedule, isPending: loadingTasks } = useBoardScheduleTasks(boardId);
  const boardTasks = schedule?.tasks;
  const plain = schedule?.isTemplate ?? false;
  const create = useCreateScheduledTask();
  // "الخميس 2026/10/22" on a board, "يوم 3" on a template
  const fmtDay = (d: string) => (plain ? dayOffsetLabel(dateToDayOffset(d)) : formatDayWithWeekday(d));

  const [title, setTitle] = useState(initialTitle);
  const [placement, setPlacement] = useState<UiPlacement>("none");
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => workingDayOnOrAfterString(localToday()));
  const [days, setDays] = useState(1);
  const [daysDraft, setDaysDraft] = useState("1");
  const [pushSuccessors, setPushSuccessors] = useState(true);
  const [pickingAnchor, setPickingAnchor] = useState(false);
  const [anchorSearch, setAnchorSearch] = useState("");
  const [openPicker, setOpenPicker] = useState<"start" | "due" | null>(null);
  const [initialized, setInitialized] = useState(false);
  // optional, set right after the task is created
  const [taskTypeId, setTaskTypeId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const taskTypes = useTaskTypeOptions();
  const people = useAssignablePeople();
  const { user } = useAuth();
  const titleRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const dueRef = useRef<HTMLButtonElement>(null);

  const byId = useMemo(() => new Map((boardTasks ?? []).map((t) => [t.id, t])), [boardTasks]);
  const parent = parentTaskId ? byId.get(parentTaskId) ?? null : null;

  // The parent and its ancestors can't be the anchor (a task can't follow its own parent).
  const lineage = useMemo(() => {
    const ids = new Set<string>();
    let cursor = parentTaskId;
    while (cursor && !ids.has(cursor)) {
      ids.add(cursor);
      cursor = byId.get(cursor)?.parent_task_id ?? null;
    }
    return ids;
  }, [parentTaskId, byId]);

  const scheduled = useMemo(
    () => (boardTasks ?? []).filter((t) => t.start_date && t.due_date && !lineage.has(t.id)),
    [boardTasks, lineage],
  );

  // Last scheduled task at the new task's own level — "after the previous one".
  const lastSibling = useMemo(() => {
    const siblings = scheduled.filter((t) => t.parent_task_id === parentTaskId);
    return siblings.reduce<BoardScheduleTask | null>((last, t) => (!last || t.sort_order > last.sort_order ? t : last), null);
  }, [scheduled, parentTaskId]);

  // Defaults, once the board's tasks are in: a subtask follows the last
  // subtask; a main task is not linked unless this board was last used
  // "after" (remembered per board). An explicit anchor wins.
  useEffect(() => {
    if (initialized || !boardTasks) return;
    setInitialized(true);
    // a template starts at Day 0 (the real board's default start is today)
    if (plain) setStartDate(dayOffsetToDate(0));
    const explicit = anchorTaskId ? byId.get(anchorTaskId) : null;
    if (explicit?.start_date) {
      setPlacement("after");
      setAnchorId(explicit.id);
      return;
    }
    const wantsAfter = parentTaskId ? true : loadPlacement(boardId) === "after";
    if (wantsAfter && lastSibling) {
      setPlacement("after");
      setAnchorId(lastSibling.id);
      return;
    }
    setPlacement("none");
    const parentStart = day(parent?.start_date);
    if (parentStart) setStartDate(parentStart);
  }, [initialized, boardTasks, plain, anchorTaskId, byId, parentTaskId, boardId, lastSibling, parent]);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const anchor = anchorId ? byId.get(anchorId) ?? null : null;
  const linked = placement !== "none";

  const estimatedStart =
    placement === "after" && anchor?.due_date
      ? nextWorkingDayString(day(anchor.due_date) as string, plain)
      : placement === "with" && anchor?.start_date
        ? (day(anchor.start_date) as string)
        : workingDayOnOrAfterString(startDate, plain);

  const valid = days >= 1 && days <= 3650 && (!linked || !!anchor);

  const input: CreateScheduledTaskInput | null = valid
    ? {
        boardId,
        title: title.trim() || "مهمة جديدة",
        durationDays: days,
        parentTaskId,
        placement,
        anchorTaskId: linked ? anchorId : null,
        startDate: linked ? null : workingDayOnOrAfterString(startDate, plain),
        pushSuccessors: placement === "after" ? pushSuccessors : false,
      }
    : null;
  const { preview, previewError, previewLoading } = useCreateTaskPreview(input);

  const start = day(preview?.task.start_date) ?? estimatedStart;
  const due = day(preview?.task.due_date) ?? dueFromDays(start, days, plain);

  const setDaysValue = (n: number) => {
    const clean = Math.min(3650, Math.max(1, Math.floor(n)));
    setDays(clean);
    setDaysDraft(String(clean));
  };

  const canSubmit = valid && title.trim().length > 0 && !create.isPending;

  const submit = async (addAnother: boolean) => {
    if (!canSubmit || !input) return;
    try {
      const result = await create.mutateAsync({ ...input, title: title.trim() });
      if (!parentTaskId) savePlacement(boardId, placement);
      // type and assignee: plain writes on the new task (the RPC only schedules)
      const tasksDb = supabase.schema("tasks");
      const extras: PromiseLike<{ error: unknown }>[] = [];
      if (taskTypeId) extras.push(tasksDb.from("tasks").update({ task_type_id: taskTypeId }).eq("id", result.task.id));
      if (assigneeId && !plain)
        extras.push(
          tasksDb.from("task_assignees").insert({ task_id: result.task.id, user_id: assigneeId, assigned_by: user?.id ?? null }),
        );
      for (const { error } of await Promise.all(extras)) if (error) emitTaskError(extractErrorMessage(error));
      if (!addAnother) {
        onClose();
        return;
      }
      // keep building the chain: the next task follows the one just made
      setTitle("");
      setPlacement("after");
      setAnchorId(result.task.id);
      setPushSuccessors(true);
      titleRef.current?.focus();
    } catch {
      // the tasks module's error toast already says why
    }
  };

  const dayText = (v: string | null | undefined) => {
    const d = day(v);
    return d ? (plain ? String(dateToDayOffset(d)) : d) : "";
  };
  const rangeLabel = (a: string | null | undefined, b: string | null | undefined) =>
    plain ? `${dayOffsetLabel(Number(dayText(a)))} → ${dayOffsetLabel(Number(dayText(b)))}` : `${dayText(a)} → ${dayText(b)}`;

  const filteredAnchors = scheduled.filter((t) => !anchorSearch.trim() || t.title.includes(anchorSearch.trim()));
  const depthOf = (t: BoardScheduleTask) => {
    let depth = 0;
    let cursor = t.parent_task_id;
    while (cursor && depth < 6) {
      depth += 1;
      cursor = byId.get(cursor)?.parent_task_id ?? null;
    }
    return depth;
  };

  const anchorParent = anchor && !parentTaskId && anchor.parent_task_id ? byId.get(anchor.parent_task_id) : null;
  const willBecomeSummary = !!parent && !parent.is_summary && !!parent.start_date;
  const moved = preview?.moved ?? [];
  const endBefore = preview?.board_end_before ?? null;
  const endAfter = preview?.board_end_after ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">{parent ? "مهمة فرعية جديدة" : "مهمة جديدة"}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100" aria-label="إغلاق">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {parent && (
            <div className="text-xs text-gray-500">
              تحت <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">{parent.title}</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500" htmlFor="new-task-title">
              اسم المهمة
            </label>
            <input
              id="new-task-title"
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit(e.ctrlKey || e.metaKey);
              }}
              placeholder="مثال: صب الخرسانة للدور الأول"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold text-gray-500">البداية</div>
            <div className="flex overflow-hidden rounded-md border border-gray-200 text-xs">
              {(
                [
                  { key: "none", label: "بدون ارتباط", icon: Unlink },
                  { key: "after", label: "بعد مهمة", icon: Link2 },
                  { key: "with", label: "بالتزامن مع مهمة", icon: Equal },
                ] as const
              ).map(({ key, label, icon: Icon }, i) => (
                <button
                  key={key}
                  type="button"
                  disabled={key !== "none" && scheduled.length === 0}
                  onClick={() => {
                    setPlacement(key);
                    if (key !== "none" && !anchorId) setAnchorId(lastSibling?.id ?? scheduled[scheduled.length - 1]?.id ?? null);
                  }}
                  className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 disabled:cursor-not-allowed disabled:opacity-40 ${
                    i > 0 ? "border-r border-gray-200" : ""
                  } ${placement === key ? "bg-primary-superLight font-medium text-primary" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {placement === "none" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {plain ? (
                  <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1 text-sm text-gray-700">
                    <span className="text-gray-500">يوم</span>
                    <input
                      type="number"
                      value={dateToDayOffset(startDate)}
                      onChange={(e) => {
                        const n = Math.trunc(Number(e.target.value));
                        if (Number.isFinite(n)) setStartDate(dayOffsetToDate(n));
                      }}
                      className="w-16 bg-transparent text-center outline-none"
                      dir="ltr"
                      aria-label="يوم البدء"
                    />
                  </label>
                ) : (
                  <button
                    ref={startRef}
                    type="button"
                    onClick={() => setOpenPicker(openPicker === "start" ? null : "start")}
                    className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                    {fmtDay(workingDayOnOrAfterString(startDate))}
                  </button>
                )}
                {lastSibling && (
                  <button
                    type="button"
                    onClick={() => {
                      setPlacement("after");
                      setAnchorId(lastSibling.id);
                    }}
                    className="flex items-center gap-1 rounded-full border border-dashed border-primary/40 px-2 py-0.5 text-xs text-primary hover:bg-primary-superLight"
                  >
                    <Link2 className="h-3 w-3" />
                    بعد «{lastSibling.title}»
                  </button>
                )}
                {!plain && openPicker === "start" && (
                  <CalendarPopover
                    value={startDate}
                    onChange={(d) => d && setStartDate(d)}
                    onClose={() => setOpenPicker(null)}
                    anchorRef={startRef}
                    align="left"
                    allowClear={false}
                  />
                )}
              </div>
            )}

            {linked && (
              <div className="mt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => setPickingAnchor((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-right text-sm hover:bg-gray-50"
                >
                  <span className="truncate text-gray-800">{anchor ? anchor.title : "اختر المهمة…"}</span>
                  {anchor && (
                    <span className="shrink-0 text-xs text-gray-400" dir="ltr">
                      {rangeLabel(anchor.start_date, anchor.due_date)}
                    </span>
                  )}
                </button>
                {pickingAnchor && (
                  <div className="rounded-md border border-gray-200">
                    <div className="flex items-center gap-1.5 border-b border-gray-100 px-2 py-1.5">
                      <Search className="h-3.5 w-3.5 text-gray-400" />
                      <input
                        autoFocus
                        value={anchorSearch}
                        onChange={(e) => setAnchorSearch(e.target.value)}
                        placeholder="بحث في مهام اللوحة"
                        className="flex-1 bg-transparent text-sm outline-none"
                      />
                    </div>
                    <ul className="max-h-48 overflow-y-auto py-1">
                      {filteredAnchors.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setAnchorId(t.id);
                              setPickingAnchor(false);
                              setAnchorSearch("");
                            }}
                            className={`flex w-full items-center justify-between gap-2 px-3 py-1 text-right text-sm hover:bg-gray-50 ${
                              t.id === anchorId ? "bg-primary-superLight text-primary" : "text-gray-700"
                            }`}
                            style={{ paddingRight: 12 + depthOf(t) * 14 }}
                          >
                            <span className="truncate">{t.title}</span>
                            <span className="shrink-0 text-[11px] text-gray-400" dir="ltr">
                              {rangeLabel(t.start_date, t.due_date)}
                            </span>
                          </button>
                        </li>
                      ))}
                      {filteredAnchors.length === 0 && <li className="px-3 py-2 text-xs text-gray-400">لا توجد مهام مجدولة مطابقة</li>}
                    </ul>
                  </div>
                )}
                {placement === "after" && anchor && anchor.successorCount > 0 && (
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={pushSuccessors}
                      onChange={(e) => setPushSuccessors(e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    ترحيل المهام التي تلي «{anchor.title}» ({anchor.successorCount}) لتبدأ بعد هذه المهمة
                  </label>
                )}
                {anchorParent && (
                  <p className="text-xs text-gray-400">ستُضاف كمهمة فرعية تحت «{anchorParent.title}» مثل المهمة المختارة.</p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500" htmlFor="new-task-days">
                عدد أيام العمل
              </label>
              <input
                id="new-task-days"
                type="number"
                min={1}
                max={3650}
                value={daysDraft}
                onChange={(e) => {
                  setDaysDraft(e.target.value);
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 1) setDays(Math.min(3650, Math.floor(n)));
                }}
                onBlur={() => setDaysValue(Number(daysDraft) || days)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                dir="ltr"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                {plain ? "عند التطبيق: أيام عمل من تاريخ البدء" : "الجمعة لا تُحسب"}
              </p>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-gray-500">{plain ? "يوم الانتهاء" : "تاريخ الانتهاء"}</div>
              {plain ? (
                <label className="flex w-full items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <span className="text-gray-500">يوم</span>
                  <input
                    type="number"
                    value={dateToDayOffset(due)}
                    onChange={(e) => {
                      const n = Math.trunc(Number(e.target.value));
                      if (Number.isFinite(n)) setDaysValue(daysFromDue(start, dayOffsetToDate(n), true));
                    }}
                    className="w-full bg-transparent text-center outline-none"
                    dir="ltr"
                    aria-label="يوم الانتهاء"
                  />
                </label>
              ) : (
                <button
                  ref={dueRef}
                  type="button"
                  onClick={() => setOpenPicker(openPicker === "due" ? null : "due")}
                  className="flex w-full items-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                  {fmtDay(due)}
                </button>
              )}
              {!plain && openPicker === "due" && (
                <CalendarPopover
                  value={due}
                  onChange={(d) => d && setDaysValue(daysFromDue(start, d))}
                  onClose={() => setOpenPicker(null)}
                  anchorRef={dueRef}
                  align="left"
                  minDate={start}
                  allowClear={false}
                />
              )}
            </div>
          </div>

          <div className={`grid gap-3 ${plain ? "grid-cols-1" : "grid-cols-2"}`}>
            <div>
              <label htmlFor="new-task-type" className="mb-1 block text-xs font-semibold text-gray-500">
                النوع <span className="font-normal text-gray-400">(اختياري)</span>
              </label>
              <select
                id="new-task-type"
                value={taskTypeId}
                onChange={(e) => setTaskTypeId(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">الافتراضي</option>
                {taskTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name_ar}
                  </option>
                ))}
              </select>
            </div>
            {!plain && (
              <div>
                <label htmlFor="new-task-assignee" className="mb-1 block text-xs font-semibold text-gray-500">
                  المسؤول <span className="font-normal text-gray-400">(اختياري)</span>
                </label>
                <select
                  id="new-task-assignee"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">بدون مسؤول</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {[p.first_name, p.last_name].filter(Boolean).join(" ")}
                      {p.person_type === "contractor" ? " (مقاول)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {willBecomeSummary && parent && (
            <div className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                ستصبح «{parent.title}» مهمة رئيسية: تواريخها ستُحسب من مهامها الفرعية بدلاً من مدتها الحالية
                {parent.duration_days ? ` (${workingDaysLabel(parent.duration_days)})` : ""}.
              </span>
            </div>
          )}

          <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-600">
            <div className="flex items-center justify-between">
              <span>
                تبدأ <span className="font-semibold text-gray-800">{fmtDay(start)}</span> وتنتهي{" "}
                <span className="font-semibold text-gray-800">{fmtDay(due)}</span>
              </span>
              {(previewLoading || loadingTasks) && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
            </div>
            {previewError && <div className="mt-1.5 text-red-600">{extractErrorMessage(previewError)}</div>}
            {moved.length > 0 && (
              <div className="mt-2">
                <div className="font-medium text-amber-700">
                  ستتأخر {moved.length === 1 ? "مهمة واحدة" : `${moved.length} مهام`}:
                </div>
                <ul className="mt-1 space-y-0.5">
                  {moved.slice(0, 5).map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{m.title}</span>
                      <span className="shrink-0 font-medium text-amber-700" dir="ltr">
                        {m.shift_days > 0 ? `+${m.shift_days}` : m.shift_days} يوم
                      </span>
                    </li>
                  ))}
                  {moved.length > 5 && <li className="text-gray-400">و{moved.length - 5} مهام أخرى</li>}
                </ul>
              </div>
            )}
            {endBefore && endAfter && endBefore !== endAfter && (
              <div className="mt-2 text-gray-500">
                نهاية {plain ? "القالب" : "اللوحة"}: {fmtDay(endBefore)} ← <span className="font-semibold text-gray-800">{fmtDay(endAfter)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100">
            إلغاء
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void submit(true)}
              disabled={!canSubmit}
              className="flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              title="Ctrl+Enter"
            >
              إنشاء وإضافة التالية
            </button>
            <button
              onClick={() => void submit(false)}
              disabled={!canSubmit}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40"
            >
              {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CornerDownLeft className="h-3.5 w-3.5" />}
              إنشاء
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
