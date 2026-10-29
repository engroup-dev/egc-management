import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Maximize2, Minus, Plus } from "lucide-react";
import type { DependencyPair, StatusRow, TaskRow } from "../../../hooks/tasks/useTaskBoard";
import type { ZoneSpan } from "../../../hooks/tasks/useZones";
import { dayNumber, isOffDay } from "../board/workingDays";
import { criticalPath } from "../schedule/criticalPath";
import { criticalCount } from "../gantt/ganttScale";
import Tooltip from "../../ui/Tooltip";
import { shortDate, shortSpan, zoneColor } from "./zoneLabels";

// The project timeline across zones — the manager's "timeline that takes the
// zoning into account", Construction Flow's "Timeline (all zones)": one row
// per task (the same task in every zone shares a row through twin_key), one
// bar per zone in the zone's colour, on a calendar of working days (Fridays
// shaded). With the zones chained, the bars step from zone to zone like a
// line-of-balance chart. Time runs right to left like the rest of the app.
// Read-only: a bar opens its task; dates are edited on the zone boards.

const LABEL_W = 260;
const ROW_H = 30;
const HEADER_H = 44;

interface ZonesTimelineProps {
  spaceId: string;
  tasks: TaskRow[];
  zones: ZoneSpan[];
  statuses: StatusRow[];
  dependencies: DependencyPair[];
  onOpenTask: (taskId: string) => void;
}

interface Row {
  key: string;
  title: string;
  depth: number;
  isParent: boolean;
  first: number;
  bars: { task: TaskRow; zone: number; s: number; e: number }[];
}

