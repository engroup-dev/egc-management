import { useEffect, useRef, useState } from "react";
import Tooltip from "../../ui/Tooltip";
import { useTemplateMode } from "../TemplateModeContext";
import { workingDaysLabel } from "./workingDays";

// "Days needed" — tasks.duration_days, the number of working days a task
// takes (Friday excluded). The due date is computed from it, so changing it
// moves the due date and every task linked after this one. Click to type a
// new number, Enter / leaving the field saves, Esc cancels. A summary (a
// parent with subtasks) spans its subtasks, so its days are read-only.
// On a template board every Day counts; they become working days (Friday
// skipped) when the template is applied from a start date.

interface DurationCellProps {
  days: number | null;
  onChange: (days: number) => void;
  readOnly?: boolean;
  isSummary?: boolean;
  /** Wider input, for the detail panel. */
  size?: "sm" | "md";
}

export default function DurationCell({ days, onChange, readOnly = false, isSummary = false, size = "sm" }: DurationCellProps) {
  const isTemplate = useTemplateMode();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = readOnly || isSummary;

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const n = Math.floor(Number(draft));
    if (!Number.isFinite(n) || n < 1 || n > 3650 || n === days) return;
    onChange(n);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={1}
        max={3650}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className={`${size === "md" ? "w-20" : "w-16"} rounded-lg border-2 border-primary px-2 py-1 text-center text-sm font-bold text-slate-900 outline-none shadow-xs`}
        dir="ltr"
      />
    );
  }

  const label = days ? `${days} يوم` : "—";
  const tooltip = !days
    ? locked ? "" : "عدد أيام العمل (انقر للتعديل)"
    : isSummary
      ? `${workingDaysLabel(days)} · من أول مهمة فرعية إلى آخرها`
      : isTemplate
        ? `${workingDaysLabel(days)} — الجمعة تُستثنى عند تطبيق القالب`
        : `${workingDaysLabel(days)} (بدون الجمعة) — انقر للتعديل`;

  const button = (
    <button
      onClick={() => {
        if (locked) return;
        setDraft(days ? String(days) : "1");
        setEditing(true);
      }}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg px-2.5 py-1 text-[13px] font-bold transition-all shadow-2xs ${
        days
          ? "border border-slate-200 bg-slate-50 text-slate-700 hover:border-primary/40 hover:bg-primary-superLight/20 hover:text-primary"
          : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
      } ${locked ? "cursor-default" : "cursor-pointer"} ${isSummary ? "italic font-semibold" : ""}`}
    >
      {label}
    </button>
  );

  return tooltip ? <Tooltip label={tooltip}>{button}</Tooltip> : button;
}
