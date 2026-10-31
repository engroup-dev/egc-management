import { useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import GenericTable from "../tables/table";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Dialog from "../ui/Dialog";
import LoadingPage from "../ui/LoadingPage";
import ErrorPage from "../ui/errorPage";
import ColumnFiltersDialog, { optionsOf } from "../tables/filters/ColumnFiltersDialog";
import {
  agreementErrorMessage,
  attachmentUrl,
  useCancelPenalty,
  usePenalties,
} from "../../hooks/agreements/useAgreements";
import { useAuthUserId } from "../../hooks/permissions/useCan";
import { lengthError } from "../../utils/agreements/rules";
import LimitedField from "./LimitedField";
import type { PenaltyDisplayStatus, PenaltyRow } from "../../types/agreements.types";
import { PENALTY_STATUS } from "../../utils/agreements/versions";
import { formatCurrency, formatDate } from "../../utils/helpper";
import PenaltyFormDialog from "./PenaltyFormDialog";

// Penalties, two ways:
//  - on a project page (projectId set): that project's penalties + "new"
//  - in the payments queue (projectId null): every project's
// A penalty counts as soon as it's saved; a wrong one can be cancelled
// (with a reason) until a payment deducts it — by whoever recorded it, or
// by anyone who may add penalties on the project / the payments queue
// (canCancelAny; the DB makes the final call).

type Props = {
  projectId: string | null;
  /** Project page: show the "new penalty" button. */
  canCreate?: boolean;
  /** Project tab (create_contractor_penalty) or payments queue: may cancel anyone's (not only their own). */
  canCancelAny?: boolean;
};

export default function PenaltiesTable({ projectId, canCreate, canCancelAny = false }: Props) {
  const { data, isLoading, error } = usePenalties(projectId);
  const { userId } = useAuthUserId();
  const [newOpen, setNewOpen] = useState(false);
  const [cancelling, setCancelling] = useState<PenaltyRow | null>(null);
  const rows = data ?? [];

  const columns = useMemo<ColumnDef<PenaltyRow, unknown>[]>(
    () => [
      {
        id: "contractor",
        header: "المقاول",
        filterFn: "equalsString",
        accessorFn: (r) => r.contractor_name ?? "",
        cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
      },
      ...(projectId
        ? []
        : [
            {
              id: "project",
              header: "المشروع",
              filterFn: "equalsString",
              accessorFn: (r: PenaltyRow) => r.project_name,
            } as ColumnDef<PenaltyRow, unknown>,
          ]),
      {
        accessorKey: "amount",
        header: "المبلغ",
        cell: ({ getValue }) => (
          <span className="font-semibold text-red-700">{formatCurrency(Number(getValue()))}</span>
        ),
      },
      { accessorKey: "reason", header: "السبب" },
      {
        // the evidence, before accept / decline
        id: "photos",
        header: "الصور",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.attachments?.length ? (
            <div className="flex gap-1">
              {row.original.attachments.map((a) => {
                const url = attachmentUrl(a.file_path);
                return (
                  <a key={a.file_path} href={url} target="_blank" rel="noreferrer" title="فتح الصورة">
                    <img src={url} alt="" className="h-10 w-10 rounded object-cover border" />
                  </a>
                );
              })}
            </div>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          ),
      },
      {
        id: "status",
        header: "الحالة",
        filterFn: "equalsString",
        accessorFn: (r) => r.display_status,
        cell: ({ row }) => {
          const s = PENALTY_STATUS[row.original.display_status];
          return (
            <div className="flex flex-col gap-0.5">
              <Badge label={s.label} variant={s.variant} />
              {row.original.display_status === "deducted" && row.original.payment_number && (
                <span className="text-xs text-gray-500">من الدفعة رقم {row.original.payment_number}</span>
              )}
              {row.original.display_status === "cancelled" && row.original.cancel_reason && (
                <span className="text-xs text-gray-500" title={row.original.cancel_reason}>
                  {row.original.cancelled_by_name ?? "—"}: {row.original.cancel_reason}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "created_by",
        header: "سجّلها",
        filterFn: "equalsString",
        accessorFn: (r) => r.created_by_name ?? "",
      },
      {
        accessorKey: "created_at",
        header: "التاريخ",
        cell: ({ getValue }) => formatDate(getValue<string>()),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.display_status === "due" && (canCancelAny || row.original.created_by === userId) ? (
            <Button type="button" variant="error" size="xs" onClick={() => setCancelling(row.original)}>
              إلغاء
            </Button>
          ) : null,
      },
    ],
    [projectId, canCancelAny, userId],
  );

  if (isLoading) return <LoadingPage />;
  if (error) return <ErrorPage error={(error as Error).message} />;

  return (
    <div className="space-y-4">
      {canCreate && projectId && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">الغرامات</h2>
            <p className="text-sm text-gray-500">
              تُخصم تلقائياً من أول دفعة للمقاول في المشروع، ويمكن إلغاؤها قبل ذلك
            </p>
          </div>
          <Button type="button" variant="error" onClick={() => setNewOpen(true)}>
            <Plus className="w-4 h-4 ml-1" /> غرامة جديدة
          </Button>
        </div>
      )}

      <GenericTable<PenaltyRow>
        data={rows}
        columns={columns}
        enableSorting
        enableFiltering
        enablePagination
        showGlobalFilter
        pageSize={10}
        emptyMessage="لا توجد غرامات."
        searchAdornment={(table) => (
          <ColumnFiltersDialog
            table={table}
            filters={[
              {
                columnId: "status",
                label: "الحالة",
                options: (Object.keys(PENALTY_STATUS) as PenaltyDisplayStatus[]).map((s) => ({
                  value: s,
                  label: PENALTY_STATUS[s].label,
                })),
              },
              ...(projectId
                ? []
                : [{ columnId: "project", label: "المشروع", options: optionsOf(rows.map((r) => r.project_name)) }]),
              { columnId: "contractor", label: "المقاول", options: optionsOf(rows.map((r) => r.contractor_name)) },
              { columnId: "created_by", label: "سجّلها", options: optionsOf(rows.map((r) => r.created_by_name)) },
            ]}
          />
        )}
      />

      {projectId && <PenaltyFormDialog projectId={projectId} isOpen={newOpen} onClose={() => setNewOpen(false)} />}
      {cancelling && <CancelPenaltyDialog penalty={cancelling} onClose={() => setCancelling(null)} />}
    </div>
  );
}

function CancelPenaltyDialog({ penalty, onClose }: { penalty: PenaltyRow; onClose: () => void }) {
  const cancel = useCancelPenalty();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const missing = lengthError(reason, "cancelReason");

  return (
    <Dialog isOpen onClose={onClose}>
      <div dir="rtl" className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">إلغاء الغرامة</h2>
          <p className="text-sm text-gray-500 mt-1">
            {penalty.contractor_name ?? "—"} · {formatCurrency(penalty.amount)} · {penalty.reason}
          </p>
        </div>
        <LimitedField
          limit="cancelReason"
          label="سبب الإلغاء"
          rows={3}
          value={reason}
          onChange={setReason}
          placeholder="مثال: سُجلت على المقاول الخطأ"
          autoFocus
        />
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-gray-500">{missing ?? ""}</span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              رجوع
            </Button>
            <Button
              type="button"
              variant="error"
              disabled={!!missing}
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(
                  { penaltyId: penalty.id, reason },
                  { onSuccess: onClose, onError: (err) => setError(agreementErrorMessage(err)) },
                )
              }
            >
              تأكيد الإلغاء
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
