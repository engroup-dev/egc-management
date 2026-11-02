import { queryOptions, useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useDistributionHistory } from "../../hooks/projects/useDistributionHistory";
import { formatCurrency } from "../../utils/helpper";
import { supabase } from "../../lib/supabaseClient";
import LoadingPage from "../../components/ui/LoadingPage";
import ErrorPage from "../../components/ui/errorPage";

type Currency = "LYD" | "USD" | "EUR";
const CURRENCIES: Currency[] = ["LYD", "USD", "EUR"];

interface ProjectRow {
  projectId: string;
  projectName: string;
  projectSerial: number | null;
  currency: string;
  percentage: number;
  cash_amount: number;
  bank_amount: number;
  total: number;
}

interface ReversedEntry {
  projectName: string;
  projectSerial: number | null;
  currency: string;
  amount: number;
  note: string | null;
}

const EmployeeDistributionDetailsPage = () => {
  const { employeeId } = useParams<{ employeeId: string }>();
  const [searchParams] = useSearchParams();
  const batchDate = searchParams.get("date");

  const { periods, loading, error } = useDistributionHistory();

  const { data: employee = null } = useDistributionEmployee(employeeId);

  if (loading) return <LoadingPage label="جاري تحميل بيانات الموظف" />;
  if (error)
    return (
      <ErrorPage error={error.message || "حدث خطأ"} label="تفاصيل الموظف" />
    );

  const relevantPeriods = (periods ?? []).filter(
    (p) =>
      (!batchDate || p.end_date === batchDate) &&
      p.items.some(
        (i) => i.item_type === "employee" && i.user_id === employeeId,
      ),
  );

  const rowMap = new Map<string, ProjectRow>();
  const reversedEntries: ReversedEntry[] = [];

  for (const p of relevantPeriods) {
    const item = p.items.find(
      (i) => i.item_type === "employee" && i.user_id === employeeId,
    );
    if (!item) continue;
    const currency = p.currency ?? "LYD";

    if (p.status === "reversed") {
      reversedEntries.push({
        projectName: p.project.name,
        projectSerial: p.project.serial_number,
        currency,
        amount: item.total,
        note: p.reversal_note,
      });
      continue;
    }

    const key = `${p.project.id}_${currency}`;
    const existing = rowMap.get(key);
    if (existing) {
      existing.percentage += item.percentage;
      existing.cash_amount += item.cash_amount;
      existing.bank_amount += item.bank_amount;
      existing.total += item.total;
    } else {
      rowMap.set(key, {
        projectId: p.project.id,
        projectName: p.project.name,
        projectSerial: p.project.serial_number,
        currency,
        percentage: item.percentage,
        cash_amount: item.cash_amount,
        bank_amount: item.bank_amount,
        total: item.total,
      });
    }
  }

  const rows = Array.from(rowMap.values()).sort((a, b) =>
    a.projectName.localeCompare(b.projectName),
  );

  const grandTotals: Record<string, number> = {};
  for (const r of rows) {
    grandTotals[r.currency] = (grandTotals[r.currency] ?? 0) + r.total;
  }

  return (
    <div className="p-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">
            {employee
              ? `${employee.firstName} ${employee.lastName ?? ""}`
              : "..."}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {employee?.specialization ?? "—"}
            {batchDate && <span> · دفعة {batchDate}</span>}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {CURRENCIES.map((c) => (
            <div
              key={c}
              className={`rounded-xl border px-4 py-3 text-center ${
                (grandTotals[c] ?? 0) > 0
                  ? "bg-white shadow-sm"
                  : "bg-gray-50 opacity-50"
              }`}
            >
              <p className="text-xs text-gray-400 mb-1">{c}</p>
              <p
                className={`font-bold tabular-nums text-sm ${
                  (grandTotals[c] ?? 0) > 0 ? "text-gray-800" : "text-gray-300"
                }`}
              >
                {formatCurrency(grandTotals[c] ?? 0, c)}
              </p>
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            لا توجد توزيعات لهذا الموظف في هذه الدفعة
          </div>
        ) : (
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-right text-gray-400 bg-gray-50">
                    <th className="px-3 py-2.5">المشروع</th>
                    <th className="px-3 py-2.5">العملة</th>
                    <th className="px-3 py-2.5">النسبة</th>
                    <th className="px-3 py-2.5 text-amber-600">نقد</th>
                    <th className="px-3 py-2.5 text-blue-600">بنك</th>
                    <th className="px-3 py-2.5">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr
                      key={`${r.projectId}_${r.currency}`}
                      className="text-right hover:bg-gray-50"
                    >
                      <td className="px-3 py-2.5 font-medium">
                        <Link
                          to={`/company/distribute/project/${r.projectId}${
                            batchDate ? `?date=${batchDate}` : ""
                          }`}
                          className="text-blue-600 hover:underline"
                        >
                          {r.projectSerial ? `#${r.projectSerial} · ` : ""}
                          {r.projectName}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">{r.currency}</td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {r.percentage}%
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-amber-700">
                        {formatCurrency(r.cash_amount, r.currency)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-blue-700">
                        {formatCurrency(r.bank_amount, r.currency)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold">
                        {formatCurrency(r.total, r.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {reversedEntries.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-gray-400 font-medium">توزيعات معكوسة</p>
            {reversedEntries.map((r, idx) => (
              <div
                key={idx}
                className="rounded-md bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700 opacity-70"
              >
                <span className="font-semibold">
                  {r.projectSerial ? `#${r.projectSerial} · ` : ""}
                  {r.projectName}
                </span>
                {" — "}
                {formatCurrency(r.amount, r.currency)}
                {r.note && (
                  <span className="text-red-500 mr-2">— {r.note}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeDistributionDetailsPage;

// ─── Header data ──────────────────────────────────────────────────────────────

const distributionEmployeeQueryOptions = (employeeId: string) =>
  queryOptions({
    queryKey: ["company", "distribution-employee", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select(
          "first_name, last_name, employee_specialities(speciality:specialities(name))",
        )
        .eq("id", employeeId)
        .single();
      if (error) throw error;
      return {
        firstName: data.first_name,
        lastName: data.last_name,
        specialization:
          (
            data.employee_specialities as
              | { speciality: { name: string } | null }[]
              | null
          )?.[0]?.speciality?.name ?? null,
      };
    },
    enabled: !!employeeId,
  });

function useDistributionEmployee(employeeId: string | undefined) {
  return useQuery(distributionEmployeeQueryOptions(employeeId ?? ""));
}
