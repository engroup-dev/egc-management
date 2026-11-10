import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FastForward,
  Filter,
  Layers,
  MapPin,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  X,
} from "lucide-react";
import type { TaskDirectoryData } from "../../../hooks/tasks/useTaskDirectory";
import type { TaskRow } from "../../../hooks/tasks/useTaskBoard";
import {
  addWorkingDays,
  dayNumber,
  dayString,
  daysFromDue,
  dueFromDays,
  workingDayOnOrAfterString,
  workingDaysBetween,
  workingDaysLabel,
} from "../board/workingDays";
import { formatSlashDate } from "../board/taskDates";
import CalendarPopover from "../board/CalendarPopover";
import Tooltip from "../../ui/Tooltip";

interface MasterCleanDialogProps {
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

export interface CleanColumnSettings {
  index: boolean;
  status: boolean;
  startDate: boolean;
  duration: boolean;
  dueDate: boolean;
  timing: boolean;
  shift: boolean;
}

const STORAGE_KEY = "egc_master_clean_columns_v2";

const DEFAULT_SETTINGS: CleanColumnSettings = {
  index: true,
  status: false, // Hidden by default for max simplicity!
  startDate: true,
  duration: true,
  dueDate: true,
  timing: false, // Hidden by default for max simplicity!
  shift: true,
};

function loadSettings(): CleanColumnSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function categoryOf(task: TaskRow, data: TaskDirectoryData) {
  return data.statuses.find((s) => s.id === task.status_id)?.category ?? null;
}

export default function MasterCleanDialog({
  data,
  spaceName,
  spaceColor,
  onClose,
  onOpenTask,
  onChangeTaskDates,
}: MasterCleanDialogProps) {
  const [cols, setCols] = useState<CleanColumnSettings>(() => loadSettings());
  const [selectedBoardId, setSelectedBoardId] = useState<string | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "overdue" | "active" | "not_started" | "done">("all");
  const [search, setSearch] = useState("");
  const [activeDatePopover, setActiveDatePopover] = useState<{
    taskId: string;
    type: "start" | "due";
    currentDate: string | null;
  } | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);

  // Shift delay popover state
  const [shiftTargetTask, setShiftTargetTask] = useState<TaskRow | null>(null);
  const [shiftDaysCount, setShiftDaysCount] = useState(3);
  const [shiftSubsequent, setShiftSubsequent] = useState(true);
  const [shiftSuccessNotice, setShiftSuccessNotice] = useState<string | null>(null);

  // Toggle column and save to localStorage
  const toggleCol = (key: keyof CleanColumnSettings) => {
    setCols((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Preset: ultra minimal mode (just task + start + duration)
  const setMinimalMode = () => {
    const minimal: CleanColumnSettings = {
      index: true,
      status: false,
      startDate: true,
      duration: true,
      dueDate: false,
      timing: false,
      shift: false,
    };
    setCols(minimal);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
    } catch {}
  };

  // Preset: standard mode (start + duration + due + shift)
  const setStandardMode = () => {
    const standard: CleanColumnSettings = {
      index: true,
      status: false,
      startDate: true,
      duration: true,
      dueDate: true,
      timing: false,
      shift: true,
    };
    setCols(standard);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(standard));
    } catch {}
  };

