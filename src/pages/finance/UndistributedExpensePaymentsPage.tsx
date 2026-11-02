import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import LoadingPage from "../../components/ui/LoadingPage";
import RefreshingBadge from "../../components/ui/RefreshingBadge";
import ErrorPage from "../../components/ui/errorPage";
import Button from "../../components/ui/Button";
import ProjectExpensePaymentsGroup from "../../components/finance/undistributed/ProjectExpensePaymentsGroup";
import { formatCurrency } from "../../utils/helpper";
import { useUndistributedExpensePayments } from "../../hooks/finance/distribution/useUndistributedExpensePayments";
import { usePendingDistributionPrint } from "../../hooks/finance/distribution/usePendingDistributionPrint";

function sumByCurrency(
  rows: { currency: string; amount: number | null }[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  rows.forEach(({ currency, amount }) => {
    if (amount == null) return;
    totals[currency] = (totals[currency] ?? 0) + amount;
  });
  return totals;
}

function KpiCard({
  label,
  totals,
  emphasize,
}: {
  label: string;
  totals: Record<string, number>;
  emphasize?: boolean;
}) {
  const entries = Object.entries(totals);
  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {entries.length === 0 ? (
        <p className="text-lg font-semibold text-gray-400">—</p>
      ) : (
        entries.map(([currency, amount]) => (
          <p
            key={currency}
            className={`text-lg font-semibold ${emphasize ? "text-blue-700" : "text-gray-900"}`}
          >
            {formatCurrency(amount, currency)}
          </p>
        ))
      )}
    </div>
  );
}

const UndistributedExpensePaymentsPage = () => {
  const { rows, loading, error, refreshing } =
    useUndistributedExpensePayments();
  const {
    generate: generatePrint,
    loading: printing,
    error: printError,
  } = usePendingDistributionPrint();
  const [search, setSearch] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    new Set(),
  );

  const toggleProjectSelected = (projectId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;

    return rows.filter((r) =>
      [
        r.projectName,
        r.expenseDescription,
        r.vendorName,
        r.contractorName,
        r.expenseSerial != null ? String(r.expenseSerial) : "",
        r.paymentSerial != null ? String(r.paymentSerial) : "",
      ]
        .filter((field): field is string => Boolean(field))
        .some((field) => field.toLowerCase().includes(term)),
    );
  }, [rows, search]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        projectId: string;
        projectName: string;
        projectSerial: number | null;
        rows: typeof filteredRows;
      }
    >();
    filteredRows.forEach((r) => {
      const existing = map.get(r.projectId);
      if (existing) {
        existing.rows.push(r);
      } else {
        map.set(r.projectId, {
          projectId: r.projectId,
          projectName: r.projectName,
          projectSerial: r.projectSerial,
          rows: [r],
        });
      }
    });
    return Array.from(map.values()).sort(
      (a, b) => (a.projectSerial ?? Infinity) - (b.projectSerial ?? Infinity),
    );
  }, [filteredRows]);

  const selectedProjects = groups.filter((g) =>
    selectedProjectIds.has(g.projectId),
  );

  async function handlePrintSelected() {
    if (selectedProjects.length === 0) return;
    await generatePrint(
      selectedProjects.map((g) => ({
        project_name: g.projectName,
        expenses: g.rows.map((row) => ({
          serial_number:
            row.expenseSerial != null
              ? String(row.expenseSerial)
              : row.paymentSerial != null
                ? String(row.paymentSerial)
                : "",
          description:
            row.logType === "refund"
              ? `استرداد: ${row.expenseDescription ?? ""}`.trim()
              : (row.expenseDescription ?? ""),
          amount: row.paymentAmount ?? 0,
          date: (row.expenseDate ?? row.paymentDate ?? row.createdAt).slice(
            0,
            10,
          ),
        })),
      })),
    );
  }

  const paymentTotals = sumByCurrency(
    filteredRows.map((r) => ({
      currency: r.currency,
      amount: r.paymentAmount,
    })),
  );
  const companyTotals = sumByCurrency(
    filteredRows.map((r) => ({
      currency: r.currency,
      amount: r.percentageAmount,
    })),
  );

  if (loading) return <LoadingPage />;
  if (error) return <ErrorPage error={error.message} />;

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          مدفوعات قيد التوزيع <RefreshingBadge show={refreshing} />
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          سجل مدفوعات مصاريف المشاريع التي لم يتم توزيع نسبتها بعد
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-xs text-gray-500 mb-1">عدد الدفعات</p>
          <p className="text-lg font-semibold text-gray-900">
            {filteredRows.length}
          </p>
        </div>
        <KpiCard label="إجمالي الدفعات" totals={paymentTotals} />
        <KpiCard label="نصيب الشركة" totals={companyTotals} emphasize />
      </div>

      {selectedProjects.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
          <span className="text-sm font-medium text-blue-800">
            {selectedProjects.length} مشروع محدد
          </span>
          <div className="flex items-center gap-3">
            {printError && (
              <span className="text-sm text-red-600">{printError}</span>
            )}
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={printing}
              disabled={printing}
              onClick={handlePrintSelected}
            >
              طباعة
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالمشروع، المصروف، المورد أو المقاول..."
          className="w-full pr-9 pl-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Groups */}
      <div className="space-y-3">
        {groups.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500 bg-white rounded-lg border border-gray-200">
            لا توجد دفعات غير موزعة لعرضها.
          </div>
        ) : (
          groups.map((g) => (
            <ProjectExpensePaymentsGroup
              key={g.projectId}
              projectId={g.projectId}
              projectName={g.projectName}
              projectSerial={g.projectSerial}
              rows={g.rows}
              selected={selectedProjectIds.has(g.projectId)}
              onToggleSelect={toggleProjectSelected}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default UndistributedExpensePaymentsPage;
