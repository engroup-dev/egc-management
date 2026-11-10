import { useState, useMemo } from "react";
import {
  ClipboardCheck,
  CheckCircle2,
  X,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Layers,
  Users,
  AlertTriangle,
  Clock,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Check,
  PauseCircle,
  TrendingUp,
  FileText,
  Loader2,
  TableProperties,
  LayoutGrid,
  HardHat,
  ArrowLeft,
  Wrench,
  CheckCircle,
} from "lucide-react";
import type { TaskDirectoryData } from "../../../hooks/tasks/useTaskDirectory";
import {
  filterDailyTasks,
  getTodayString,
  type DailyTaskItem,
  type DailyAnswer,
} from "./dailyStandup";
import { addWorkingDays, workingDayOnOrAfterString } from "../board/workingDays";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateSchedule } from "../../../hooks/tasks/useTaskSchedule";

interface DailyStandupDialogProps {
  data: TaskDirectoryData;
  spaceName: string;
  spaceColor: string | null;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
  onChangeTaskDates: (
    taskId: string,
    change: { startDate?: string | null; dueDate?: string | null; durationDays?: number },
  ) => void;
  onChangeStatus?: (taskId: string, statusId: string) => void;
}

const DELAY_REASONS = [
  "نقص مواد وتوريدات",
  "غياب المقاول / العمالة",
  "بانتظار دفعة مالية",
  "معوقات في الموقع / تنسيق",
  "أخرى",
];

function cleanDate(d: string | null | undefined): string {
  if (!d) return "-";
  return d.slice(0, 10).replace(/-/g, "/");
}

