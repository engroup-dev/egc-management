import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  AlarmClock,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Layers,
  Loader,
  MapPin,
  Play,
  Presentation,
  RefreshCw,
  UserX,
  X,
} from "lucide-react";
import DirectoryTaskRow, { directoryRowGridStyle } from "../board/DirectoryTaskRow";
import type { TaskDirectoryData } from "../../../hooks/tasks/useTaskDirectory";
import type { Priority, TaskRow } from "../../../hooks/tasks/useTaskBoard";
import {
  buildTourSnapshot,
  categoryOf,
  completionStats,
  fitsSlide,
  groupByBoard,
  isDueThisWeek,
  isDueToStart,
  isOpenCategory,
  slideOf,
  TOUR_SLIDE_BY_KEY,
  TOUR_SLIDES,
  type TourSlideKey,
  type TourSlideMeta,
  type TourSnapshot,
} from "./spaceTour";

// =====================================================================
// Space tour — a slideshow over every task in one space, across all its
// boards: a summary first, then one slide each for overdue, in progress,
// not started, unassigned, and what was finished in the last 7 days.
// Which task goes where is decided in spaceTour.ts.
//
// Rows are the same DirectoryTaskRow as the space page, so everything that
// can be edited there (status, priority, team, dates, type) can be edited
// here, under the same per-task rights. Slide membership is a snapshot
// taken when the tour opens: an edited task stays put (dimmed, with an
// "updated" pill) instead of vanishing mid-edit; "تحديث" re-sorts.
//
// Clicking a task title opens the usual detail panel (a nested route of the
// space page) ON TOP of the slide: this dialog sits at z-40, the same layer
// as the panel, and the page renders the panel after it, so the panel wins.
// The slide stays visible behind it, scroll position and all. Popovers are
// portaled at z-50, so they still open above both.
// =====================================================================

const SLIDE_ICONS: Record<TourSlideKey, ComponentType<{ className?: string }>> = {
  overdue: AlarmClock,
  in_progress: Loader,
  not_started: CircleDashed,
  unassigned: UserX,
  recent_done: CheckCircle2,
};

interface Props {
  data: TaskDirectoryData;
  spaceName: string;
  spaceColor: string | null;
  /** True while the task detail panel is open on top — arrow keys / Esc belong to it then. */
  panelOpen: boolean;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
  onChangeStatus: (taskId: string, statusId: string) => void;
  onChangeTaskType: (taskId: string, taskTypeId: string) => void;
  onChangePriority: (taskId: string, priority: Priority | null) => void;
  onChangeStartDate: (taskId: string, date: string | null) => void;
  onChangeDueDate: (taskId: string, date: string | null) => void;
  onChangeAssignees: (taskId: string, userIds: string[]) => void;
}

type RowHandlers = Pick<
  Props,
  | "onOpenTask"
  | "onChangeStatus"
  | "onChangeTaskType"
  | "onChangePriority"
  | "onChangeStartDate"
  | "onChangeDueDate"
  | "onChangeAssignees"
>;

function Pill({ text, tone }: { text: string; tone: string }) {
  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: `${tone}1A`, color: tone }}
    >
      {text}
    </span>
  );
}

function SlideHeading({ meta, count }: { meta: TourSlideMeta; count: number }) {
  const Icon = SLIDE_ICONS[meta.key];
  return (
    <div className="mb-5 flex items-center gap-4">
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
        style={{ background: `${meta.tone}1A`, color: meta.tone }}
      >
        <Icon className="h-7 w-7" />
      </span>
      <div>
        <div className="flex items-baseline gap-3">
          <h2 className="text-2xl font-bold text-gray-900">{meta.label}</h2>
          <span className="text-2xl font-bold" style={{ color: meta.tone }}>
            {count}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-gray-500">{meta.subtitle}</p>
      </div>
    </div>
  );
}