  // Preset: full mode
  const setFullMode = () => {
    const full: CleanColumnSettings = {
      index: true,
      status: true,
      startDate: true,
      duration: true,
      dueDate: true,
      timing: true,
      shift: true,
    };
    setCols(full);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
    } catch {}
  };

  // Keyboard navigation & escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (shiftTargetTask) {
          setShiftTargetTask(null);
        } else if (activeDatePopover) {
          setActiveDatePopover(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, shiftTargetTask, activeDatePopover]);

  // Boards list
  const boardsList = useMemo(() => {
    return Array.from(data.boardNamesById.entries())
      .map(([id, name]) => ({
        id,
        name,
        order: data.boardOrderById.get(id) ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ar"));
  }, [data.boardNamesById, data.boardOrderById]);

  // Local optimistic duration overrides for instant zero-lag feedback
  const [durationOverrides, setDurationOverrides] = useState<Map<string, number>>(new Map());

  // Tasks filtered and sorted chronologically
  const filteredTasks = useMemo(() => {
    return data.tasks.filter((t) => {
      // 1. Board filter
      if (selectedBoardId !== "all" && t.board_id !== selectedBoardId) return false;

      // 2. Status filter
      const category = categoryOf(t, data);
      if (statusFilter === "overdue" && !t.is_overdue) return false;
      if (statusFilter === "active" && category !== "active") return false;
      if (statusFilter === "not_started" && category !== "not_started") return false;
      if (statusFilter === "done" && category !== "done") return false;

      // 3. Search query
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const titleMatch = t.title.toLowerCase().includes(q);
        const boardName = data.boardNamesById.get(t.board_id)?.toLowerCase() ?? "";
        if (!titleMatch && !boardName.includes(q)) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort: scheduled tasks by start date ascending, unscheduled last
      if (a.start_date && b.start_date) return a.start_date.localeCompare(b.start_date);
      if (a.start_date && !b.start_date) return -1;
      if (!a.start_date && b.start_date) return 1;
      return a.title.localeCompare(b.title, "ar");
    });
  }, [data, selectedBoardId, statusFilter, search]);

  // Dynamic stats & Total duration calculated strictly from the currently displayed / filtered tasks
  const { totalDurationDays, stats } = useMemo(() => {
    let overdue = 0;
    let active = 0;
    let notStarted = 0;
    let totalDays = 0;

    for (const t of filteredTasks) {
      if (t.is_overdue) overdue++;
      const cat = categoryOf(t, data);
      if (cat === "active") active++;
      if (cat === "not_started") notStarted++;
      // Exclude summary parent tasks to avoid double counting duration
      if (!t.is_summary) {
        const days = durationOverrides.get(t.id) ?? t.duration_days ?? 0;
        totalDays += days;
      }
    }

    return {
      totalDurationDays: totalDays,
      stats: { total: filteredTasks.length, overdue, active, notStarted },
    };
  }, [filteredTasks, durationOverrides, data]);

  // Direct duration adjustment (+ / -)
  const handleDurationDelta = (task: TaskRow, delta: number) => {
    const current = durationOverrides.get(task.id) ?? task.duration_days ?? 1;
    const next = Math.max(1, current + delta);
    if (next === current) return;
    setDurationOverrides((prev) => new Map(prev).set(task.id, next));
    onChangeTaskDates(task.id, { durationDays: next });
  };

  // Direct duration input change
  const handleDurationChange = (task: TaskRow, val: string) => {
    const num = parseInt(val, 10);
    if (Number.isNaN(num) || num < 1) return;
    setDurationOverrides((prev) => new Map(prev).set(task.id, num));
    onChangeTaskDates(task.id, { durationDays: num });
  };

  // Date selection from CalendarPopover
  const handleDatePicked = (pickedDate: string | null) => {
    if (!activeDatePopover) return;
    const { taskId, type } = activeDatePopover;
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (type === "start") {
      onChangeTaskDates(taskId, { startDate: pickedDate });
    } else {
      onChangeTaskDates(taskId, { dueDate: pickedDate });
    }
    setActiveDatePopover(null);
  };

  // Execute Cascading Shift
  const handleExecuteShift = () => {
    if (!shiftTargetTask || shiftDaysCount <= 0) return;

    const baseStart = shiftTargetTask.start_date;
    const targetBoardId = shiftTargetTask.board_id;
    const boardName = data.boardNamesById.get(targetBoardId) ?? "المنطقة";

    let movedCount = 0;

    if (shiftSubsequent && baseStart) {
      // Find all subsequent open tasks on the same board
      const affected = data.tasks.filter((t) => {
        if (t.board_id !== targetBoardId) return false;
        if (categoryOf(t, data) === "done") return false;
        if (!t.start_date) return false;
        return t.start_date >= baseStart;
      });

      for (const t of affected) {
        if (!t.start_date) continue;
        const newStart = dayString(addWorkingDays(dayNumber(t.start_date), shiftDaysCount + 1));
        const days = t.duration_days ?? 1;
        const newDue = dueFromDays(newStart, days);
        onChangeTaskDates(t.id, { startDate: newStart, dueDate: newDue });
        movedCount++;
      }
    } else {
      // Shift this task only
      const currentStart = shiftTargetTask.start_date;
      if (currentStart) {
        const newStart = dayString(addWorkingDays(dayNumber(currentStart), shiftDaysCount + 1));
        const days = shiftTargetTask.duration_days ?? 1;
        const newDue = dueFromDays(newStart, days);
        onChangeTaskDates(shiftTargetTask.id, { startDate: newStart, dueDate: newDue });
        movedCount = 1;
      }
    }

    setShiftSuccessNotice(`تم ترحيل ${movedCount} مهمة بمقدار ${shiftDaysCount} أيام عمل في ${boardName} بنجاح ✓`);
    setShiftTargetTask(null);
    setTimeout(() => setShiftSuccessNotice(null), 4000);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-3 md:p-6 backdrop-blur-2xs"
      dir="rtl"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-gray-100">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 shadow-xs">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">الجدول التنفيذي الصافي · Master Clean</h2>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{
                    background: spaceColor ? `${spaceColor}15` : "#F3E8FF",
                    color: spaceColor ?? "#7C3AED",
                  }}
                >
                  {spaceName}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                جدول نظيف وبسيط يمنحك التحكم الكامل في التواريخ والمدد واختيار الأعمدة التي تناسبك
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition cursor-pointer"
              aria-label="إغلاق"
              title="إغلاق (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Filter & Control Bar */}
        <div className="border-b border-gray-200 bg-gray-50/80 px-6 py-3 space-y-3">
          {/* Row 1: Zone pills & Search */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 px-1 text-xs font-bold text-gray-500">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                <span>المنطقة:</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedBoardId("all")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                  selectedBoardId === "all"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span>كل المناطق</span>
                <span className="rounded-full bg-black/15 px-1.5 py-0.2 text-[10px] font-bold">
                  {data.tasks.length}
                </span>
              </button>
              {boardsList.map((b) => {
                const count = data.tasks.filter((t) => t.board_id === b.id).length;
                const active = selectedBoardId === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBoardId(active ? "all" : b.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      active
                        ? "bg-primary text-white shadow-xs"
                        : "bg-white border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-100"
                    }`}
                  >
                    <span>{b.name}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Quick Search */}
            <div className="relative w-64">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="بحث في البنود والمهام..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white pr-9 pl-3 py-1.5 text-xs text-gray-800 focus:border-primary focus:outline-hidden"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute left-2.5 top-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Status Subfilters & KPI counters */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-gray-500 ml-1">الحالة:</span>
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                  statusFilter === "all" ? "bg-purple-600 text-white" : "bg-white border border-gray-200 text-gray-600"
                }`}
              >
                الكل ({data.tasks.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("overdue")}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                  statusFilter === "overdue"
                    ? "bg-rose-600 text-white"
                    : "bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100"
                }`}
              >
                المتأخرة ⚠️ ({stats.overdue})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                  statusFilter === "active"
                    ? "bg-purple-600 text-white"
                    : "bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100"
                }`}
              >
                قيد التنفيذ ({stats.active})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("not_started")}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                  statusFilter === "not_started"
                    ? "bg-slate-700 text-white"
                    : "bg-white border border-gray-200 text-gray-600"
                }`}
              >
                لم تبدأ ({stats.notStarted})
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50/80 border border-blue-200 px-3 py-1 font-bold text-blue-900 shadow-2xs">
                <Clock className="h-4 w-4 text-blue-600" />
                <span>إجمالي المدة المجدولة:</span>
                <span className="text-sm font-black text-blue-950">{totalDurationDays} يوم عمل</span>
              </span>
              <span className="text-gray-400">·</span>
              <span className="font-semibold text-gray-500">المعروض: {filteredTasks.length} بند</span>
            </div>
          </div>

          {/* Row 3: Custom Column Chooser (التحكم في الأعمدة المعروضة) */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-200/60">
            <span className="flex items-center gap-1 text-xs font-bold text-gray-600 ml-1">
              <Sliders className="h-3.5 w-3.5 text-purple-600" />
              <span>تخصيص الأعمدة:</span>
            </span>

            <button
              type="button"
              onClick={() => toggleCol("status")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer border ${
                cols.status
                  ? "bg-purple-50 border-purple-300 text-purple-700"
                  : "bg-white border-gray-200 text-gray-400 hover:text-gray-600"
              }`}
            >
              <span>{cols.status ? "✓" : "+"}</span>
              <span>الحالة</span>
            </button>

            <button
              type="button"
              onClick={() => toggleCol("startDate")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer border ${
                cols.startDate
                  ? "bg-purple-50 border-purple-300 text-purple-700"
                  : "bg-white border-gray-200 text-gray-400 hover:text-gray-600"
              }`}
            >
              <span>{cols.startDate ? "✓" : "+"}</span>
              <span>تاريخ البدء</span>
            </button>

            <button
              type="button"
              onClick={() => toggleCol("duration")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer border ${
                cols.duration
                  ? "bg-purple-50 border-purple-300 text-purple-700"
                  : "bg-white border-gray-200 text-gray-400 hover:text-gray-600"
              }`}
            >
              <span>{cols.duration ? "✓" : "+"}</span>
              <span>المدة (أيام)</span>
            </button>

            <button
              type="button"
              onClick={() => toggleCol("dueDate")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer border ${
                cols.dueDate
                  ? "bg-purple-50 border-purple-300 text-purple-700"
                  : "bg-white border-gray-200 text-gray-400 hover:text-gray-600"
              }`}
            >
              <span>{cols.dueDate ? "✓" : "+"}</span>
              <span>تاريخ الانتهاء</span>
            </button>

            <button
              type="button"
              onClick={() => toggleCol("timing")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer border ${
                cols.timing
                  ? "bg-purple-50 border-purple-300 text-purple-700"
                  : "bg-white border-gray-200 text-gray-400 hover:text-gray-600"
              }`}
            >
              <span>{cols.timing ? "✓" : "+"}</span>
              <span>الموقف الزمني</span>
            </button>

            <button
              type="button"
              onClick={() => toggleCol("shift")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer border ${
                cols.shift
                  ? "bg-purple-50 border-purple-300 text-purple-700"
                  : "bg-white border-gray-200 text-gray-400 hover:text-gray-600"
              }`}
            >
              <span>{cols.shift ? "✓" : "+"}</span>
              <span>أداة الترحيل</span>
            </button>

            {/* Quick preset switches */}
            <div className="mr-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={setMinimalMode}
                className="text-[11px] font-bold text-purple-700 bg-purple-100/70 hover:bg-purple-200 px-2.5 py-1 rounded-lg transition cursor-pointer shadow-2xs"
                title="عرض فقط البند + تاريخ البدء + المدة"
              >
                الوضع فائق البساطة 🎯
              </button>
              <button
                type="button"
                onClick={setStandardMode}
                className="text-[11px] font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                title="عرض البند + البدء + المدة + الانتهاء + الترحيل"
              >
                الوضع القياسي
              </button>
              <button
                type="button"
                onClick={setFullMode}
                className="text-[11px] font-bold text-gray-600 hover:text-gray-900 px-2 py-1 transition cursor-pointer"
                title="عرض كل الأعمدة"
              >
                عرض الكل 📋
              </button>
            </div>
          </div>
        </div>

        {/* Success Notice Banner */}
        {shiftSuccessNotice && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 text-xs font-bold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{shiftSuccessNotice}</span>
          </div>
        )}

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-gray-400">
              <CalendarDays className="h-12 w-12 text-gray-300 stroke-[1.5]" />
              <p className="text-base font-bold text-gray-600">لا توجد بنود مطابقة لهذا الفلتر</p>
              <p className="text-xs text-gray-400">جرّب تغيير المنطقة أو مسح البحث</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xs">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/90 text-[12px] font-bold text-gray-600 select-none">
                    {cols.index && <th className="py-3 px-3 w-12 text-center">#</th>}
                    <th className="py-3 px-4 min-w-[280px]">البند / المهمة والمنطقة</th>
                    {cols.status && <th className="py-3 px-3 w-28 text-center">الحالة</th>}
                    {cols.startDate && <th className="py-3 px-3 w-36 text-center">تاريخ البدء</th>}
                    {cols.duration && <th className="py-3 px-3 w-36 text-center">المدة (أيام عمل)</th>}
                    {cols.dueDate && <th className="py-3 px-3 w-36 text-center">تاريخ الانتهاء</th>}
                    {cols.timing && <th className="py-3 px-3 w-32 text-center">الموقف الزمني</th>}
                    {cols.shift && <th className="py-3 px-3 w-32 text-center">ترحيل ذكي ⚡</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTasks.map((task, idx) => {
                    const boardName = data.boardNamesById.get(task.board_id) ?? "منطقة";
                    const statusObj = data.statuses.find((s) => s.id === task.status_id);
                    const category = statusObj?.category ?? "not_started";
                    const isDone = category === "done";
                    const days = durationOverrides.get(task.id) ?? task.duration_days ?? 1;

                    return (
                      <tr
                        key={task.id}
                        className={`hover:bg-purple-50/20 transition-colors ${
                          task.is_overdue ? "bg-rose-50/20" : ""
                        }`}
                      >
                        {/* Index */}
                        {cols.index && (
                          <td className="py-3 px-3 text-center text-gray-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                        )}

                        {/* Title & Zone */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => onOpenTask(task.id)}
                              className="text-right text-[15px] font-bold text-gray-900 hover:text-primary transition-colors cursor-pointer truncate max-w-lg leading-relaxed"
                              title={task.title}
                            >
                              {task.title}
                            </button>
                            <div className="flex items-center gap-1 text-[11px] text-gray-400">
                              <Layers className="h-3 w-3" />
                              <span>{boardName}</span>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        {cols.status && (
                          <td className="py-3 px-3 text-center">
                            <span
                              className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold"
                              style={{
                                background: statusObj?.color ? `${statusObj.color}18` : "#F3F4F6",
                                color: statusObj?.color ?? "#4B5563",
                              }}
                            >
                              {statusObj?.name ?? "لم يبدأ"}
                            </span>
                          </td>
                        )}

                        {/* Start Date Cell */}
                        {cols.startDate && (
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                setPopoverAnchor(e.currentTarget);
                                setActiveDatePopover({
                                  taskId: task.id,
                                  type: "start",
                                  currentDate: task.start_date,
                                });
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-700 hover:border-primary hover:bg-purple-50/30 transition cursor-pointer"
                            >
                              <Calendar className="h-3 w-3 text-gray-400" />
                              <span>{task.start_date ? formatSlashDate(task.start_date) : "غير مجدولة"}</span>
                            </button>
                          </td>
                        )}

                        {/* Duration (working days) with + / - buttons */}
                        {cols.duration && (
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
                              <button
                                type="button"
                                onClick={() => handleDurationDelta(task, -1)}
                                disabled={days <= 1}
                                className="h-6 w-6 flex items-center justify-center rounded-md bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition cursor-pointer"
                                title="تقليل المدة يوم"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <input
                                type="number"
                                min={1}
                                value={days}
                                onChange={(e) => handleDurationChange(task, e.target.value)}
                                className="w-10 text-center text-xs font-bold text-gray-800 bg-transparent border-0 focus:outline-hidden"
                              />
                              <button
                                type="button"
                                onClick={() => handleDurationDelta(task, 1)}
                                className="h-6 w-6 flex items-center justify-center rounded-md bg-white text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                                title="زيادة المدة يوم"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        )}

                        {/* Due Date Cell */}
                        {cols.dueDate && (
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                setPopoverAnchor(e.currentTarget);
                                setActiveDatePopover({
                                  taskId: task.id,
                                  type: "due",
                                  currentDate: task.due_date,
                                });
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-700 hover:border-primary hover:bg-purple-50/30 transition cursor-pointer"
                            >
                              <Calendar className="h-3 w-3 text-gray-400" />
                              <span>{task.due_date ? formatSlashDate(task.due_date) : "غير محدد"}</span>
                            </button>
                          </td>
                        )}

                        {/* Time indicator badge */}
                        {cols.timing && (
                          <td className="py-3 px-3 text-center">
                            {isDone ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-bold">
                                <Check className="h-3 w-3" />
                                <span>منجزة</span>
                              </span>
                            ) : task.is_overdue ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 px-2 py-0.5 text-[10px] font-bold animate-pulse">
                                <span>متأخرة ⚠️</span>
                              </span>
                            ) : task.start_date ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold">
                                <span>سارية</span>
                              </span>
                            ) : (
                              <span className="text-gray-400 text-[10px]">غير مجدولة</span>
                            )}
                          </td>
                        )}

                        {/* Cascading Delay Shift Tool */}
                        {cols.shift && (
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setShiftTargetTask(task);
                                setShiftDaysCount(3);
                                setShiftSubsequent(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 px-2.5 py-1 text-xs font-bold hover:bg-purple-100 transition shadow-2xs cursor-pointer"
                              title="ترحيل تأخير هذه المهمة والمهام التابعة"
                            >
                              <FastForward className="h-3 w-3" />
                              <span>ترحيل</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal: Cascading Shift Dialog */}
        {shiftTargetTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-100 text-right animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
                    <FastForward className="h-4 w-4" />
                  </span>
                  <h3 className="font-bold text-gray-900 text-base">ترحيل موعد البند والجدول</h3>
                </div>
                <button
                  onClick={() => setShiftTargetTask(null)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="py-4 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">البند المستهدف:</label>
                  <p className="text-sm font-bold text-gray-900 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                    {shiftTargetTask.title}
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-2">مقدار التأخير المطلوب ترحيله:</label>
                  <div className="flex items-center gap-2 mb-2">
                    {[1, 2, 3, 5, 7].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setShiftDaysCount(d)}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition cursor-pointer ${
                          shiftDaysCount === d
                            ? "bg-purple-600 text-white shadow-xs"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        +{d} {d === 1 ? "يوم" : d === 2 ? "يومين" : "أيام"}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">أو حدد أيام مخصصة:</span>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={shiftDaysCount}
                      onChange={(e) => setShiftDaysCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-20 rounded-lg border border-gray-200 p-1 text-center text-xs font-bold text-gray-800"
                    />
                    <span className="text-xs text-gray-500">يوم عمل</span>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-purple-100 bg-purple-50/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shiftSubsequent}
                      onChange={(e) => setShiftSubsequent(e.target.checked)}
                      className="mt-0.5 rounded text-purple-600 focus:ring-purple-500"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-gray-900 block">ترحيل تلقائي للمهام التالية في نفس المنطقة</span>
                      <span className="text-gray-500 text-[11px] block mt-0.5">
                        سيتم ترحيل مواعيد كل المهام المفتوحة اللاحقة للأمام بنفس عدد الأيام دون الحاجة لتعديلها يدوياً.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShiftTargetTask(null)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleExecuteShift}
                  className="rounded-xl bg-purple-600 px-5 py-2 text-xs font-bold text-white hover:bg-purple-700 shadow-sm transition cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>تأكيد الترحيل الآن</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Date Picker Popover */}
        {activeDatePopover && popoverAnchor && (
          <CalendarPopover
            value={activeDatePopover.currentDate}
            onChange={handleDatePicked}
            onClose={() => setActiveDatePopover(null)}
            anchorRef={{ current: popoverAnchor }}
            align="right"
            allowClear={true}
          />
        )}
      </div>
    </div>
  );
}
