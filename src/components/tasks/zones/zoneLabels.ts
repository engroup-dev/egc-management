import { dayNumber } from "../board/workingDays";
import type { ScheduleMove } from "../../../hooks/tasks/useTaskSchedule";

// Shared by the zone bar, the zone dialogs and the all-zones timeline.

/** One colour per zone, by its place in the zone order (Construction Flow's palette). */
export const ZONE_COLORS = ["#4a8fe7", "#e5934b", "#5aa85a", "#a06cd5", "#e5534b", "#2fa8a0", "#d4a72c"];
export const zoneColor = (index: number) => ZONE_COLORS[index % ZONE_COLORS.length];

/** "5/11" from "2026-11-05". */
export function shortDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(dayNumber(value) * 86_400_000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/** "1/11 – 15/11", or one date. */
export function shortSpan(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return "";
  return start.slice(0, 10) === end.slice(0, 10) ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`;
}

/** How a dry run's moves read: "تتحرك 12 مهمة في 3 مناطق". */
export function movesSummary(moved: ScheduleMove[]): string {
  if (moved.length === 0) return "لا تتغيّر أي تواريخ";
  const zones = new Set(moved.map((m) => m.board_id).filter(Boolean)).size;
  const count = moved.length === 1 ? "مهمة واحدة" : moved.length === 2 ? "مهمتان" : `${moved.length} مهام`;
  return `تتحرك ${count}${zones > 1 ? ` في ${zones} مناطق` : ""}`;
}
