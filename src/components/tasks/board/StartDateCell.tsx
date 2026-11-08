import { useRef, useState } from "react";
import { CalendarDays, Link2 } from "lucide-react";
import CalendarPopover from "./CalendarPopover";
import DayOffsetPopover from "./DayOffsetPopover";
import { useTemplateMode } from "../TemplateModeContext";
import { dateToDayOffset, dayOffsetLabel } from "./templateDates";
import Tooltip from "../../ui/Tooltip";
import { formatSlashDate } from "./taskDates";

// Same popover as DateCell (due date), but no overdue/soon coloring —
// a start date is neutral, there's no "late" concept for it. The pill
// shows days-since-start (DateCell's relativeLabel, mirrored for a start
// date instead of a due date) with the exact date on hover via Tooltip
// (not a title="", which waits out the browser's hover delay — see
// Tooltip.tsx), rather than the date itself — parsed via the Date
// constructor, not a manual "YYYY-MM-DD".split("-"), since a timestamptz
// column can hand back a full "...T00:00:00+00:00" string that split()
// can't read as a plain date (that used to produce NaN → "Invalid Date").
function daysPassedLabel(startDate: string): string {
  const start = new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - start.getTime()) / 86_400_000);

  if (diffDays === 0) return "اليوم";
  if (diffDays === 1) return "أمس";
  if (diffDays === -1) return "غداً";
  if (diffDays > 1) return `منذ ${diffDays} يوم`;
  return `يبدأ خلال ${Math.abs(diffDays)} يوم`;
}

interface StartDateCellProps {
  startDate: string | null;
  onChange: (date: string | null) => void;
  /** See StatusCell's align prop — "left" for narrow contexts near the
   * screen's left edge (the D3 detail panel). */
  align?: "left" | "right";
  /** Display only: the popover never opens (no edit rights). */
  readOnly?: boolean;
  /** tasks.earliest_start: set when the task is linked after others. Its
   * start is then computed (predecessors' end + wait gap), and picking a
   * date only changes the wait gap — never earlier than this. */
  earliestStart?: string | null;
  /** tasks.start_lag_days — the wait gap of a linked task. */
  lagDays?: number;
  /** A parent with subtasks: its start is its earliest subtask's. */
  isSummary?: boolean;
  /** Linked task with a wait gap: offer to remove it. */
  onClearLag?: () => void;
}

export default function StartDateCell({
  startDate,
  onChange,
  align = "right",
  readOnly = false,
  earliestStart = null,
  lagDays = 0,
  isSummary = false,
  onClearLag,
}: StartDateCellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isTemplate = useTemplateMode();
  const linked = !!earliestStart;
  const locked = readOnly || isSummary;

  // Template board: "Day N" instead of a calendar date (templateDates.ts),
  // with the same links, wait gap and summary rules as a normal board.
  if (isTemplate) {
    const tip = isSummary
      ? "محسوب من المهام الفرعية"
      : linked
        ? `تبدأ بعد انتهاء المهام السابقة${lagDays > 0 ? ` + انتظار ${lagDays} يوم` : ""}`
        : "";
    const pill = startDate ? (
      <button
        onClick={() => !locked && setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500 ${
          locked ? "cursor-default" : "hover:bg-gray-100"
        }`}
      >
        {linked && !isSummary && <Link2 className="h-3 w-3 shrink-0 text-primary" />}
        {dayOffsetLabel(dateToDayOffset(startDate))}
        {linked && lagDays > 0 && <span className="text-[10px] font-semibold text-amber-600">+{lagDays}</span>}
      </button>
    ) : readOnly ? (
      <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] text-gray-300">غير مجدولة</span>
    ) : (
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-gray-200 px-2 py-0.5 text-[11px] text-gray-400 hover:border-gray-300 hover:text-gray-500"
        title="المهمة غير مجدولة — اختر يوم البدء"
      >
        <CalendarDays className="h-3 w-3" />
        غير مجدولة
      </button>
    );
    return (
      <div ref={ref} className="relative">
        {tip ? <Tooltip label={tip}>{pill}</Tooltip> : pill}
        {open && (
          <DayOffsetPopover
            value={startDate}
            onChange={onChange}
            onClose={() => setOpen(false)}
            anchorRef={ref}
            align={align}
            minOffset={earliestStart ? dateToDayOffset(earliestStart) : null}
            allowClear={false}
            extraAction={linked && lagDays > 0 && onClearLag ? { label: "إلغاء الانتظار", onClick: onClearLag } : undefined}
          />
        )}
      </div>
    );
  }

  const tooltip = !startDate
    ? ""
    : isSummary
      ? `${formatSlashDate(startDate)} · محسوب من المهام الفرعية`
      : linked
        ? `${formatSlashDate(startDate)} · تبدأ بعد انتهاء المهام السابقة${lagDays > 0 ? ` + انتظار ${lagDays} يوم عمل` : ""}`
        : formatSlashDate(startDate);

  return (
    <div ref={ref} className="relative">
      {startDate ? (
        <Tooltip label={tooltip}>
          <button
            onClick={() => !locked && setOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-100 border border-slate-200/80 px-3 py-1.5 text-[13px] font-bold text-slate-700 ${
              locked ? "cursor-default" : "hover:bg-slate-200"
            }`}
          >
            {linked && !isSummary && <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />}
            {daysPassedLabel(startDate)}
            {linked && lagDays > 0 && <span className="text-[10px] font-bold text-amber-600">+{lagDays}</span>}
          </button>
        </Tooltip>
      ) : readOnly ? (
        <span className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] text-slate-400 font-medium">غير محددة</span>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-[13px] font-bold text-slate-500 hover:border-slate-400 hover:text-slate-700"
          title="المهمة غير مجدولة — اختر تاريخ البدء"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          غير مجدولة
        </button>
      )}

      {open && (
        <CalendarPopover
          value={startDate}
          onChange={onChange}
          onClose={() => setOpen(false)}
          anchorRef={ref}
          align={align}
          minDate={earliestStart}
          allowClear={false}
          extraAction={linked && lagDays > 0 && onClearLag ? { label: "إلغاء الانتظار", onClick: onClearLag } : undefined}
        />
      )}
    </div>
  );
}
