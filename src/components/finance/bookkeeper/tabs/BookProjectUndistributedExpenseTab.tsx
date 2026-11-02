import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, Printer } from "lucide-react";
import {
  SectionRanges,
  SerialRange,
  UndistributedExpensePaymentRow,
  useUndistributedExpensePayments,
} from "../../../../hooks/finance/distribution/useUndistributedExpensePayments";
import { useCan } from "../../../../hooks/permissions/useCan";
import { supabase } from "../../../../lib/supabaseClient";
import { TIERS } from "../../../../lib/queryClient";
import { translatePaymentMethod } from "../../../../utils/translations";
import { fetchManagementApi } from "../../../../lib/managementApiClient";
import { formatCurrency, formatDate } from "../../../../utils/helpper";
import { undistributedExpensePaymentsColumns } from "../../../tables/columns/finance/UndistributedExpensePaymentsColumns";
import GenericTable from "../../../tables/table";
import Button from "../../../ui/Button";

interface ExpenseItem {
  serial_number: string;
  description: string;
  amount: number;
  date: string;
}

interface ExpensesReport {
  report_title: string;
  report_date: string;
  project_name: string;
  expenses: ExpenseItem[];
}

interface IncomeRow {
  id: string;
  serial_number: number;
  client_name: string | null;
  fund: string;
  description: string | null;
  payment_method: "cash" | "cheque" | "transfer" | "deposit" | "bank";
  income_date: string;
  amount: number;
  currency: string | null;
}

const incomeColumns: ColumnDef<IncomeRow>[] = [
  {
    accessorKey: "serial_number",
    header: "الرقم التسلسلي",
    cell: ({ getValue }) => (
      <span className="font-mono text-xs">#{getValue<number>()}</span>
    ),
  },
  {
    id: "name",
    header: "الاسم",
    accessorFn: (r) => r.client_name ?? r.fund,
  },
  {
    accessorKey: "description",
    header: "الوصف",
    cell: ({ getValue }) => getValue<string | null>() || "—",
  },
  {
    accessorKey: "payment_method",
    header: "طريقة الدفع",
    cell: ({ getValue }) =>
      translatePaymentMethod(getValue<IncomeRow["payment_method"]>()),
  },
  {
    accessorKey: "income_date",
    header: "التاريخ",
    cell: ({ getValue }) => formatDate(getValue<string>()),
  },
  {
    accessorKey: "amount",
    header: "المبلغ",
    cell: ({ row }) => (
      <span className="font-medium whitespace-nowrap">
        {formatCurrency(row.original.amount, row.original.currency ?? "LYD")}
      </span>
    ),
  },
];

type SectionKey = "expenses" | "maps" | "refunds";
type RangeKey = SectionKey | "incomes";

const EMPTY_DRAFT = { from: "", to: "" };
// Stable fallback so the visibleIncomes memo doesn't recompute every render.
const EMPTY_INCOMES: IncomeRow[] = [];

const RangeControls = ({
  draft,
  applied,
  onChange,
  onApply,
  onClear,
}: {
  draft: { from: string; to: string };
  applied: SerialRange | null;
  onChange: (draft: { from: string; to: string }) => void;
  onApply: () => void;
  onClear: () => void;
}) => (
  <div className="flex flex-shrink-0 items-center gap-2 text-sm text-gray-700">
    <span>من #</span>
    <input
      type="number"
      min={0}
      value={draft.from}
      onChange={(e) => onChange({ ...draft, from: e.target.value })}
      className="w-20 rounded border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
    <span>إلى #</span>
    <input
      type="number"
      min={0}
      value={draft.to}
      onChange={(e) => onChange({ ...draft, to: e.target.value })}
      className="w-20 rounded border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
    <Button type="button" size="sm" variant="primary" onClick={onApply}>
      بحث
    </Button>
    {applied && (
      <>
        <Button type="button" size="sm" variant="secondary" onClick={onClear}>
          مسح
        </Button>
      </>
    )}
  </div>
);

const SECTIONS: {
  key: SectionKey;
  title: string;
  reportTitle: string;
  searchReportTitle: string;
}[] = [
  {
    key: "expenses",
    title: "المصروفات",
    reportTitle: "تقرير المصروفات غير الموزعة",
    searchReportTitle: "تقرير المصروفات",
  },
  {
    key: "maps",
    title: "الخرائط",
    reportTitle: "تقرير الخرائط غير الموزعة",
    searchReportTitle: "تقرير الخرائط",
  },
  {
    key: "refunds",
    title: "الاسترداد",
    reportTitle: "تقرير الاسترداد غير الموزع",
    searchReportTitle: "تقرير الاسترداد",
  },
];