function loadSavedAnswers(today: string): Record<string, DailyAnswer> {
  try {
    const raw = localStorage.getItem(`egc_daily_standup_${today}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAnswersToStorage(today: string, answersMap: Map<string, DailyAnswer>) {
  try {
    const obj: Record<string, DailyAnswer> = {};
    for (const [id, ans] of answersMap.entries()) {
      obj[id] = ans;
    }
    localStorage.setItem(`egc_daily_standup_${today}`, JSON.stringify(obj));
  } catch {}
}

export default function DailyStandupDialog({
  data,
  spaceName,
  spaceColor,
  onClose,
  onChangeTaskDates,
  onChangeStatus,
}: DailyStandupDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = getTodayString();

  const dailyTasks = useMemo(() => filterDailyTasks(data), [data]);

  // Selected scope:
  // null = Selector Screen (اختر التخصص: ليساة، كهرباء...)
  // "all" = All tasks
  // string (board_id) = Specific discipline
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>("all");

  const boardGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        order: number;
        tasks: DailyTaskItem[];
      }
    >();

    for (const item of dailyTasks) {
      const bid = item.task.board_id;
      const bname = item.boardName || "عام";
      const border = data.boardOrderById.get(bid) ?? Number.MAX_SAFE_INTEGER;

      if (!map.has(bid)) {
        map.set(bid, { id: bid, name: bname, order: border, tasks: [] });
      }
      map.get(bid)!.tasks.push(item);
    }

    return Array.from(map.values())
      .map((g) => ({
        ...g,
        disciplines: Array.from(new Set(g.tasks.map((t) => t.discipline))),
      }))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ar"));
  }, [dailyTasks, data.boardOrderById]);

  // Unique disciplines in currently selected board/scope
  const disciplinesInBoard = useMemo(() => {
    if (!selectedBoardId) return [];
    const tasksInBoard =
      selectedBoardId === "all"
        ? dailyTasks
        : dailyTasks.filter((t) => t.task.board_id === selectedBoardId);
    const map = new Map<string, number>();
    for (const t of tasksInBoard) {
      map.set(t.discipline, (map.get(t.discipline) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [selectedBoardId, dailyTasks]);

  const activeTasks = useMemo(() => {
    if (!selectedBoardId) return [];
    let list =
      selectedBoardId === "all"
        ? dailyTasks
        : dailyTasks.filter((t) => t.task.board_id === selectedBoardId);
    if (selectedDiscipline && selectedDiscipline !== "all") {
      list = list.filter((t) => t.discipline === selectedDiscipline);
    }
    return list;
  }, [selectedBoardId, selectedDiscipline, dailyTasks]);

  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [currentIndex, setCurrentIndex] = useState(0);

  const [answers, setAnswers] = useState<Map<string, DailyAnswer>>(() => {
    const saved = loadSavedAnswers(today);
    const initial = new Map<string, DailyAnswer>();
    for (const item of dailyTasks) {
      if (saved[item.task.id]) {
        initial.set(item.task.id, saved[item.task.id]);
      } else {
        initial.set(item.task.id, {
          taskId: item.task.id,
          didWork: true,
          progressPercent: 50,
          remainingDays: 0,
        });
      }
    }
    return initial;
  });

  const [isSectionComplete, setIsSectionComplete] = useState(false);
  const [isSummaryView, setIsSummaryView] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const inProgressStatus = data.statuses.find(
    (s) => s.category === "active" || s.category === "in_progress",
  );
  const doneStatus = data.statuses.find((s) => s.category === "done");

  const currentItem: DailyTaskItem | undefined = activeTasks[currentIndex];
  const currentAnswer: DailyAnswer | undefined = currentItem
    ? answers.get(currentItem.task.id) ?? {
        taskId: currentItem.task.id,
        didWork: true,
        progressPercent: 50,
        remainingDays: 0,
      }
    : undefined;

  const updateAnswer = (taskId: string, patch: Partial<DailyAnswer>) => {
    setAnswers((prev) => {
      const next = new Map(prev);
      const existing = next.get(taskId) ?? {
        taskId,
        didWork: true,
        progressPercent: 50,
        remainingDays: 0,
      };
      next.set(taskId, { ...existing, ...patch });
      saveAnswersToStorage(today, next);
      return next;
    });
  };

  const handleNext = () => {
    if (currentIndex < activeTasks.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setIsSectionComplete(true);
    }
  };

  const handlePrev = () => {
    if (isSectionComplete) {
      setIsSectionComplete(false);
    } else if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    } else {
      setSelectedBoardId(null);
    }
  };

  const handleApplyAll = async () => {
    if (!user?.id || submitting) return;
    setSubmitting(true);

    try {
      const tasksDb = supabase.schema("tasks");

      for (const [taskId, ans] of answers.entries()) {
        const item = dailyTasks.find((d) => d.task.id === taskId);
        if (!item) continue;

        let noteLines: string[] = [];

        if (ans.didWork) {
          if (ans.markCompleted && doneStatus && onChangeStatus) {
            onChangeStatus(taskId, doneStatus.id);
            noteLines.push("الحالة: تم إنجاز المهمة بنسبة 100%");
          } else if (item.task.status_id !== inProgressStatus?.id && inProgressStatus && onChangeStatus) {
            onChangeStatus(taskId, inProgressStatus.id);
            noteLines.push("الحالة: تم بدء العمل بالموقع (قيد التنفيذ)");
          }

          if (ans.progressPercent) {
            noteLines.push(`نسبة الإنجاز: ${ans.progressPercent}%`);
          }

          if (ans.workersCount) {
            noteLines.push(
              `عدد العمالة بالموقع: ${ans.workersCount} ${
                ans.workersCount === 1 ? "عامل" : ans.workersCount === 2 ? "عاملان" : "عمال"
              }`,
            );
          }

          if (ans.remainingDays !== undefined && ans.remainingDays > 0) {
            const newDue = addWorkingDays(today, ans.remainingDays);
            onChangeTaskDates(taskId, {
              dueDate: newDue,
              durationDays: Math.max(1, ans.remainingDays),
            });
            noteLines.push(`المدة المتبقية المتوقعة: ${ans.remainingDays} أيام عمل (تاريخ التسليم: ${newDue})`);
          }
        } else {
          if (ans.delayReason) {
            noteLines.push(`توقف العمل بسبب: ${ans.delayReason}`);
          }
          if (ans.postponeAction === "tomorrow") {
            const nextDay = workingDayOnOrAfterString(addWorkingDays(today, 1));
            onChangeTaskDates(taskId, { startDate: nextDay });
            noteLines.push(`الإجراء: تم تأجيل موعد البدء إلى الغد (${nextDay})`);
          } else if (ans.postponeAction === "next_week") {
            const nextWeek = workingDayOnOrAfterString(addWorkingDays(today, 5));
            onChangeTaskDates(taskId, { startDate: nextWeek });
            noteLines.push(`الإجراء: تم تأجيل موعد البدء إلى الأسبوع القادم (${nextWeek})`);
          }
        }

        if (ans.note?.trim()) {
          noteLines.push(`ملاحظة المهندس: ${ans.note.trim()}`);
        }

        if (noteLines.length > 0) {
          const logBody = `📋 يومية الموقع [${today}]:\n` + noteLines.join("\n");
          await tasksDb.from("task_comments").insert({
            task_id: taskId,
            author_user_id: user.id,
            body: { text: logBody },
          });
        }
      }

      saveAnswersToStorage(today, answers);
      invalidateSchedule(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["task-directory"] });
      await queryClient.invalidateQueries({ queryKey: ["task-board"] });

      setSavedSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Error saving daily standup:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const summaryStats = useMemo(() => {
    let worked = 0;
    let stopped = 0;
    let completed = 0;
    for (const ans of answers.values()) {
      if (ans.didWork) {
        worked++;
        if (ans.markCompleted) completed++;
      } else {
        stopped++;
      }
    }
    return { worked, stopped, completed };
  }, [answers]);

  const selectedBoardName = useMemo(() => {
    if (!selectedBoardId) return "";
    if (selectedBoardId === "all") return "جميع البنود والتخصصات";
    return boardGroups.find((b) => b.id === selectedBoardId)?.name ?? "تخصص";
  }, [selectedBoardId, boardGroups]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 md:p-5 backdrop-blur-xs"
      dir="rtl"
    >
      {/* Clean, Pure White Container - Zero Page Scroll, Perfectly Fits Height */}
      <div className="relative flex h-[580px] max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* ========================================================================= */}
        {/* TOP HEADER */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <ClipboardCheck className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">المتابعة الميدانية اليومية</h2>
                <span className="rounded-full bg-emerald-100/80 px-2 py-0.2 text-[10px] font-bold text-emerald-800">
                  {today}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                مشروع: <span className="font-bold text-slate-700">{spaceName}</span> · {dailyTasks.length} مهمة تحتاج متابعة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 cursor-pointer transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SUCCESS OVERLAY */}
        {/* ========================================================================= */}
        {savedSuccess && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/95">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 mb-2">
              <CheckCircle2 className="h-8 w-8 animate-bounce" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-0.5">تم حفظ يومية الموقع بنجاح!</h3>
            <p className="text-xs text-slate-500">تم تحديث لوحة المهام وجدول العمل تلقائياً.</p>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 1: SELECTOR - CLEAN WHITE, ZERO SCROLL */}
        {/* ========================================================================= */}
        {!selectedBoardId && !isSummaryView && (
          <div className="flex-1 p-5 flex flex-col justify-between overflow-hidden">
            <div>
              {/* Clean White Heading */}
              <div className="mb-4">
                <h3 className="text-base font-bold text-slate-900">أي بند أو تخصص تريد متابعته اليوم؟</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  اختر أحد التخصصات للبدء في مراجعة بنوده، أو اختر «جميع البنود» لمتابعة شاملة.
                </p>
              </div>

              {/* Cards Grid - Fits neatly in 2 rows, NO SCROLL */}
              <div className="grid grid-cols-3 gap-3">
                {/* Special Card: All Tasks */}
                <div
                  onClick={() => {
                    setSelectedBoardId("all");
                    setSelectedDiscipline("all");
                    setCurrentIndex(0);
                    setIsSectionComplete(false);
                  }}
                  className="group relative flex flex-col justify-between rounded-xl border border-emerald-300 bg-emerald-50/40 p-3.5 hover:border-emerald-500 hover:bg-emerald-50/80 transition-all cursor-pointer shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
                        <Layers className="h-4 w-4" />
                      </div>
                      <span className="rounded-full bg-emerald-200/90 text-emerald-950 px-2.5 py-0.5 text-[11px] font-black">
                        {dailyTasks.length} مهام
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 mb-0.5">جميع البنود والتخصصات</h4>
                    <p className="text-[11px] text-slate-500">متابعة شاملة لكل البنود بالتوالي</p>
                  </div>

                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-emerald-200/60 text-[11px] font-bold text-emerald-700">
                    <span>متابعة شاملة</span>
                    <ChevronLeft className="h-3.5 w-3.5 transform group-hover:-translate-x-1 transition-transform" />
                  </div>
                </div>

                {/* Individual Board Cards */}
                {boardGroups.map((bg) => {
                  const inProgressCount = bg.tasks.filter((t) => t.urgency === "in_progress").length;
                  const overdueCount = bg.tasks.filter(
                    (t) => t.urgency === "overdue_start" || t.urgency === "should_start_today",
                  ).length;
                  const answeredInBoard = bg.tasks.filter((t) => answers.has(t.task.id)).length;
                  const isFullyChecked = answeredInBoard === bg.tasks.length;

                  return (
                    <div
                      key={bg.id}
                      onClick={() => {
                        setSelectedBoardId(bg.id);
                        setSelectedDiscipline("all");
                        setCurrentIndex(0);
                        setIsSectionComplete(false);
                      }}
                      className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 hover:border-emerald-500 hover:shadow-sm transition-all cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 group-hover:bg-emerald-100 group-hover:text-emerald-700 transition-colors">
                            <Wrench className="h-4 w-4" />
                          </div>
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-800">
                            {bg.tasks.length} {bg.tasks.length === 1 ? "بند" : "بنود"}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-slate-900 mb-1">{bg.name}</h4>

                        <div className="flex flex-wrap gap-1 mb-1">
                          {inProgressCount > 0 && (
                            <span className="rounded bg-sky-50 border border-sky-200/60 px-1.5 py-0.2 text-[10px] font-bold text-sky-700">
                              {inProgressCount} قيد التنفيذ
                            </span>
                          )}
                          {overdueCount > 0 && (
                            <span className="rounded bg-rose-50 border border-rose-200/60 px-1.5 py-0.2 text-[10px] font-bold text-rose-700">
                              {overdueCount} تأخر البدء
                            </span>
                          )}
                        </div>

                        {/* Disciplines inside this board */}
                        {bg.disciplines && bg.disciplines.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {bg.disciplines.map((d) => (
                              <span
                                key={d}
                                className="rounded bg-slate-50 border border-slate-200/70 px-1.5 py-0.2 text-[9px] font-medium text-slate-600"
                              >
                                {d}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] font-bold text-slate-600 group-hover:text-emerald-600 transition-colors">
                        <span>
                          {isFullyChecked ? (
                            <span className="text-emerald-600 flex items-center gap-1 font-bold">
                              <CheckCircle className="h-3 w-3" /> تم تسجيل المتابعة
                            </span>
                          ) : (
                            <span>بدء مراجعة التخصص</span>
                          )}
                        </span>
                        <ChevronLeft className="h-3.5 w-3.5 transform group-hover:-translate-x-1 transition-transform" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Bar */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 shrink-0">
              <div className="text-xs text-slate-500">
                تم تسجيل ملاحظات <span className="font-bold text-slate-800">{answers.size} مهمة</span> في الموقع لليوم.
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSummaryView(true)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  معاينة الملخص
                </button>
                <button
                  type="button"
                  onClick={handleApplyAll}
                  disabled={submitting}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>اعتماد وحفظ اليومية</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 2: QUESTIONS - CLEAN WHITE, ZERO SCROLL */}
        {/* ========================================================================= */}
        {selectedBoardId && !isSectionComplete && !isSummaryView && currentItem && (
          <>
            {/* Top Bar with Progress & Sub-Discipline Filter */}
            <div className="border-b border-slate-100 bg-white px-5 py-2 shrink-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBoardId(null);
                      setSelectedDiscipline("all");
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                  >
                    <ArrowRight className="h-3 w-3 text-emerald-600" />
                    <span>تغيير المنطقة</span>
                  </button>
                  <span className="text-slate-300">/</span>
                  <span className="text-xs font-bold text-slate-900">{selectedBoardName}</span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                  <span>
                    البند {currentIndex + 1} من {activeTasks.length}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.2 text-[10px] font-bold text-emerald-800">
                    {Math.round(((currentIndex + 1) / Math.max(1, activeTasks.length)) * 100)}%
                  </span>
                </div>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                  style={{ width: `${((currentIndex + 1) / Math.max(1, activeTasks.length)) * 100}%` }}
                />
              </div>

              {/* Sub-trade / Discipline filter pills inside current board (e.g. سباكة، كهرباء، لياسة، حدادة...) */}
              {disciplinesInBoard.length > 0 && (
                <div className="mt-2 flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0 ms-0.5">التصنيف:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDiscipline("all");
                      setCurrentIndex(0);
                    }}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
                      selectedDiscipline === "all"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    الكل ({disciplinesInBoard.reduce((acc, d) => acc + d.count, 0)})
                  </button>
                  {disciplinesInBoard.map((d) => (
                    <button
                      key={d.name}
                      type="button"
                      onClick={() => {
                        setSelectedDiscipline(d.name);
                        setCurrentIndex(0);
                      }}
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
                        selectedDiscipline === d.name
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
                      }`}
                    >
                      {d.name} ({d.count})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Questions Body - Compact, Fits completely without scrolling */}
            <div className="flex-1 p-3.5 md:p-4 flex flex-col justify-between overflow-hidden">
              <div>
                {/* Task Info Header Card */}
                <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          backgroundColor: `${currentItem.urgencyBadgeColor}15`,
                          color: currentItem.urgencyBadgeColor,
                        }}
                      >
                        {currentItem.urgencyLabel}
                      </span>
                      <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 shadow-2xs">
                        {currentItem.discipline}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                      <Layers className="h-3 w-3 text-slate-400" />
                      <span>{currentItem.boardName}</span>
                    </div>
                  </div>

                  <h3 className="text-sm md:text-base font-bold text-slate-900 mb-1">
                    {currentItem.task.title}
                  </h3>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-1.5 text-[11px]">
                    {currentItem.assignees && currentItem.assignees.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {currentItem.assignees.map((person) => (
                          <span
                            key={person.id}
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium ${
                              person.isContractor
                                ? "bg-amber-100 text-amber-900 border border-amber-200"
                                : "bg-slate-200/70 text-slate-800 border border-slate-300/60"
                            }`}
                          >
                            <HardHat className="h-3 w-3 shrink-0 opacity-70" />
                            <span>{person.isContractor ? `المقاول: ${person.name}` : person.name}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">لم يُعيّن مقاول أو مسؤول</span>
                    )}

                    <div className="flex items-center gap-3 text-slate-500 ms-auto">
                      {currentItem.task.start_date && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          <span>البدء: {cleanDate(currentItem.task.start_date)}</span>
                        </div>
                      )}
                      {currentItem.task.due_date && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-400" />
                          <span>التسليم: {cleanDate(currentItem.task.due_date)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contextual Question Title */}
                <div className="mb-2">
                  {currentItem.urgency === "in_progress" ? (
                    <h4 className="text-xs font-bold text-slate-800">
                      شن صار في هذا البند اليوم؟ <span className="font-normal text-slate-500">(قيد التنفيذ بالموقع)</span>
                    </h4>
                  ) : currentItem.urgency === "overdue_start" || currentItem.urgency === "should_start_today" ? (
                    <h4 className="text-xs font-bold text-amber-900">
                      تاريخ البدء حان ولم يبدأ بعد، عليش ما بدأش؟ <span className="font-normal text-amber-700">(هل بدأ اليوم أم تأخر؟)</span>
                    </h4>
                  ) : (
                    <h4 className="text-xs font-bold text-slate-800">ما حالة العمل في هذا البند اليوم؟</h4>
                  )}
                </div>

                {/* Dual Toggle Buttons */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => updateAnswer(currentItem.task.id, { didWork: true })}
                    className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      currentAnswer?.didWork !== false
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>نعم، تم العمل اليوم / بدأ العمل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateAnswer(currentItem.task.id, { didWork: false })}
                    className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      currentAnswer?.didWork === false
                        ? "bg-amber-600 text-white shadow-xs"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <PauseCircle className="h-4 w-4" />
                    <span>لا، لم يعمل / متوقف / تأخر البدء</span>
                  </button>
                </div>

                {/* Sub-options in Clean, Compact White Box */}
                {currentAnswer?.didWork !== false ? (
                  /* Case A: Worked */
                  <div className="space-y-1.5 rounded-xl border border-emerald-100 bg-emerald-50/20 p-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-emerald-950 mb-0.5">
                        نسبة الإنجاز في البند:
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[25, 50, 75, 100].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() =>
                              updateAnswer(currentItem.task.id, {
                                progressPercent: pct,
                                markCompleted: pct === 100,
                              })
                            }
                            className={`rounded-lg border py-1 text-xs font-bold transition-all cursor-pointer ${
                              (currentAnswer?.progressPercent ?? 50) === pct
                                ? pct === 100
                                  ? "border-blue-600 bg-blue-600 text-white shadow-xs"
                                  : "border-emerald-600 bg-emerald-600 text-white shadow-xs"
                                : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300"
                            }`}
                          >
                            {pct === 100 ? "100% (اكتملت)" : `${pct}%`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {!currentAnswer?.markCompleted && (
                      <div>
                        <label className="block text-[11px] font-bold text-emerald-950 mb-0.5">
                          كم يوم عمل متبقي تقريباً لإنهاء البند؟
                        </label>
                        <div className="grid grid-cols-5 gap-1">
                          {[
                            { label: "في موعده", val: 0 },
                            { label: "يوم واحد", val: 1 },
                            { label: "يومان", val: 2 },
                            { label: "3 أيام", val: 3 },
                            { label: "5 أيام+", val: 5 },
                          ].map((opt) => (
                            <button
                              key={opt.val}
                              type="button"
                              onClick={() => updateAnswer(currentItem.task.id, { remainingDays: opt.val })}
                              className={`rounded-lg border py-0.5 text-xs font-bold transition-all cursor-pointer ${
                                (currentAnswer?.remainingDays ?? 0) === opt.val
                                  ? "border-emerald-700 bg-emerald-700 text-white shadow-xs"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {!currentAnswer?.markCompleted && (
                      <div>
                        <label className="block text-[11px] font-bold text-emerald-950 mb-0.5 flex items-center justify-between">
                          <span>عدد العمالة بالموقع اليوم (اختياري):</span>
                          {currentAnswer?.workersCount ? (
                            <span className="text-[11px] font-bold text-emerald-700">
                              {currentAnswer.workersCount}{" "}
                              {currentAnswer.workersCount === 1
                                ? "عامل"
                                : currentAnswer.workersCount === 2
                                ? "عاملان"
                                : "عمال"}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-normal">لم يُحدد</span>
                          )}
                        </label>
                        <div className="grid grid-cols-6 gap-1">
                          {[
                            { label: "1", val: 1 },
                            { label: "2", val: 2 },
                            { label: "3", val: 3 },
                            { label: "4", val: 4 },
                            { label: "5", val: 5 },
                            { label: "6+", val: 6 },
                          ].map((w) => (
                            <button
                              key={w.val}
                              type="button"
                              onClick={() =>
                                updateAnswer(currentItem.task.id, {
                                  workersCount: currentAnswer?.workersCount === w.val ? undefined : w.val,
                                })
                              }
                              className={`rounded-lg border py-0.5 text-xs font-bold transition-all cursor-pointer ${
                                currentAnswer?.workersCount === w.val
                                  ? "border-emerald-700 bg-emerald-700 text-white shadow-2xs"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300"
                              }`}
                            >
                              {w.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <input
                        type="text"
                        value={currentAnswer?.note ?? ""}
                        onChange={(e) => updateAnswer(currentItem.task.id, { note: e.target.value })}
                        placeholder="ملاحظة سريعة من الموقع (اختياري)..."
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  /* Case B: Did Not Work */
                  <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/30 p-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-amber-950 mb-0.5">
                        سبب التوقف أو عدم البدء:
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {DELAY_REASONS.map((reason) => (
                          <button
                            key={reason}
                            type="button"
                            onClick={() => updateAnswer(currentItem.task.id, { delayReason: reason })}
                            className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold transition-all cursor-pointer ${
                              currentAnswer?.delayReason === reason
                                ? "border-amber-600 bg-amber-600 text-white shadow-xs"
                                : "border-amber-200 bg-white text-amber-900 hover:border-amber-400"
                            }`}
                          >
                            {reason}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-amber-950 mb-0.5">
                        الإجراء لموعد البدء:
                      </label>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { label: "إبقاء الموعد ومتابعة المقاول", val: "keep" },
                          { label: "تأجيل البدء للغد", val: "tomorrow" },
                          { label: "تأجيل للأسبوع القادم", val: "next_week" },
                        ].map((act) => (
                          <button
                            key={act.val}
                            type="button"
                            onClick={() => updateAnswer(currentItem.task.id, { postponeAction: act.val as any })}
                            className={`rounded-lg border py-0.5 text-[11px] font-bold transition-all cursor-pointer ${
                              (currentAnswer?.postponeAction ?? "keep") === act.val
                                ? "border-amber-700 bg-amber-700 text-white shadow-xs"
                                : "border-slate-200 bg-white text-slate-700 hover:border-amber-300"
                            }`}
                          >
                            {act.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        value={currentAnswer?.note ?? ""}
                        onChange={(e) => updateAnswer(currentItem.task.id, { note: e.target.value })}
                        placeholder="تفاصيل العطل أو سبب عدم البدء (اختياري)..."
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                  <span>{currentIndex === 0 ? "اختيار تخصص آخر" : "السابق"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs cursor-pointer transition-colors"
                >
                  <span>{currentIndex === activeTasks.length - 1 ? "إنهاء مراجعة هذا التخصص" : "البند التالي"}</span>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 3: SECTION COMPLETION - ZERO SCROLL */}
        {/* ========================================================================= */}
        {selectedBoardId && isSectionComplete && !isSummaryView && (
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center overflow-hidden">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 mb-3 shadow-inner">
              <CheckCircle className="h-8 w-8" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 mb-1">
              أحسنت! تم تسجيل متابعة «{selectedBoardName}»
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mb-6">
              تم تسجيل ردودك لجميع مهام هذا التخصص اليوم. هل تريد مراجعة تخصص آخر أم اعتماد تقرير اليومية بالكامل؟
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full max-w-md">
              <button
                type="button"
                onClick={() => {
                  setSelectedBoardId(null);
                  setIsSectionComplete(false);
                }}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-emerald-600 bg-white px-4 py-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 cursor-pointer transition-all shadow-xs"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                <span>متابعة تخصص آخر (ليساة، كهرباء...)</span>
              </button>

              <button
                type="button"
                onClick={handleApplyAll}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs cursor-pointer transition-all disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>اعتماد وحفظ اليومية بالكامل</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUMMARY SCREEN - CLEAN, ZERO SCROLL OR SCROLLABLE ONLY ON DEMAND */}
        {/* ========================================================================= */}
        {isSummaryView && (
          <div className="flex-1 p-5 flex flex-col justify-between overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-1">
              <div className="mb-3 rounded-xl bg-emerald-700 p-3 text-white">
                <div className="flex items-center gap-1.5 font-bold text-xs mb-0.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>ملخص يومية الموقع الجاهز للاعتماد</span>
                </div>
                <p className="text-[11px] text-emerald-100">
                  مراجعة سريعة لما تم تسجيله لليوم قبل الحفظ النهائي:
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5 text-center">
                  <div className="text-xl font-bold text-emerald-700">{summaryStats.worked}</div>
                  <div className="text-[10px] font-bold text-emerald-900 mt-0.5">بنود تم العمل بها</div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-center">
                  <div className="text-xl font-bold text-amber-700">{summaryStats.stopped}</div>
                  <div className="text-[10px] font-bold text-amber-900 mt-0.5">بنود متوقفة أو مؤجلة</div>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-2.5 text-center">
                  <div className="text-xl font-bold text-blue-700">{summaryStats.completed}</div>
                  <div className="text-[10px] font-bold text-blue-900 mt-0.5">بنود اكتملت 100%</div>
                </div>
              </div>

              <div className="space-y-1.5">
                <h4 className="text-[11px] font-bold text-slate-500 mb-1">تفاصيل البنود المسجلة:</h4>
                {dailyTasks.map((item) => {
                  const ans = answers.get(item.task.id);
                  return (
                    <div
                      key={item.task.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2 text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900 text-[11px]">{item.task.title}</div>
                        <div className="text-[10px] text-slate-500">
                          تخصص: {item.boardName} ·{" "}
                          {ans?.didWork
                            ? `تم العمل (إنجاز: ${ans.progressPercent ?? 0}%)`
                            : `متوقف (السبب: ${ans?.delayReason ?? "غير محدد"})`}
                        </div>
                      </div>

                      <span
                        className={`rounded px-2 py-0.2 text-[10px] font-bold ${
                          ans?.didWork ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {ans?.didWork ? "اشتغل" : "متوقف"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsSummaryView(false)}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
                <span>الرجوع للمتابعة</span>
              </button>

              <button
                type="button"
                onClick={handleApplyAll}
                disabled={submitting}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>جاري التحديث والحفظ...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>اعتماد وتحديث اللوحة وحفظ التقرير</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