export default function ZonesTimeline({ spaceId, tasks, zones, statuses, dependencies, onOpenTask }: ZonesTimelineProps) {
  const [pxPerDay, setPxPerDay] = useState(22);
  const [mainOnly, setMainOnly] = useState(false);
  const [showCritical, setShowCritical] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const zoneIndex = useMemo(() => new Map(zones.map((z, i) => [z.boardId, i])), [zones]);
  const categoryOf = useMemo(() => new Map(statuses.map((s) => [s.id, s.category as string])), [statuses]);
  const isDone = (t: TaskRow) => ["done", "closed"].includes(categoryOf.get(t.status_id) ?? "");

  const { rows, minDay, maxDay } = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const hasChildren = new Set(tasks.map((t) => t.parent_task_id).filter(Boolean) as string[]);
    const depthOf = (t: TaskRow) => {
      let d = 0;
      for (let p = t.parent_task_id ? byId.get(t.parent_task_id) : undefined; p; p = p.parent_task_id ? byId.get(p.parent_task_id) : undefined) d++;
      return d;
    };
    const map = new Map<string, Row>();
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of tasks) {
      const zone = zoneIndex.get(t.board_id);
      if (zone === undefined || !t.start_date || !t.due_date) continue;
      const depth = depthOf(t);
      if (mainOnly && depth > 0) continue;
      const s = dayNumber(t.start_date);
      const e = dayNumber(t.due_date);
      lo = Math.min(lo, s);
      hi = Math.max(hi, e);
      const key = t.twin_key ?? t.id;
      let row = map.get(key);
      if (!row) {
        row = { key, title: t.title, depth, isParent: hasChildren.has(t.id), first: s, bars: [] };
        map.set(key, row);
      }
      if (zone < (row.bars[0]?.zone ?? Infinity)) row.title = t.title;
      row.first = Math.min(row.first, s);
      row.bars.push({ task: t, zone, s, e });
    }
    const list = Array.from(map.values()).sort((a, b) => a.first - b.first || a.depth - b.depth || a.title.localeCompare(b.title));
    for (const r of list) r.bars.sort((a, b) => a.zone - b.zone);
    return { rows: list, minDay: Number.isFinite(lo) ? lo : 0, maxDay: Number.isFinite(hi) ? hi : 0 };
  }, [tasks, zoneIndex, mainOnly]);

  // critical path over every zone (the zones are scheduled together)
  const critical = useMemo(() => {
    if (!showCritical) return null;
    const zoneTasks = tasks.filter((t) => zoneIndex.has(t.board_id));
    const outcome = criticalPath(
      zoneTasks.map((t) => ({
        id: t.id,
        parent_task_id: t.parent_task_id,
        start_date: t.start_date,
        due_date: t.due_date,
        start_lag_days: t.start_lag_days,
        frozen: isDone(t),
      })),
      dependencies,
      { plain: false },
    );
    return outcome;
  }, [showCritical, tasks, zoneIndex, dependencies, categoryOf]);

  const days = rows.length ? maxDay - minDay + 3 : 0;
  const width = LABEL_W + days * pxPerDay;
  const right = (day: number) => LABEL_W + (day - minDay) * pxPerDay;
  const today = dayNumber(new Date().toISOString());
  const labelEvery = pxPerDay >= 18 ? 1 : pxPerDay >= 8 ? 7 : 14;

  const fit = () => {
    const box = scroller.current?.clientWidth ?? 1000;
    if (days > 0) setPxPerDay(Math.max(3, Math.min(60, Math.floor((box - LABEL_W - 16) / days))));
  };

  // month bands for the header
  const months: { s: number; e: number; label: string }[] = [];
  for (let d = minDay; d < minDay + days; d++) {
    const date = new Date(d * 86_400_000);
    const label = `${date.getUTCMonth() + 1}/${date.getUTCFullYear()}`;
    const last = months[months.length - 1];
    if (last && last.label === label) last.e = d;
    else months.push({ s: d, e: d, label });
  }

  const criticalSet = critical?.ok ? critical.result.critical : null;

  return (
    <div className="flex h-full flex-col bg-white" dir="rtl">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2 text-xs">
        {zones.map((z, i) => (
          <Link
            key={z.boardId}
            to={`/tasks/board/${z.boardId}/gantt`}
            className="flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-gray-700 hover:bg-gray-50"
            title="فتح المخطط الزمني لهذه المنطقة"
          >
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: zoneColor(i) }} />
            {z.zoneName ?? z.boardName}
            {z.firstStart && <span className="text-gray-400">· {shortSpan(z.firstStart, z.lastDue)}</span>}
          </Link>
        ))}
        <div className="mr-auto flex items-center gap-1.5">
          {rows.length > 0 && (
            <span className="text-gray-500">
              نهاية المشروع <span className="font-medium text-gray-800">{shortDate(new Date(maxDay * 86_400_000).toISOString())}</span>
            </span>
          )}
          <label className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-gray-600 hover:bg-gray-50">
            <input type="checkbox" checked={mainOnly} onChange={(e) => setMainOnly(e.target.checked)} />
            المهام الرئيسية فقط
          </label>
          <button
            onClick={() => setShowCritical((v) => !v)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 ${
              showCritical ? "border-red-200 bg-red-50 text-red-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            title="المهام التي يؤخر أي تأخير فيها نهاية المشروع، عبر كل المناطق"
          >
            <Flame className="h-3.5 w-3.5" />
            المسار الحرج
            {criticalSet && <span className="font-medium">· {criticalCount(critical?.ok ? critical.result.count : 0)}</span>}
          </button>
          {showCritical && critical && !critical.ok && (
            <span className="text-amber-600">تعذّر الحساب — أعد تحميل الصفحة</span>
          )}
          <div className="flex overflow-hidden rounded-md border border-gray-200">
            <button onClick={() => setPxPerDay((p) => Math.max(3, Math.round(p / 1.4)))} className="px-1.5 py-1 hover:bg-gray-50" title="تصغير">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setPxPerDay((p) => Math.min(60, Math.round(p * 1.4)))} className="border-r border-gray-200 px-1.5 py-1 hover:bg-gray-50" title="تكبير">
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button onClick={fit} className="border-r border-gray-200 px-1.5 py-1 hover:bg-gray-50" title="ملاءمة العرض">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {zones.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
          لا توجد مناطق في هذه المساحة. اربط اللوحات بمناطق من إعدادات المساحة، أو أضف منطقة من شريط المناطق في أي لوحة.
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">لا توجد مهام مجدولة في المناطق</div>
      ) : (
        <div ref={scroller} className="relative flex-1 overflow-auto">
          <div className="relative" style={{ width, height: HEADER_H + rows.length * ROW_H + 8 }}>
            {/* Fridays and today, under everything */}
            {Array.from({ length: days }, (_, i) => minDay + i)
              .filter((d) => isOffDay(d))
              .map((d) => (
                <div
                  key={`off${d}`}
                  className="absolute bg-gray-100/70"
                  style={{ right: right(d), width: pxPerDay, top: HEADER_H, bottom: 0 }}
                />
              ))}
            {today >= minDay && today < minDay + days && (
              <div className="absolute w-px bg-primary/60" style={{ right: right(today) + pxPerDay / 2, top: HEADER_H, bottom: 0 }} />
            )}
            <div
              className="absolute border-r border-dashed border-gray-500"
              style={{ right: right(maxDay + 1), top: HEADER_H, bottom: 0 }}
              title="نهاية المشروع"
            />

            {/* header */}
            <div className="sticky top-0 z-20 border-b border-gray-200 bg-white" style={{ height: HEADER_H }}>
              <div className="sticky right-0 z-10 flex h-full items-end border-l border-gray-100 bg-white px-3 pb-1 text-xs font-medium text-gray-500" style={{ width: LABEL_W }}>
                المهمة
              </div>
              {months.map((m) => (
                <div
                  key={m.label}
                  className="absolute top-0 truncate border-l border-gray-100 px-1 text-[11px] text-gray-500"
                  style={{ right: right(m.s), width: (m.e - m.s + 1) * pxPerDay, height: 20 }}
                >
                  {m.label}
                </div>
              ))}
              {Array.from({ length: days }, (_, i) => minDay + i)
                .filter((d) => (d - minDay) % labelEvery === 0)
                .map((d) => (
                  <div
                    key={`d${d}`}
                    className={`absolute text-center text-[10px] ${isOffDay(d) ? "text-gray-300" : "text-gray-500"}`}
                    style={{ right: right(d), width: labelEvery === 1 ? pxPerDay : 24, top: 22 }}
                  >
                    {new Date(d * 86_400_000).getUTCDate()}
                  </div>
                ))}
            </div>

            {/* rows */}
            {rows.map((row, r) => (
              <div key={row.key} className="absolute left-0 right-0 border-b border-gray-50" style={{ top: HEADER_H + r * ROW_H, height: ROW_H }}>
                <div
                  className={`sticky right-0 z-10 flex h-full items-center truncate border-l border-gray-100 bg-white px-3 text-xs ${
                    row.isParent ? "font-semibold text-gray-900" : "text-gray-700"
                  }`}
                  style={{ width: LABEL_W, paddingRight: 12 + row.depth * 14 }}
                  title={row.title}
                >
                  {row.title}
                </div>
                {row.bars.map((b) => {
                  const zone = zones[b.zone];
                  const w = (b.e - b.s + 1) * pxPerDay - 2;
                  const done = isDone(b.task);
                  const crit = criticalSet?.has(b.task.id);
                  const faded = criticalSet && !crit;
                  const name = zone?.zoneName ?? zone?.boardName ?? "";
                  return (
                    <Tooltip
                      key={b.task.id}
                      label={`${b.task.title} · ${name} · ${shortSpan(b.task.start_date, b.task.due_date)}${done ? " · منجزة" : ""}`}
                    >
                      <button
                        onClick={() => onOpenTask(b.task.id)}
                        className={`absolute truncate rounded px-1 text-right text-[10px] leading-none text-white ${
                          crit ? "ring-2 ring-red-500 ring-offset-1" : ""
                        }`}
                        style={{
                          right: right(b.s) + 1,
                          width: Math.max(4, w),
                          top: row.isParent ? 10 : 5,
                          height: row.isParent ? ROW_H - 20 : ROW_H - 10,
                          background: zoneColor(b.zone),
                          opacity: faded ? 0.25 : done ? 0.5 : row.isParent ? 0.6 : 1,
                        }}
                      >
                        {w > 44 && !row.isParent ? name : ""}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="border-t border-gray-100 px-4 py-1.5 text-[11px] text-gray-400">
        كل صف مهمة واحدة، وكل لون منطقة. لتعديل التواريخ افتح لوحة المنطقة؛ ولجعل المناطق تنتظر بعضها استخدم «ربط المناطق».{" "}
        <Link to={`/tasks/space/${spaceId}/gantt`} className="text-primary hover:underline">
          المخطط الزمني للمساحة
        </Link>
      </div>
    </div>
  );
}