const serialOf = (row: UndistributedExpensePaymentRow) =>
  row.expenseSerial ?? row.paymentSerial;

const BookProjectUndistributedExpenseTab = ({
  projectId,
}: {
  projectId: string;
}) => {
  const { can: canPrintRange } = useCan(
    "print_project_expense_range",
    projectId,
  );
  const [drafts, setDrafts] = useState<
    Record<RangeKey, { from: string; to: string }>
  >({
    expenses: EMPTY_DRAFT,
    maps: EMPTY_DRAFT,
    refunds: EMPTY_DRAFT,
    incomes: EMPTY_DRAFT,
  });
  const [applied, setApplied] = useState<Record<RangeKey, SerialRange | null>>({
    expenses: null,
    maps: null,
    refunds: null,
    incomes: null,
  });
  const sectionRanges: SectionRanges | null = canPrintRange
    ? {
        expenses: applied.expenses,
        maps: applied.maps,
        refunds: applied.refunds,
      }
    : null;
  const { rows, loading, error } = useUndistributedExpensePayments(
    projectId,
    sectionRanges,
  );
  const [collapsed, setCollapsed] = useState<Record<RangeKey, boolean>>({
    expenses: false,
    maps: false,
    refunds: false,
    incomes: false,
  });
  const toggle = (key: RangeKey) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  const [printError, setPrintError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<SectionKey | "incomes" | null>(null);
  const projectName = useProjectName(projectId);
  const incomes = useProjectIncomes(projectId);
  // Same rule as the income tab: holding this permission means refund-only.
  const { can: restrictToRefunds, loading: incomePermissionLoading } = useCan(
    "view_project_finance_income",
  );

  const applyRange = (key: RangeKey) => {
    const f = drafts[key].from === "" ? null : Number(drafts[key].from);
    const t = drafts[key].to === "" ? null : Number(drafts[key].to);
    setApplied((prev) => ({
      ...prev,
      [key]: f == null && t == null ? null : { from: f, to: t },
    }));
  };
  const clearRange = (key: RangeKey) => {
    setDrafts((prev) => ({ ...prev, [key]: EMPTY_DRAFT }));
    setApplied((prev) => ({ ...prev, [key]: null }));
  };

  const incomesRange = canPrintRange ? applied.incomes : null;
  const incomeInRange = (serial: number) =>
    !incomesRange ||
    ((incomesRange.from == null || serial >= incomesRange.from) &&
      (incomesRange.to == null || serial <= incomesRange.to));

  const visibleIncomes = useMemo(
    () =>
      incomes.filter(
        (i) =>
          incomeInRange(i.serial_number) &&
          (!(incomePermissionLoading || restrictToRefunds) ||
            i.fund === "refund"),
      ),
    [incomes, incomesRange, restrictToRefunds, incomePermissionLoading],
  );

  const sections = useMemo(
    () => ({
      expenses: rows.filter(
        (r) => r.logType === "expense" && r.expenseType !== "maps",
      ),
      maps: rows.filter(
        (r) => r.logType === "expense" && r.expenseType === "maps",
      ),
      refunds: rows.filter((r) => r.logType === "refund"),
    }),
    [rows],
  );

  const handlePrint = async (key: SectionKey, reportTitle: string) => {
    const sectionRows = sections[key];
    const report: ExpensesReport = {
      report_title: reportTitle,
      report_date: new Date().toISOString().slice(0, 10),
      project_name: projectName,
      expenses: sectionRows.map((row) => ({
        serial_number: serialOf(row) != null ? String(serialOf(row)) : "",
        description:
          row.logType === "refund"
            ? `استرداد: ${row.expenseDescription ?? ""}`.trim()
            : (row.expenseDescription ?? ""),
        amount: row.paymentAmount ?? 0,
        date: (row.paymentDate ?? row.expenseDate ?? row.createdAt).slice(
          0,
          10,
        ),
      })),
    };

    setPrinting(key);
    setPrintError(null);
    try {
      const response = await fetchManagementApi(
        "/api/v1/egc/management/expenses/pdf",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(report),
        },
      );

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error("Error generating undistributed expenses PDF:", err);
      setPrintError(
        "فشل إنشاء التقرير: " +
          (err instanceof Error ? err.message : "خطأ غير معروف"),
      );
    } finally {
      setPrinting(null);
    }
  };

  const handlePrintIncomes = async () => {
    setPrinting("incomes");
    setPrintError(null);
    try {
      const response = await fetchManagementApi(
        "/api/v1/egc/management/incomes-list/pdf",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_name: projectName,
            report_date: new Date().toLocaleDateString("ar-LY"),
            incomes: visibleIncomes.map((i) => ({
              name: i.client_name ?? i.fund ?? "—",
              serial_number: String(i.serial_number),
              description: i.description ?? "",
              method: i.payment_method,
              date: i.income_date,
              amount: Number(i.amount),
            })),
            total_amount:
              Math.round(
                visibleIncomes.reduce((sum, i) => sum + Number(i.amount), 0) *
                  100,
              ) / 100,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error("Error generating incomes PDF:", err);
      setPrintError(
        "فشل إنشاء التقرير: " +
          (err instanceof Error ? err.message : "خطأ غير معروف"),
      );
    } finally {
      setPrinting(null);
    }
  };

  if (loading && rows.length === 0)
    return <div className="p-4 text-gray-500">جاري التحميل...</div>;
  if (error)
    return (
      <div className="p-4 text-red-600">
        خطأ في تحميل المدفوعات: {error.message}
      </div>
    );

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        المصروفات التي تحتوي على مدفوعات ونسب غير موزعة
      </p>
      {printError && <p className="text-sm text-red-600">{printError}</p>}
      {SECTIONS.map(({ key, title, reportTitle, searchReportTitle }) => (
        <section
          key={key}
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => toggle(key)}
              aria-expanded={!collapsed[key]}
              className="flex items-center gap-2 font-semibold text-gray-900"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  collapsed[key] ? "-rotate-90" : ""
                }`}
              />
              {title} ({sections[key].length})
            </button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={printing === key}
              disabled={sections[key].length === 0 || printing !== null}
              onClick={() =>
                handlePrint(key, applied[key] ? searchReportTitle : reportTitle)
              }
            >
              <Printer className="h-4 w-4" />
              طباعة
            </Button>
          </div>
          <div className={collapsed[key] ? "hidden" : undefined}>
            <GenericTable<UndistributedExpensePaymentRow>
              data={sections[key]}
              columns={undistributedExpensePaymentsColumns}
              enableFiltering
              showGlobalFilter
              enableSorting
              enablePagination
              searchAdornment={
                canPrintRange
                  ? () => (
                      <RangeControls
                        draft={drafts[key]}
                        applied={applied[key]}
                        onChange={(d) =>
                          setDrafts((prev) => ({ ...prev, [key]: d }))
                        }
                        onApply={() => applyRange(key)}
                        onClear={() => clearRange(key)}
                      />
                    )
                  : undefined
              }
              emptyMessage="لا توجد بيانات لعرضها."
            />
          </div>
        </section>
      ))}
      <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => toggle("incomes")}
            aria-expanded={!collapsed.incomes}
            className="flex items-center gap-2 font-semibold text-gray-900"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                collapsed.incomes ? "-rotate-90" : ""
              }`}
            />
            الإيرادات ({visibleIncomes.length})
          </button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={printing === "incomes"}
            disabled={visibleIncomes.length === 0 || printing !== null}
            onClick={handlePrintIncomes}
          >
            <Printer className="h-4 w-4" />
            طباعة
          </Button>
        </div>
        <div className={collapsed.incomes ? "hidden" : undefined}>
          <GenericTable<IncomeRow>
            data={visibleIncomes}
            columns={incomeColumns}
            enableFiltering
            showGlobalFilter
            enableSorting
            enablePagination
            searchAdornment={
              canPrintRange
                ? () => (
                    <RangeControls
                      draft={drafts.incomes}
                      applied={applied.incomes}
                      onChange={(d) =>
                        setDrafts((prev) => ({ ...prev, incomes: d }))
                      }
                      onApply={() => applyRange("incomes")}
                      onClear={() => clearRange("incomes")}
                    />
                  )
                : undefined
            }
            emptyMessage="لا توجد إيرادات لعرضها."
          />
        </div>
      </section>
    </div>
  );
};

export default BookProjectUndistributedExpenseTab;

function useProjectName(projectId: string) {
  const { data } = useQuery({
    queryKey: ["finance", "book-project", projectId, "name"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data?.name ?? null;
    },
  });
  return data || "مشروع غير معروف";
}

function useProjectIncomes(projectId: string) {
  const { data } = useQuery({
    queryKey: ["finance", "book-project", projectId, "incomes"],
    queryFn: async (): Promise<IncomeRow[]> => {
      const { data, error } = await supabase
        .from("project_incomes")
        .select(
          "id, serial_number, client_name, fund, description, payment_method, income_date, amount, currency",
        )
        .eq("project_id", projectId)
        .order("serial_number", { ascending: true });
      if (error) {
        console.error("Error fetching project incomes:", error);
        throw error;
      }
      return data ?? [];
    },
    ...TIERS.C,
  });
  return data ?? EMPTY_INCOMES;
}
