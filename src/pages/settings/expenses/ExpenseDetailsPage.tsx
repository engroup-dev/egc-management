import { useParams } from "react-router-dom";
import { useState, useMemo } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import { TIERS } from "../../../lib/queryClient";
import { formatCurrency } from "../../../utils/helpper";
import GenericTable from "../../../components/tables/table";
import { expenseByProjectColumns } from "../../../components/tables/columns/expenseByProjectColumns";

// ─────────────────────────────────────────────
// الأنواع
// ─────────────────────────────────────────────

interface Expense {
  id: string;
  name: string;
  created_at: string;
  usage_count: number;
}

interface ExpenseStatByProject {
  project_id: string;
  project_name: string;
  usage_count: number;
  total_amount: number;
  avg_amount: number;
  last_used: string;
}

interface ExpenseOverTime {
  month: string; // "YYYY-MM"
  usage_count: number;
  total_amount: number;
}

// Raw row fetched from Supabase — kept flat for filtering
interface RawExpenseRow {
  id: string;
  total_amount: number;
  expense_date: string;
  project_id: string;
  projects: { id: string; name: string } | null;
}

interface ExpenseStats {
  expense: Expense;
  rows: RawExpenseRow[]; // كل السجلات الخام بدون فلترة
  over_time: ExpenseOverTime[]; // كل الشهور (بدون فلترة) للرسم البياني
}

// ─────────────────────────────────────────────
// هوك: جلب الإحصائيات الخام
// ─────────────────────────────────────────────

async function fetchExpenseStats(expenseId: string): Promise<ExpenseStats> {
  const { data: expenseData, error: expenseError } = await supabase
    .from("expenses")
    .select("id, name, created_at, usage_count")
    .eq("id", expenseId)
    .single();
  if (expenseError) throw expenseError;

  const { data: peRows, error: peError } = await supabase
    .from("project_expenses")
    .select(
      `id,
       total_amount,
       expense_date,
       project_id,
       projects ( id, name )`,
    )
    .eq("expense_id", expenseId)
    .is("deleted_at", null);
  if (peError) throw peError;

  const rows = (peRows ?? []) as RawExpenseRow[];

  // بناء بيانات الرسم البياني من كل السجلات (بدون فلترة)
  const monthMap = new Map<string, ExpenseOverTime>();
  for (const row of rows) {
    if (!row.expense_date) continue;
    const month = row.expense_date.slice(0, 7);
    const amount = Number(row.total_amount ?? 0);
    const existing = monthMap.get(month);
    if (existing) {
      existing.usage_count += 1;
      existing.total_amount += amount;
    } else {
      monthMap.set(month, { month, usage_count: 1, total_amount: amount });
    }
  }

  const overTime = Array.from(monthMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month),
  );

  return { expense: expenseData, rows, over_time: overTime };
}

// Money totals: always revalidated on view, shown from cache meanwhile.
export const expenseStatsQueryOptions = (expenseId: string) =>
  queryOptions({
    queryKey: ["settings", "expense-stats", expenseId],
    queryFn: () => fetchExpenseStats(expenseId),
    enabled: !!expenseId,
    ...TIERS.C,
  });

export function useExpenseStats(expenseId: string) {
  const query = useQuery(expenseStatsQueryOptions(expenseId));
  return {
    stats: query.data ?? null,
    loading: query.isPending,
    error: query.error as PostgrestError | null,
  };
}

// ─────────────────────────────────────────────
// دالة: تجميع السجلات حسب المشروع
// ─────────────────────────────────────────────

function aggregateByProject(rows: RawExpenseRow[]): ExpenseStatByProject[] {
  const projectMap = new Map<string, ExpenseStatByProject>();

  for (const row of rows) {
    const project = row.projects;
    if (!project) continue;
    const existing = projectMap.get(project.id);
    const amount = Number(row.total_amount ?? 0);
    const date = row.expense_date ?? "";

    if (existing) {
      existing.usage_count += 1;
      existing.total_amount += amount;
      existing.avg_amount = existing.total_amount / existing.usage_count;
      if (date > existing.last_used) existing.last_used = date;
    } else {
      projectMap.set(project.id, {
        project_id: project.id,
        project_name: project.name,
        usage_count: 1,
        total_amount: amount,
        avg_amount: amount,
        last_used: date,
      });
    }
  }

  return Array.from(projectMap.values()).sort(
    (a, b) => b.total_amount - a.total_amount,
  );
}