function SummarySlide({
  data,
  spaceName,
  spaceColor,
  snapshot,
  now,
  onJump,
}: {
  data: TaskDirectoryData;
  spaceName: string;
  spaceColor: string | null;
  snapshot: TourSnapshot;
  now: number;
  onJump: (index: number) => void;
}) {
  const stats = completionStats(data);
  const openCount = data.tasks.filter((t) => isOpenCategory(categoryOf(t, data))).length;
  const dueThisWeek = data.tasks.filter((t) => isDueThisWeek(t, data, now)).length;
  const boardCount = data.boardNamesById.size;

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col justify-center gap-8">
      <div className="text-center">
        <div className="text-sm font-medium text-gray-400">جولة في المساحة</div>
        <h2 className="mt-1 text-3xl font-bold text-gray-900" style={spaceColor ? { color: spaceColor } : undefined}>
          {spaceName}
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          {boardCount} لوحة · {data.tasks.length} مهمة · {openCount} مفتوحة
        </p>
      </div>

      <div className="mx-auto w-full max-w-xl">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">نسبة الإنجاز</span>
          <span className="font-bold text-gray-900">
            {Math.round(stats.rate * 100)}%{" "}
            <span className="text-xs font-normal text-gray-400">
              ({stats.done} من {stats.countable})
            </span>
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${stats.rate * 100}%` }} />
        </div>
        {dueThisWeek > 0 && (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-sm text-blue-700">
            <CalendarClock className="h-4 w-4" />
            {dueThisWeek} مهمة مستحقة خلال الأيام السبعة القادمة
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {TOUR_SLIDES.map((meta, i) => {
          const Icon = SLIDE_ICONS[meta.key];
          const count = snapshot[meta.key].length;
          return (
            <button
              key={meta.key}
              onClick={() => onJump(i + 1)}
              className="flex flex-col items-start gap-2 rounded-xl border border-gray-100 bg-white p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              style={count > 0 && meta.key === "overdue" ? { borderColor: `${meta.tone}55` } : undefined}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ background: `${meta.tone}1A`, color: meta.tone }}
              >
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className="text-2xl font-bold" style={{ color: count > 0 ? meta.tone : "#9CA3AF" }}>
                {count}
              </span>
              <span className="text-sm font-medium text-gray-700">{meta.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TaskSlide({
  meta,
  tasks,
  data,
  now,
  selectedBoardId,
  onSelectBoard,
  handlers,
}: {
  meta: TourSlideMeta;
  tasks: TaskRow[];
  data: TaskDirectoryData;
  now: number;
  selectedBoardId: string | "all";
  onSelectBoard: (boardId: string | "all") => void;
  handlers: RowHandlers;
}) {
  const [inProgressFilter, setInProgressFilter] = useState<"all" | "active" | "due_to_start">("all");

  const activeStatus = useMemo(() => data.statuses.find((s) => s.category === "active"), [data.statuses]);
  const doneStatus = useMemo(() => data.statuses.find((s) => s.category === "done"), [data.statuses]);

  const boardsList = useMemo(() => {
    return Array.from(data.boardNamesById.entries())
      .map(([id, name]) => ({
        id,
        name,
        order: data.boardOrderById.get(id) ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ar"));
  }, [data.boardNamesById, data.boardOrderById]);

  const boardTaskCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      map.set(t.board_id, (map.get(t.board_id) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  const activeTasks = useMemo(
    () => tasks.filter((t) => categoryOf(t, data) === "active"),
    [tasks, data],
  );

  const dueToStartTasks = useMemo(
    () => tasks.filter((t) => isDueToStart(t, data, now)),
    [tasks, data, now],
  );

  const displayedTasks = useMemo(() => {
    let list = tasks;
    if (selectedBoardId !== "all") {
      list = list.filter((t) => t.board_id === selectedBoardId);
    }
    if (meta.key === "in_progress") {
      if (inProgressFilter === "active") return list.filter((t) => categoryOf(t, data) === "active");
      if (inProgressFilter === "due_to_start") return list.filter((t) => isDueToStart(t, data, now));
    }
    return list;
  }, [meta.key, selectedBoardId, inProgressFilter, tasks, data, now]);

  const groups = useMemo(() => groupByBoard(displayedTasks, data), [displayedTasks, data]);
  const showCompleted = meta.key === "recent_done";
  const Icon = SLIDE_ICONS[meta.key];

  return (
    <div className="mx-auto max-w-6xl">
      <SlideHeading meta={meta} count={displayedTasks.length} />

      {/* Board / Zone filter */}
      {boardsList.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200/80 bg-white p-2 shadow-xs">
          <span className="flex items-center gap-1.5 px-2 text-xs font-bold text-gray-600">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            <span>المنطقة:</span>
          </span>
          <button
            type="button"
            onClick={() => onSelectBoard("all")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
              selectedBoardId === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-gray-50 text-gray-700 hover:bg-gray-100"
            }`}
          >
            <span>كل المناطق</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                selectedBoardId === "all" ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
              }`}
            >
              {tasks.length}
            </span>
          </button>
          {boardsList.map((board) => {
            const count = boardTaskCount.get(board.id) ?? 0;
            const isSelected = selectedBoardId === board.id;
            return (
              <button
                key={board.id}
                type="button"
                onClick={() => onSelectBoard(isSelected ? "all" : board.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                  isSelected
                    ? "bg-primary text-white shadow-xs"
                    : count > 0
                      ? "bg-white border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                      : "bg-gray-50 text-gray-400 opacity-60 hover:opacity-100"
                }`}
              >
                <span>{board.name}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isSelected
                      ? "bg-white/20 text-white"
                      : count > 0
                        ? "bg-gray-100 text-gray-600"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* In-progress status subfilter */}
      {meta.key === "in_progress" && (
        <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
          <button
            type="button"
            onClick={() => setInProgressFilter("all")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              inProgressFilter === "all"
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <span>الكل</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                inProgressFilter === "all" ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
              }`}
            >
              {tasks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setInProgressFilter("active")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              inProgressFilter === "active"
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200/50"
            }`}
          >
            <span>قيد التنفيذ حالياً</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                inProgressFilter === "active" ? "bg-white/20 text-white" : "bg-purple-100 text-purple-800"
              }`}
            >
              {activeTasks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setInProgressFilter("due_to_start")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              inProgressFilter === "due_to_start"
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60"
            }`}
          >
            <span>تاريخها جاء ولم تبدأ</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                inProgressFilter === "due_to_start" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-900"
              }`}
            >
              {dueToStartTasks.length}
            </span>
          </button>
        </div>
      )}

      {displayedTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 py-20 text-gray-400">
          {/* An empty problem slide is good news; an empty "finished" slide isn't. */}
          {meta.key === "recent_done" ? (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-300">
              <Icon className="h-7 w-7" />
            </span>
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
              <CheckCircle2 className="h-7 w-7" />
            </span>
          )}
          <span className="text-base">{meta.empty}</span>
          {selectedBoardId !== "all" && (
            <button
              type="button"
              onClick={() => onSelectBoard("all")}
              className="mt-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-200 transition cursor-pointer"
            >
              عرض كل المناطق
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.boardId} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">
                <Layers className="h-3.5 w-3.5 text-gray-400" />
                <span className="truncate">{group.label}</span>
                <span className="text-xs font-normal text-gray-400">({group.tasks.length})</span>
              </div>
              <div
                style={directoryRowGridStyle({ showCompleted })}
                className="border-b border-gray-100 px-2 py-1.5 text-xs font-semibold text-gray-500"
              >
                <div>عنوان المهمة</div>
                <div>الحالة</div>
                <div>الأولوية</div>
                <div>الفريق</div>
                <div>تاريخ البدء</div>
                <div>الاستحقاق</div>
                {showCompleted && <div>تاريخ الإنجاز</div>}
              </div>
              {group.tasks.map((task) => {
                // Edited since the tour opened and no longer fits this slide:
                // keep it in place, dimmed, and say where it would go now.
                const moved = !fitsSlide(meta.key, task, data, now);
                const current = slideOf(task, data, now);
                const category = categoryOf(task, data);
                const dueStart = isDueToStart(task, data, now);

                let quickAction: ReactNode = null;
                if (category === "not_started" && activeStatus) {
                  quickAction = (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlers.onChangeStatus(task.id, activeStatus.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 text-[11px] font-bold transition shadow-2xs hover:shadow-xs shrink-0 cursor-pointer"
                      title="بدء العمل على المهمة فوراً (تحويل إلى قيد التنفيذ)"
                    >
                      <Play className="h-2.5 w-2.5 fill-current text-purple-600" />
                      <span>بدء العمل</span>
                    </button>
                  );
                } else if (category === "active" && doneStatus) {
                  quickAction = (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlers.onChangeStatus(task.id, doneStatus.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold transition shadow-2xs hover:shadow-xs shrink-0 cursor-pointer"
                      title="تحديد المهمة كمنجزة فوراً"
                    >
                      <Check className="h-3 w-3 stroke-[2.5] text-emerald-600" />
                      <span>إنجاز المهمة</span>
                    </button>
                  );
                }

                const badge = (
                  <div className="inline-flex items-center gap-1.5 shrink-0">
                    {moved ? (
                      <Pill text={`✓ تم التحديث ← ${current ? TOUR_SLIDE_BY_KEY[current].label : "مغلقة"}`} tone="#059669" />
                    ) : dueStart && meta.key === "in_progress" ? (
                      <Pill text="يفترض أنها بدأت" tone="#D97706" />
                    ) : isDueThisWeek(task, data, now) ? (
                      <Pill text="هذا الأسبوع" tone="#2563EB" />
                    ) : null}
                    {quickAction}
                  </div>
                );

                return (
                  <div key={task.id} className={moved ? "bg-emerald-50/40 opacity-60 transition-opacity hover:opacity-100" : undefined}>
                    <DirectoryTaskRow
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
                      showCompleted={showCompleted}
                      titleBadge={badge}
                      {...handlers}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export default function SpaceTourDialog({
  data,
  spaceName,
  spaceColor,
  panelOpen,
  onClose,
  ...handlers
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState(() => buildTourSnapshot(data, now));
  const [selectedBoardId, setSelectedBoardId] = useState<string | "all">("all");
  // 0 = summary, then one per TOUR_SLIDES entry
  const [index, setIndex] = useState(0);
  const slideCount = TOUR_SLIDES.length + 1;
  const bodyRef = useRef<HTMLDivElement>(null);

  const taskById = useMemo(() => new Map(data.tasks.map((t) => [t.id, t])), [data.tasks]);
  // Live rows for the snapshot's ids; a task deleted/archived meanwhile just drops out.
  const tasksFor = (key: TourSlideKey) =>
    snapshot[key].map((id) => taskById.get(id)).filter((t): t is TaskRow => !!t);

  const refresh = () => {
    const at = Date.now();
    setNow(at);
    setSnapshot(buildTourSnapshot(data, at));
  };

  const go = (next: number) => setIndex(Math.max(0, Math.min(slideCount - 1, next)));

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [index]);

  useEffect(() => {
    if (panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (isTyping(e.target)) return;
      // RTL: left moves forward, right moves back.
      if (e.key === "ArrowLeft") setIndex((i) => Math.min(slideCount - 1, i + 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelOpen, onClose, slideCount]);

  const meta = index > 0 ? TOUR_SLIDES[index - 1] : null;
  const isLast = index === slideCount - 1;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={`جولة في المساحة: ${spaceName}`}
    >
      <div className="flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-gray-50 shadow-2xl">
        {/* Header: title, step tabs, refresh / close */}
        <div className="flex items-center gap-4 border-b border-gray-200 bg-white px-5 py-3">
          <div className="flex shrink-0 items-center gap-2">
            <Presentation className="h-5 w-5 text-primary" />
            <span className="font-semibold text-gray-900" style={spaceColor ? { color: spaceColor } : undefined}>
              {spaceName}
            </span>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => go(0)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                index === 0 ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              الملخص
            </button>
            {TOUR_SLIDES.map((s, i) => {
              const active = index === i + 1;
              return (
                <button
                  key={s.key}
                  onClick={() => go(i + 1)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                    active ? "text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                  style={active ? { background: s.tone } : undefined}
                >
                  {!active && <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.tone }} />}
                  {s.label}
                  <span className={active ? "text-white/80" : "text-gray-400"}>{snapshot[s.key].length}</span>
                </button>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={refresh}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
              title="إعادة توزيع المهام على الشرائح حسب حالتها الآن"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              تحديث
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="إغلاق" title="إغلاق (Esc)">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Slide */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          {meta ? (
            <TaskSlide
              meta={meta}
              tasks={tasksFor(meta.key)}
              data={data}
              now={now}
              selectedBoardId={selectedBoardId}
              onSelectBoard={setSelectedBoardId}
              handlers={handlers}
            />
          ) : (
            <SummarySlide
              data={data}
              spaceName={spaceName}
              spaceColor={spaceColor}
              snapshot={snapshot}
              now={now}
              onJump={go}
            />
          )}
        </div>

        {/* Footer: previous / progress / next */}
        <div className="flex items-center gap-4 border-t border-gray-200 bg-white px-5 py-3">
          <button
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
            السابق
          </button>
          <div className="flex flex-1 items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${((index + 1) / slideCount) * 100}%`, background: meta?.tone ?? "#111827" }}
              />
            </div>
            <span className="shrink-0 text-xs text-gray-400">
              {index + 1} / {slideCount}
            </span>
          </div>
          <button
            onClick={() => (isLast ? onClose() : go(index + 1))}
            className="flex items-center gap-1 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            {index === 0 ? "ابدأ الجولة" : isLast ? "إنهاء" : "التالي"}
            {!isLast && <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
