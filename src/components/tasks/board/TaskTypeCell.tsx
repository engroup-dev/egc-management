import { useRef, useState } from "react";
import { Check } from "lucide-react";
import AnchoredMenu from "./AnchoredMenu";
import type { TaskTypeLite } from "../../../hooks/tasks/useTaskBoard";

// Small-popover pattern, same as StatusCell — but the trigger stays the
// compact colored dot TaskRow already rendered read-only (this replaces
// the row's real estate before the title, not a full grid column).

interface TaskTypeCellProps {
  // ReadonlyMap (not Map) so callers whose task-type rows carry extra
  // fields (e.g. a full task_types Row) can pass
  // their map as-is — this only ever reads it.
  taskTypes: ReadonlyMap<string, TaskTypeLite>;
  currentTaskTypeId: string;
  onChange: (taskTypeId: string) => void;
  /** See StatusCell's align prop — "left" for narrow contexts near the
   * screen's left edge (the D3 detail panel). */
  align?: "left" | "right";
  /** Display only: the popover never opens (no edit rights). */
  readOnly?: boolean;
}

export default function TaskTypeCell({ taskTypes, currentTaskTypeId, onChange, align = "right", readOnly = false }: TaskTypeCellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = taskTypes.get(currentTaskTypeId);
  const options = Array.from(taskTypes.values());

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => !readOnly && setOpen((v) => !v)}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-gray-100"
        title={current?.name_ar ?? "نوع المهمة"}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: current?.color ?? "#9CA3AF" }} />
      </button>

      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchorRef={ref} width={160} align={align} className="py-1">
          {options.map((tt) => {
            const isCurrent = tt.id === currentTaskTypeId;
            return (
              <button
                key={tt.id}
                onClick={() => {
                  onChange(tt.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-right text-sm hover:bg-gray-50 ${
                  isCurrent ? "bg-gray-50 font-medium text-gray-900" : "text-gray-700"
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tt.color ?? "#9CA3AF" }} />
                <span className="flex-1 truncate">{tt.name_ar}</span>
                {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </button>
            );
          })}
      </AnchoredMenu>
    </div>
  );
}
