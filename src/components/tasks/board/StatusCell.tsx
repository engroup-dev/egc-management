import { useRef, useState } from "react";
import AnchoredMenu from "./AnchoredMenu";
import type { StatusRow } from "../../../hooks/tasks/useTaskBoard";

// Pill + dropdown, ClickUp-style ("Status cell = colored pill; click
// opens a dropdown of that board's configured statuses" — clickup-task-ui
// skill). Badge.tsx's fixed variant palette can't represent a company's
// own per-status hex color, so this builds the same light-bg/solid-text/
// thin-border look Badge uses, from the status's actual configured color.
function pillStyle(hex: string | null) {
  const color = hex ?? "#6B7280";
  return {
    background: `${color}1A`,
    color,
    border: `1px solid ${color}55`,
  };
}

interface StatusCellProps {
  statuses: StatusRow[];
  currentStatusId: string;
  onChange: (statusId: string) => void;
  /** Which edge the dropdown hangs from — "right" (default) fits the wide
   * board table; "left" is for narrow contexts near the screen's left
   * edge (the D3 detail panel), where a right-anchored dropdown would
   * extend further left and overflow off-screen. */
  align?: "left" | "right";
  /** Display only: the popover never opens (no edit rights). */
  readOnly?: boolean;
}

export default function StatusCell({
  statuses,
  currentStatusId,
  onChange,
  align = "right", readOnly = false,
}: StatusCellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = statuses.find((s) => s.id === currentStatusId);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !readOnly && setOpen((v) => !v)}
        style={pillStyle(current?.color ?? null)}
        className="inline-flex items-center rounded-lg px-3.5 py-1.5 text-[13px] font-bold whitespace-nowrap shadow-2xs transition-transform active:scale-95"
      >
        {current?.label_ar ?? "—"}
      </button>

      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchorRef={ref} width={160} align={align} className="py-1">
          {statuses.map((status) => (
            <button
              key={status.id}
              onClick={() => {
                onChange(status.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-right text-sm hover:bg-gray-50"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: status.color ?? "#6B7280" }}
              />
              <span className="truncate">{status.label_ar}</span>
            </button>
          ))}
      </AnchoredMenu>
    </div>
  );
}