// ─────────────────────────────────────────────
// خيارات الفلترة الزمنية
// ─────────────────────────────────────────────

type TimeRange = "all" | "year" | "6m" | "3m" | "1m";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "all", label: "كل الفترات" },
  { value: "year", label: "سنة" },
  { value: "6m", label: "6 أشهر" },
  { value: "3m", label: "3 أشهر" },
  { value: "1m", label: "شهر" },
];

function getStartDate(range: TimeRange): string | null {
  if (range === "all") return null;
  const now = new Date();
  const months: Record<Exclude<TimeRange, "all">, number> = {
    year: 12,
    "6m": 6,
    "3m": 3,
    "1m": 1,
  };
  now.setMonth(now.getMonth() - months[range]);
  return now.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ─────────────────────────────────────────────
// دوال مساعدة
// ─────────────────────────────────────────────

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleString("en-LY", {
    month: "short",
    year: "2-digit",
  });
}

// ─────────────────────────────────────────────
// بطاقة الإحصاء
// ─────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4 text-right">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────
// رسم بياني شريطي — قابل للنقر لتحديد شهر
// ─────────────────────────────────────────────

function MonthlyChart({
  data,
  selectedMonth,
  onSelectMonth,
}: {
  data: ExpenseOverTime[];
  selectedMonth: string | null;
  onSelectMonth: (month: string | null) => void;
}) {
  const maxAmount = Math.max(...data.map((d) => d.total_amount), 1);

  return (
    <div className="flex items-end gap-1.5 h-36 overflow-x-auto pb-1" dir="ltr">
      {data.map((d) => {
        const isSelected = selectedMonth === d.month;
        const isDeselected = selectedMonth !== null && !isSelected;
        return (
          <button
            key={d.month}
            onClick={() => onSelectMonth(isSelected ? null : d.month)}
            className="flex flex-col items-center gap-1 min-w-[44px] group focus:outline-none"
            title={`${fmtMonth(d.month)}: ${formatCurrency(d.total_amount)} (${d.usage_count} مرة)`}
          >
            <span
              className={`text-[10px] tabular-nums transition-colors ${
                isDeselected
                  ? "text-muted-foreground/40"
                  : "text-muted-foreground"
              }`}
            >
              {(d.total_amount / 1000).toFixed(0)}k
            </span>
            <div
              className={`w-full rounded-t transition-all ${
                isSelected
                  ? "bg-primary"
                  : isDeselected
                    ? "bg-primary/20"
                    : "bg-primary/60 group-hover:bg-primary/80"
              }`}
              style={{ height: `${(d.total_amount / maxAmount) * 80}px` }}
            />
            <span
              className={`text-[10px] tabular-nums transition-colors ${
                isSelected
                  ? "text-primary font-medium"
                  : isDeselected
                    ? "text-muted-foreground/40"
                    : "text-muted-foreground"
              }`}
            >
              {fmtMonth(d.month)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// الصفحة الرئيسية
// ─────────────────────────────────────────────

const ExpenseDetailsPage = () => {
  const params = useParams<{ id: string }>();
  const expenseId = params.id ?? "";

  // الفلتر الزمني — الافتراضي: سنة
  const [timeRange, setTimeRange] = useState<TimeRange>("year");
  // الشهر المحدد بالنقر على الرسم البياني — اختياري
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const { stats, loading, error } = useExpenseStats(expenseId);

  // عند تغيير الفلتر الزمني، نلغي تحديد الشهر
  function handleRangeChange(range: TimeRange) {
    setTimeRange(range);
    setSelectedMonth(null);
  }

  // ── فلترة السجلات الخام بناءً على الفلتر الزمني + الشهر المحدد ──
  const filteredRows = useMemo(() => {
    if (!stats) return [];
    let rows = stats.rows;

    // فلتر الفترة الزمنية
    const startDate = getStartDate(timeRange);
    if (startDate) {
      rows = rows.filter((r) => r.expense_date >= startDate);
    }

    // فلتر الشهر المحدد (النقر على الرسم البياني)
    if (selectedMonth) {
      rows = rows.filter((r) => r.expense_date?.slice(0, 7) === selectedMonth);
    }

    return rows;
  }, [stats, timeRange, selectedMonth]);

  // ── بيانات الرسم البياني: مفلترة بالفترة فقط (بدون فلتر الشهر) ──
  const chartData = useMemo(() => {
    if (!stats) return [];
    const startDate = getStartDate(timeRange);
    if (!startDate) return stats.over_time;

    // إعادة تجميع الشهور للفترة المحددة
    const monthMap = new Map<string, ExpenseOverTime>();
    for (const row of stats.rows) {
      if (!row.expense_date || row.expense_date < startDate) continue;
      const month = row.expense_date.slice(0, 7);
      const amount = Number(row.total_amount ?? 0);
      const existing = monthMap.get(month);
      if (existing) {
        existing.usage_count += 1;
        existing.total_amount += amount;
      } else {
        monthMap.set(month, { month, usage_count: 1, total_amount: amount });
      }
    }
    return Array.from(monthMap.values()).sort((a, b) =>
      a.month.localeCompare(b.month),
    );
  }, [stats, timeRange]);

  // ── تجميع الجدول بعد الفلترة ──
  const byProject = useMemo(
    () => aggregateByProject(filteredRows),
    [filteredRows],
  );

  // ── إجماليات الملخص ──
  const totalAmount = filteredRows.reduce(
    (s, r) => s + Number(r.total_amount ?? 0),
    0,
  );
  const totalUsage = filteredRows.length;
  const avgAmount = totalUsage > 0 ? totalAmount / totalUsage : 0;
  const topProject = byProject[0] ?? null;

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-64 text-muted-foreground"
        dir="rtl"
      >
        جارٍ تحميل الإحصائيات…
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div
        className="flex items-center justify-center h-64 text-destructive"
        dir="rtl"
      >
        حدث خطأ أثناء تحميل بيانات المصروف.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8" dir="rtl">
      {/* الترويسة + فلتر الفترة */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground mb-1">نوع المصروف</p>
          <h1 className="text-2xl font-semibold">{stats.expense.name}</h1>
        </div>

        {/* أزرار الفلترة الزمنية */}
        <div className="flex items-center gap-1 bg-muted/40 border border-border rounded-lg p-1">
          {TIME_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleRangeChange(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                timeRange === opt.value
                  ? "bg-background border border-border shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* بطاقات الملخص */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="إجمالي الاستخدامات" value={totalUsage.toString()} />
        <StatCard label="إجمالي المبلغ" value={formatCurrency(totalAmount)} />
        <StatCard label="متوسط كل استخدام" value={formatCurrency(avgAmount)} />
        <StatCard
          label="أكثر مشروع استخداماً"
          value={topProject?.project_name ?? "—"}
        />
      </div>

      {/* الرسم البياني الشهري */}
      {chartData.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              الاستخدام الشهري
            </h2>
            {selectedMonth && (
              <button
                onClick={() => setSelectedMonth(null)}
                className="text-xs text-primary hover:underline"
              >
                إلغاء تحديد {fmtMonth(selectedMonth)}
              </button>
            )}
          </div>
          <MonthlyChart
            data={chartData}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
          />
          {selectedMonth && (
            <p
              className="text-xs text-muted-foreground mt-2 text-center"
              dir="rtl"
            >
              يعرض الجدول أدناه بيانات شهر {fmtMonth(selectedMonth)} فقط
            </p>
          )}
        </section>
      )}

      {/* جدول التفاصيل حسب المشروع */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
        <GenericTable
          columns={expenseByProjectColumns}
          data={byProject}
          enableFiltering
          enableSorting
          showGlobalFilter
        />
      </div>
    </div>
  );
};

export default ExpenseDetailsPage;
