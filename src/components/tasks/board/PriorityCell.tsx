import { useRef, useState } from "react";
import { Flag } from "lucide-react";
import Badge, { type BadgeVariant } from "../../ui/Badge";
import AnchoredMenu from "./AnchoredMenu";
import type { Priority } from "../../../hooks/tasks/useTaskBoard";

export const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: "عاجل",
  high: "مرتفعة",
  normal: "عادية",
  low: "منخفضة",
};

const PRIORITY_VARIANTS: Record<Priority, BadgeVariant> = {
  urgent: "danger",
  high: "warning",
  normal: "info",
  low: "default",
};

export const PRIORITIES: Priority[] =["urgent", "high", "normal", "low"];

interface PriorityCellProps {
  priority: Priority | null;
  onChange: (priority: Priority | null) => void;
  /** See StatusCell's align prop — "left" for narrow contexts near the
   * screen's left edge (the D3 detail panel). */
  align?: "left" | "right";
  /** Display only: the popover never opens (no edit rights). */
  readOnly?: boolean;
}

export default function PriorityCell({ priority, onChange, align = "right", readOnly = false }: PriorityCellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className="relative">
      {priority ? (
        <Badge
          label={PRIORITY_LABELS[priority]}
          variant={PRIORITY_VARIANTS[priority]}
          size="lg"
          onClick={() => !readOnly && setOpen((v) => !v)}
        />
      ) : (
        <button
          onClick={() => !readOnly && setOpen((v) => !v)}
          className={`rounded-full p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-400 ${readOnly ? "hidden" : ""}`}
          title="تعيين الأولوية"
        >
          <Flag className="h-3.5 w-3.5" />
        </button>
      )}

      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchorRef={ref} width={144} align={align} className="py-1">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
              className="flex w-full items-center px-3 py-1.5 text-right text-sm hover:bg-gray-50"
            >
              <Badge label={PRIORITY_LABELS[p]} variant={PRIORITY_VARIANTS[p]} size="md" />
            </button>
          ))}
          {priority && (
            <button
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="w-full px-3 py-1.5 text-right text-sm text-gray-400 hover:bg-gray-50"
            >
              بدون أولوية
            </button>
          )}
      </AnchoredMenu>
    </div>
  );
}
