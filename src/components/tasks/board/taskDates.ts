// Shared date helpers for the task board / directory cells.
//
// House rule, also stated at the top of CalendarPopover.tsx: calendar
// dates are built from LOCAL year/month/day, never
// `toISOString().split("T")[0]`. Libya is UTC+2 with no DST, so the UTC
// pattern returns *yesterday* between 00:00 and 02:00 local — the bug the
// codebase audit records at 17 sites in this app
// (plans/codebase-audit/04-bugs-and-risks.md §10).
//
// The distinction that matters: serialising an *instant* with
// toISOString() is fine. Extracting a *calendar date* from it is not.
// Everything here compares instants against locally-computed day
// boundaries, so the pitfall never arises.

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "2:30 م" / "9:05 ص" — 12-hour, Arabic ص/م, Latin numerals.
 *
 * Hand-rolled rather than toLocaleTimeString("ar-LY") on purpose: that
 * returns Arabic-Indic numerals (٢:٣٠), which would clash with the Latin
 * digits formatSlashDate() produces right next to it. The codebase audit
 * already records this app mixing four different locale spellings across
 * 21 sites; this keeps date and time in one script at least here.
 *
 * The hour is not zero-padded — "9:05 ص", not "09:05 ص" — which is the
 * normal 12-hour convention. Minutes still are. */
function formatTime12(d: Date): string {
  const h24 = d.getHours();
  const meridiem = h24 < 12 ? "ص" : "م";
  // 0 → 12 ص (past midnight), 12 → 12 م (noon).
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad2(d.getMinutes())} ${meridiem}`;
}

/** The local day `d` falls in, minus the local day `now` falls in, in
 * whole days. Negative = in the past. */
function calendarDayDiff(d: Date, now: Date): number {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / 86_400_000);
}

/** How a finished task's completion compares with its due date, by local
 * calendar day: finishing any time on the due day is on time. `days` is
 * always >= 0 (0 for on_time). */
export function completionTiming(
  completedAt: string,
  dueDate: string,
): { kind: "early" | "on_time" | "late"; days: number } | null {
  const completed = new Date(completedAt);
  const due = new Date(dueDate);
  if (Number.isNaN(completed.getTime()) || Number.isNaN(due.getTime())) return null;
  const diff = calendarDayDiff(completed, due);
  if (diff === 0) return { kind: "on_time", days: 0 };
  return diff < 0 ? { kind: "early", days: -diff } : { kind: "late", days: diff };
}

/** Local midnight today → local midnight tomorrow, as a half-open range
 * of epoch milliseconds. */
export function localDayBounds(now: Date = new Date()): { start: number; end: number } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  return {
    start: new Date(y, m, d).getTime(),
    // Date normalises an overflowing day-of-month, and does it in local
    // time — so this stays correct across a DST boundary, unlike
    // `start + 86_400_000`. Libya has no DST, but the device's timezone
    // is whatever the machine is set to, which may.
    end: new Date(y, m, d + 1).getTime(),
  };
}

/** Local "YYYY-MM-DD" — the value shape of <input type="date">. Built from
 * local Y/M/D, never toISOString() (see the house rule above). */
export function toLocalDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Inverse of toLocalDateInput: "YYYY-MM-DD" → local midnight of that day.
 * Parsed from the parts rather than `new Date("YYYY-MM-DD")`, which is
 * read as UTC midnight and lands on the previous local day west of UTC. */
export function parseLocalDateInput(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** True when `ts` falls inside the local day that `now` is in (today by
 * default; pass any date to ask about that day instead). Half-open: a
 * timestamp at exactly local midnight belongs to the day starting then,
 * not the one ending. */
export function isCompletedToday(ts: string | null, now: Date = new Date()): boolean {
  if (!ts) return false;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return false;
  const { start, end } = localDayBounds(now);
  return t >= start && t < end;
}

/** "2026/01/01" — formatted numeric date. */
export function formatSlashDate(dateStr: string): string {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const [y, m, d] = dateStr.slice(0, 10).split("-");
    return `${y}/${m}/${d}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

/** "2026/1/1 2:30 م" — the slash date plus a 12-hour local time. Used for
 * the exact-value tooltip on a completion badge. */
export function formatSlashDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${formatSlashDate(dateStr)} ${formatTime12(d)}`;
}

/** Badge text for a completion timestamp: "اليوم 2:30 م" / "أمس 9:05 ص",
 * otherwise the plain date. The time is worth showing for today and
 * yesterday — "which of these did I finish this morning" is the question
 * the completed-today filter exists to answer — and noise beyond that. */
export function completedLabel(ts: string, now: Date = new Date()): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const time = formatTime12(d);
  const dayDiff = calendarDayDiff(d, now);

  if (dayDiff === 0) return `اليوم ${time}`;
  if (dayDiff === -1) return `أمس ${time}`;
  return formatSlashDate(ts);
}
