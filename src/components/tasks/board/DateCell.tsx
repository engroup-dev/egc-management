import { useRef, useState } from "react";
import { Calendar, CheckCircle2 } from "lucide-react";
import CalendarPopover from "./CalendarPopover";
import DayOffsetPopover from "./DayOffsetPopover";
import { useTemplateMode } from "../TemplateModeContext";
import { dateToDayOffset, dayOffsetLabel } from "./templateDates";
import Tooltip from "../../ui/Tooltip";
import { completionTiming, formatSlashDate } from "./taskDates";
import type { StatusRow } from "../../../hooks/tasks/useTaskBoard";

// Relative badge, red if overdue, amber if due soon — clickup-task-ui
// skill's "Date cell" rule. `isOverdue` comes from tasks.is_overdue
// (maintained by the recompute_overdue_flags cron job, build plan §5.6)
// rather than being recomputed here. The exact date shows on hover via
// Tooltip (not title="", which waits out the browser's hover delay).
function relativeLabel(dueDate: string): string {
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return "اليوم";
  if (diffDays === 1) return "غداً";
  if (diffDays === -1) return "أمس";
  if (diffDays > 1) return `خلال ${diffDays} يوم`;
  return `متأخر ${Math.abs(diffDays)} يوم`;
}

// Arabic day count for the tooltip: يوم / يومين / 3 أيام / 12 يوماً.
function daysPhrase(n: number): string {
  if (n === 1) return "يوم";
  if (n === 2) return "يومين";
  return n <= 10 ? `${n} أيام` : `${n} يوماً`;
}

// A finished task is judged against its due date, not against today — the
// "late N days" counter above keeps growing forever for a task that was
// done on time months ago.
function completedBadge(dueDate: string, completedAt: string) {
  const timing = completionTiming(completedAt, dueDate);
  if (!timing) return null;
  const exact = `الاستحقاق ${formatSlashDate(dueDate)} · الإنجاز ${formatSlashDate(completedAt)}`;
  switch (timing.kind) {
    case "on_time":
      return { label: "في الموعد", tooltip: `${exact} · أُنجزت في الموعد`, className: "bg-emerald-50 text-emerald-600" };
    case "early":
      return {
        label: `مبكر ${timing.days} يوم`,
        tooltip: `${exact} · قبل الموعد بـ ${daysPhrase(timing.days)}`,
        className: "bg-emerald-50 text-emerald-600",
      };
    case "late":
      return {
        label: `متأخر ${timing.days} يوم`,
        tooltip: `${exact} · بعد الموعد بـ ${daysPhrase(timing.days)}`,
        className: "bg-orange-50 text-orange-600",
      };
  }
}

interface DateCellProps {
  dueDate: string | null;
  isOverdue: boolean;
  /** The task's status category and completion time. For a done task the
   * badge compares completion with the due date instead of counting from
   * today; for done-without-timestamp and closed it shows the plain date. */
  statusCategory?: StatusRow["category"];
  completedAt?: string | null;
  onChange: (date: string | null) => void;
  /** See StatusCell's align prop — "left" for narrow contexts near the
   * screen's left edge (the D3 detail panel). */
  align?: "left" | "right";
  /** Display only: the popover never opens (no edit rights). */
  readOnly?: boolean;
  /** The task's start: the due date can't be picked before it. Picking a
   * due date sets the task's working days (the server counts them). */
  minDate?: string | null;
  /** A parent with subtasks: its due date is its latest subtask's. */
  isSummary?: boolean;
}

export default function DateCell({
  dueDate,
  isOverdue,
  statusCategory,
  completedAt,
  onChange,
  align = "right",
  readOnly: readOnlyProp = false,
  minDate = null,
  isSummary = false,
}: DateCellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isTemplate = useTemplateMode();
  const readOnly = readOnlyProp || isSummary;

  const finished = statusCategory === "done" || statusCategory === "closed";
  const completed = statusCategory === "done" && dueDate && completedAt ? completedBadge(dueDate, completedAt) : null;

  const dueSoon = !finished && !!dueDate && !isOverdue && new Date(dueDate).getTime() - Date.now() < 2 * 86_400_000;

  // Template board: "Day N" instead of a calendar date (templateDates.ts).
  // Picking a Day sets the task's days (a summary spans its subtasks).
  if (isTemplate) {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => !readOnly && setOpen((v) => !v)}
          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${
            dueDate ? "bg-gray-50 font-medium text-gray-500" : "text-gray-300"
          } ${readOnly ? "cursor-default" : "hover:bg-gray-100"}`}
        >
          {dueDate ? dayOffsetLabel(dateToDayOffset(dueDate)) : "يوم —"}
        </button>
        {open && (
          <DayOffsetPopover
            value={dueDate}
            onChange={onChange}
            onClose={() => setOpen(false)}
            anchorRef={ref}
            align={align}
            minOffset={minDate ? dateToDayOffset(minDate) : null}
            allowClear={false}
          />
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      {dueDate && completed ? (
        <Tooltip label={completed.tooltip}>
          <button
            onClick={() => !readOnly && setOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-bold border border-emerald-200/80 ${completed.className}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            {completed.label}
          </button>
        </Tooltip>
      ) : dueDate && finished ? (
        <Tooltip label={formatSlashDate(dueDate)}>
          <button
            onClick={() => !readOnly && setOpen((v) => !v)}
            className="whitespace-nowrap rounded-lg bg-slate-100 border border-slate-200/70 px-3 py-1.5 text-[13px] font-bold text-slate-600"
          >
            {formatSlashDate(dueDate)}
          </button>
        </Tooltip>
      ) : dueDate ? (
        <Tooltip label={formatSlashDate(dueDate)}>
          <button
            onClick={() => !readOnly && setOpen((v) => !v)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-bold border ${
              isOverdue
                ? "bg-rose-50 text-rose-700 border-rose-300"
                : dueSoon
                  ? "bg-amber-50 text-amber-700 border-amber-300"
                  : "bg-slate-100 text-slate-700 border-slate-200"
            }`}
          >
            {relativeLabel(dueDate)}
          </button>
        </Tooltip>
      ) : (
        <button
          onClick={() => !readOnly && setOpen((v) => !v)}
          className={`rounded-full p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-400 ${readOnly ? "hidden" : ""}`}
          title="تحديد تاريخ الاستحقاق"
        >
          <Calendar className="h-3.5 w-3.5" />
        </button>
      )}

      {open && (
        <CalendarPopover
          value={dueDate}
          onChange={onChange}
          onClose={() => setOpen(false)}
          anchorRef={ref}
          align={align}
          minDate={minDate}
          allowClear={false}
        />
      )}
    </div>
  );
}
