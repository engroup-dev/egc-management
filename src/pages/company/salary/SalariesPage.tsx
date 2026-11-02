import { useMemo, useState } from "react";
import { Calendar, Users, Wallet, CheckCircle2, Clock } from "lucide-react";
import GenericTable from "../../../components/tables/table";
import MonthFilterSync from "../../../components/tables/filters/MonthFilterSync";
import BulkActionBar from "../../../components/tables/BulkActionBar";
import KpiCard from "../../../components/ui/KpiCard";
import { PayrollColumns } from "../../../components/tables/columns/PayrollColumns";
import { usePayroll } from "../../../hooks/usePayroll";
import RefreshingBadge from "../../../components/ui/RefreshingBadge";
import { PayrollWithRelations } from "../../../types/extended.type";
import { formatCurrency } from "../../../utils/helpper";
import { getCurrentMonth, isInMonth } from "../../../utils/date";

const SalariesPage = () => {
  const [month, setMonth] = useState(getCurrentMonth());
  const [selectedRows, setSelectedRows] = useState<PayrollWithRelations[]>([]);
  const [markingPaid, setMarkingPaid] = useState(false);

  const { payroll, loading, refreshing, error, markAsPaid } = usePayroll();

  const stats = useMemo(() => {
    const filtered = payroll.filter((p) => isInMonth(p.pay_date, month));

    const totalEmployees = filtered.length;
    const totalSalaries = filtered.reduce(
      (sum, p) => sum + (p.total_salary ?? 0),
      0,
    );
    const paidCount = filtered.filter((p) => p.status === "paid").length;
    const pendingCount = filtered.filter((p) => p.status === "pending").length;

    return { totalEmployees, totalSalaries, paidCount, pendingCount };
  }, [payroll, month]);

  const handleMarkAsPaid = async () => {
    setMarkingPaid(true);
    try {
      const ids = selectedRows.map((r) => r.id);
      const result = await markAsPaid(ids);
      if (!result.success) {
        window.alert(`حدث خطأ: ${result.error}`);
        return;
      }
      setSelectedRows([]);
    } finally {
      setMarkingPaid(false);
    }
  };

  if (loading) return <div>جاري التحميل...</div>;
  if (error) return <div>حدث خطأ: {error.message}</div>;

  return (
    <div className="p-4 space-y-4">
      {/* ── KPI cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="عدد الموظفين"
          value={String(stats.totalEmployees)}
          icon={Users}
          tone="indigo"
        />
        <KpiCard
          label="إجمالي الرواتب"
          value={formatCurrency(stats.totalSalaries, "LYD")}
          icon={Wallet}
          tone="blue"
        />
        <KpiCard
          label="تم الدفع"
          value={String(stats.paidCount)}
          icon={CheckCircle2}
          tone="green"
        />
        <KpiCard
          label="قيد الانتظار"
          value={String(stats.pendingCount)}
          icon={Clock}
          tone="amber"
        />
      </div>

      {/* ── Bulk action bar (only visible when rows are selected) ── */}

      <GenericTable
        data={payroll}
        columns={PayrollColumns}
        enableSorting
        enableFiltering
        enableRowSelection
        showGlobalFilter
        onRowSelectionChange={setSelectedRows}
        initialSorting={[{ id: "status", desc: true }]}
        header={
          <div className="flex items-center justify-between w-full flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">رواتب الموظفين</h2>
              <RefreshingBadge show={refreshing} />
            </div>
            <div className="relative">
              <Calendar
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                strokeWidth={2}
              />
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                aria-label="تصفية حسب الشهر"
                className="pl-9 pr-3 py-2 rounded-full border border-gray-300 bg-white text-sm font-medium text-gray-700 shadow-sm hover:border-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-colors"
              />
            </div>
            <BulkActionBar
              count={selectedRows.length}
              actionLabel="تحديد كمدفوع"
              confirmTitle="تأكيد الدفع"
              confirmMessage={`هل أنت متأكد من تحديد ${selectedRows.length} كشف راتب كمدفوع؟ لا يمكن التراجع عن هذا الإجراء.`}
              onConfirm={handleMarkAsPaid}
              loading={markingPaid}
            />
          </div>
        }
        headerActions={(table) => (
          <MonthFilterSync table={table} month={month} />
        )}
      />
    </div>
  );
};

export default SalariesPage;
