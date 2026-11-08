import { useMemo, type ReactNode } from "react";
import {
  CheckCircle2,
  Clock,
  ListTodo,
  Loader,
  AlertTriangle,
} from "lucide-react";
import type { TaskDirectoryData } from "../../../hooks/tasks/useTaskDirectory";
import type { DirectoryFilterState } from "./directoryFilters";
import { activeKpiKey, kpiFilters, type KpiKey } from "./spaceKpiFilters";

interface Kpi {
  key: KpiKey;
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  tone: string;
  alertWhenPositive?: boolean;
  raw: number;
  count: number;
  action: string;
}

function KpiCard({
  kpi,
  active,
  onClick,
}: {
  kpi: Kpi;
  active: boolean;
  onClick: () => void;
}) {
  const alert = kpi.alertWhenPositive && kpi.raw > 0;
  const disabled = kpi.count === 0 && !active;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={disabled ? undefined : active ? "إلغاء التصفية" : kpi.action}
      className={`group relative flex items-center gap-3.5 rounded-2xl border p-3.5 text-right transition-all duration-150 ${
        active
          ? "border-2 shadow-sm bg-white"
          : alert
          ? "border-rose-200 bg-rose-50/50 hover:border-rose-300 hover:bg-rose-50"
          : "border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-xs"
      } ${disabled ? "cursor-default opacity-60" : "cursor-pointer"}`}
      style={
        active
          ? {
              borderColor: kpi.tone,
              boxShadow: `0 2px 8px ${kpi.tone}20`,
              backgroundColor: `${kpi.tone}0A`,
            }
          : undefined
      }
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-2xs transition-transform duration-150 group-hover:scale-105"
        style={{ background: `${kpi.tone}1A`, color: kpi.tone }}
      >
        {kpi.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-2xl font-black ${
              alert ? "text-rose-600" : "text-slate-900"
            }`}
            style={active ? { color: kpi.tone } : undefined}
          >
            {kpi.value}
          </span>
          <span className="text-sm font-bold text-slate-800 truncate">{kpi.label}</span>
        </div>
        {kpi.hint && (
          <div className="text-xs text-slate-500 font-medium truncate mt-0.5">{kpi.hint}</div>
        )}
      </div>
    </button>
  );
}

export default function SpaceKpiStrip({
  data,
  filters,
  onSelect,
}: {
  data: TaskDirectoryData;
  filters: DirectoryFilterState;
  onSelect: (next: DirectoryFilterState) => void;
}) {
  const kpis = useMemo<Kpi[]>(() => {
    const closedStatusIds = new Set(
      data.statuses
        .filter((s) => s.category === "done" || s.category === "closed")
        .map((s) => s.id),
    );
    const doneStatusIds = new Set(
      data.statuses.filter((s) => s.category === "done").map((s) => s.id),
    );
    const notStartedStatusIds = new Set(
      data.statuses.filter((s) => s.category === "not_started").map((s) => s.id),
    );
    const inProgressStatusIds = new Set(
      data.statuses.filter((s) => s.category === "active").map((s) => s.id),
    );

    const today = new Date().toISOString().split("T")[0];

    let open = 0;
    let done = 0;
    let notStarted = 0;
    let inProgress = 0;
    let overdue = 0;
    let delayedStart = 0;

    for (const t of data.tasks) {
      if (doneStatusIds.has(t.status_id)) done++;
      if (closedStatusIds.has(t.status_id)) continue;
      open++;
      if (notStartedStatusIds.has(t.status_id)) {
        notStarted++;
        if (t.start_date && t.start_date <= today) {
          delayedStart++;
        }
      }
      if (inProgressStatusIds.has(t.status_id)) inProgress++;
      if (t.is_overdue || (t.due_date && t.due_date < today)) overdue++;
    }

    const total = data.tasks.length;
    const countable =
      total -
      (data.tasks.filter((t) => closedStatusIds.has(t.status_id)).length - done);
    const completion = countable > 0 ? Math.round((done / countable) * 100) : 0;

    return [
      {
        key: "done",
        label: "نسبة الإنجاز",
        value: `${completion}%`,
        hint: `${done} من ${countable} مهمة مكتملة`,
        icon: <CheckCircle2 className="h-5 w-5" />,
        tone: "#10B981",
        raw: completion,
        count: done,
        action: "عرض المهام المكتملة",
      },
      {
        key: "open",
        label: "مفتوحة",
        value: String(open),
        hint: `من إجمالي ${total} مهمة`,
        icon: <ListTodo className="h-5 w-5" />,
        tone: "#2563EB",
        raw: open,
        count: open,
        action: "عرض كل المهام المفتوحة",
      },
      {
        key: "in_progress",
        label: "قيد التنفيذ",
        value: String(inProgress),
        hint: "جاري العمل عليها الآن",
        icon: <Loader className="h-5 w-5" />,
        tone: "#7C3AED",
        raw: inProgress,
        count: inProgress,
        action: "عرض المهام قيد التنفيذ",
      },
      {
        key: "delayed_start",
        label: "يفترض أنها بدأت",
        value: String(delayedStart),
        hint: "حان موعد بدئها وما زالت معلقة",
        icon: <Clock className="h-5 w-5" />,
        tone: "#D97706",
        alertWhenPositive: true,
        raw: delayedStart,
        count: delayedStart,
        action: "عرض المهام التي تأخر بدؤها",
      },
      {
        key: "overdue",
        label: "متأخرة في التسليم ⚠️",
        value: String(overdue),
        hint: "تجاوزت الموعد النهائي المحدد",
        icon: <AlertTriangle className="h-5 w-5" />,
        tone: "#DC2626",
        alertWhenPositive: true,
        raw: overdue,
        count: overdue,
        action: "عرض المهام المتأخرة",
      },
    ];
  }, [data]);

  const activeKey = useMemo(() => activeKpiKey(filters, data), [filters, data]);

  return (
    <div className="grid grid-cols-2 gap-3.5 p-4 md:grid-cols-3 lg:grid-cols-5 bg-white">
      {kpis.map((kpi) => {
        const active = activeKey === kpi.key;
        return (
          <KpiCard
            key={kpi.key}
            kpi={kpi}
            active={active}
            onClick={() => onSelect(kpiFilters(active ? "open" : kpi.key, data))}
          />
        );
      })}
    </div>
  );
}
