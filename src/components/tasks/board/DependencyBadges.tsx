import { CheckCircle2, CircleAlert } from "lucide-react";
import Tooltip from "../../ui/Tooltip";
import type { DependencyFlags } from "../../../hooks/tasks/dependencyFlags";

// The two sides of a dependency, drawn the same everywhere — board rows,
// Gantt bars, the detail panel's "الاعتماديات" section:
//   WAIT  this task waits for another to finish   — red "no entry" road sign
//   HOLD  other tasks wait for this one to finish  — amber "!"

/** The road "no entry" sign: a filled disc (current colour) with a white bar. */
function StopSignIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <rect x="5" y="9.75" width="14" height="4.5" rx="1" fill="#fff" />
    </svg>
  );
}

export const WAIT_STYLE = {
  Icon: CircleAlert,
  text: "text-amber-600",
  chip: "bg-amber-50 text-amber-600",
  border: "border-r-amber-300",
  selected: "border-amber-300 bg-amber-50 text-amber-700",
} as const;

export const HOLD_STYLE = {
  Icon: StopSignIcon,
  text: "text-red-600",
  chip: "bg-red-50 text-red-600",
  border: "border-r-red-300",
  selected: "border-red-300 bg-red-50 text-red-700",
} as const;

/** blockedBy: this task waits for the picked one. blocks: the picked one waits for this task. */
export type LinkDirection = "blockedBy" | "blocks";

export const DIRECTION_STYLES = { blockedBy: WAIT_STYLE, blocks: HOLD_STYLE } as const;

// The add menu's two choices, with the full sentence under them.
const DIRECTION_CHOICES: { direction: LinkDirection; label: string; hint: string }[] = [
  { direction: "blockedBy", label: "تنتظر مهمة", hint: "تبدأ هذه المهمة بعد انتهاء…" },
  { direction: "blocks", label: "مهمة تنتظرها", hint: "تبدأ بعد انتهاء هذه المهمة…" },
];

/** Which way a new link goes — the panel's add menu and the board's link popover. */
export function DirectionToggle({ value, onChange }: { value: LinkDirection; onChange: (direction: LinkDirection) => void }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5">
        {DIRECTION_CHOICES.map((choice) => {
          const style = DIRECTION_STYLES[choice.direction];
          const selected = value === choice.direction;
          return (
            <button
              key={choice.direction}
              type="button"
              onClick={() => onChange(choice.direction)}
              aria-pressed={selected}
              className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium ${
                selected ? style.selected : "border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              <style.Icon className={`h-3.5 w-3.5 ${selected ? "" : style.text}`} />
              {choice.label}
            </button>
          );
        })}
      </div>
      <div className="mt-1 text-[11px] text-gray-400">{DIRECTION_CHOICES.find((c) => c.direction === value)?.hint}</div>
    </div>
  );
}

const MAX_TITLES = 5;

/** "A، B، C" — cut after a few, with how many more. */
export function listTitles(titles: string[]): string {
  const shown = titles.slice(0, MAX_TITLES).join("، ");
  return titles.length > MAX_TITLES ? `${shown} و${titles.length - MAX_TITLES} أخرى` : shown;
}

export const waitingLabel = (titles: string[]) => `تنتظر انتهاء: ${listTitles(titles)}`;
export const holdingLabel = (titles: string[]) => `مهام تنتظرها: ${listTitles(titles)}`;
const CLEARED_LABEL = "تم تحرير الاعتمادية — جاهزة للبدء";

function Chip({ style, count, label }: { style: typeof WAIT_STYLE | typeof HOLD_STYLE; count: number; label: string }) {
  const { Icon } = style;
  return (
    <Tooltip label={label}>
      <span
        className={`inline-flex h-4 shrink-0 items-center gap-0.5 rounded-full px-1 text-[10px] font-semibold ${style.chip}`}
        aria-label={label}
      >
        <Icon className="h-3 w-3" />
        {count > 1 && count}
      </span>
    </Tooltip>
  );
}

/** A row's dependency icons: stop while it waits, "!" while others wait on it,
 * a green check once everything it waited on is done. */
export default function DependencyBadges({ flags }: { flags: DependencyFlags | undefined }) {
  if (!flags) return null;
  const { waitingOn, holding, cleared } = flags;
  // A task is only an active blocker ("مهام تنتظرها") if it is not blocked itself.
  // If it's still waiting on predecessors to finish, we don't display the holding badge on it yet.
  const isActivelyHolding = holding.length > 0 && waitingOn.length === 0;

  return (
    <>
      {waitingOn.length > 0 && <Chip style={WAIT_STYLE} count={waitingOn.length} label={waitingLabel(waitingOn)} />}
      {cleared && (
        <Tooltip label={CLEARED_LABEL}>
          <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" aria-label={CLEARED_LABEL} />
        </Tooltip>
      )}
      {isActivelyHolding && <Chip style={HOLD_STYLE} count={holding.length} label={holdingLabel(holding)} />}
    </>
  );
}
