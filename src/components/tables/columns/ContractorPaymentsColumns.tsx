import { ColumnDef } from "@tanstack/react-table";
import { ContractPayment } from "../../../types/contracts.type";
import { formatCurrency, formatDate } from "../../../utils/helpper";
import { translatePaymentMethod, translateStatus } from "../../../utils/translations";
import { statusColor } from "../../../utils/colors/status";
import ContractPaymentActionsCell from "../actions/payments/ContractPaymentActionsCell";
import { Eye } from "lucide-react";

const toNum = (v: unknown) => (typeof v === "number" ? v : Number(v || 0));

export function getContractorPaymentsColumns(
  onRefresh?: () => void,
  handlers?: {
    /** The details panel: reason, agreement numbers, penalties, bank. */
    onOpenDetails?: (payment: ContractPayment) => void;
    onOpenAgreement?: (agreementId: string, projectId: string) => void;
  },
): ColumnDef<ContractPayment>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            aria-label="تحديد كل الدفعات المعتمدة الظاهرة"
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            checked={table.getIsAllPageRowsSelected()}
            className="w-4 h-4 rounded border-gray-300"
          />
        </div>
      ),
      cell: ({ row }) =>
        row.getCanSelect() ? (
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              aria-label={`تحديد الدفعة ${row.original.payments_number}`}
              onChange={row.getToggleSelectedHandler()}
              checked={row.getIsSelected()}
              className="w-4 h-4 rounded border-gray-300"
            />
          </div>
        ) : null,
      size: 32,
      enableSorting: false,
      enableColumnFilter: false,
    },
    {
      id: "contractor",
      header: "المقاول",
      filterFn: "equalsString",
      accessorFn: (row) =>
        row.contractor
          ? `${row.contractor.first_name ?? ""} ${row.contractor.last_name ?? ""}`.trim()
          : (row.new_contractor_name ?? ""),
      cell: ({ row }) => (
        <span className="font-medium whitespace-nowrap">
          {row.original.contractor
            ? `${row.original.contractor.first_name} ${row.original.contractor.last_name ?? ""}`
            : (row.original.new_contractor_name ?? "—")}
        </span>
      ),
    },
    {
      id: "project",
      header: "المشروع",
      filterFn: "equalsString",
      accessorFn: (row) => row.project?.name ?? "",
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {row.original.project?.name ?? "—"}
        </span>
      ),
    },
    {
      id: "agreement",
      header: "الاتفاقية",
      accessorFn: (row) => row.agreement?.title ?? "",
      cell: ({ row }) => {
        const agreement = row.original.agreement;
        return agreement ? (
          <button
            type="button"
            onClick={() =>
              handlers?.onOpenAgreement?.(agreement.id, row.original.project_id)
            }
            className="whitespace-nowrap text-blue-700 hover:underline"
            title="فتح الاتفاقية"
          >
            {agreement.title}
          </button>
        ) : (
          <span className="text-xs text-gray-400 whitespace-nowrap">بدون اتفاقية</span>
        );
      },
    },
    {
      accessorKey: "payments_reason",
      header: "سبب الدفعة",
      cell: ({ getValue }) => {
        const reason = getValue<string | null>();
        return reason ? (
          <span className="block max-w-[220px] truncate text-sm text-gray-700" title={reason}>
            {reason}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        );
      },
    },
    {
      accessorKey: "payments_number",
      header: "رقم الدفعة",
      cell: ({ getValue }) => (
        <span className="font-mono text-sm">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: "amount",
      header: "المبلغ",
      cell: ({ row }) => (
        <span className="font-medium whitespace-nowrap">
          {formatCurrency(toNum(row.original.amount), row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: "penalty_amount",
      header: "مبلغ الجزاء",
      cell: ({ row }) => {
        const amount = toNum(row.original.penalty_amount);
        return (
          <span className="whitespace-nowrap">
            {amount === 0
              ? "-"
              : formatCurrency(amount, row.original.currency)}
          </span>
        );
      },
    },
    {
      accessorKey: "grand_total",
      header: "الإجمالي الكلي",
      cell: ({ row }) => (
        <span className="font-semibold whitespace-nowrap">
          {formatCurrency(
            toNum(row.original.grand_total),
            row.original.currency,
          )}
        </span>
      ),
    },
    {
      accessorKey: "method",
      header: "طريقة الدفع",
      cell: ({ getValue }) => (
        <span>
          {translatePaymentMethod(
            getValue<"cash" | "cheque" | "transfer" | "deposit" | "bank">(),
          )}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "الحالة",
      filterFn: "equalsString",
      cell: ({ getValue, row }) => {
        const status = getValue<string>();
        const edits = row.original.edit_count ?? 0;
        return (
          <div className="flex flex-col items-center gap-1">
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusColor(status)}`}
            >
              {translateStatus(status)}
            </span>
            {edits > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap bg-amber-50 text-amber-800 border border-amber-200">
                معدّلة · {edits}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "created_at",
      header: "تاريخ الإنشاء",
      filterFn: "dateRangeFilter",
      cell: ({ getValue }) => (
        <span className="text-sm text-gray-600 whitespace-nowrap">
          {formatDate(getValue<string>())}
        </span>
      ),
    },
    {
      id: "created_by",
      header: "أنشئ بواسطة",
      filterFn: "equalsString",
      accessorFn: (row) =>
        `${row.created_by_employee?.first_name ?? ""} ${row.created_by_employee?.last_name ?? ""}`.trim(),
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {row.original.created_by_employee
            ? `${row.original.created_by_employee.first_name} ${row.original.created_by_employee.last_name ?? ""}`
            : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "الإجراءات",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-2">
          {handlers?.onOpenDetails && (
            <button
              type="button"
              onClick={() => handlers.onOpenDetails?.(row.original)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              title="تفاصيل الدفعة"
            >
              <Eye className="w-3.5 h-3.5" /> تفاصيل
            </button>
          )}
          <ContractPaymentActionsCell
            payment={row.original}
            onRefresh={onRefresh}
          />
        </div>
      ),
    },
  ];
}
