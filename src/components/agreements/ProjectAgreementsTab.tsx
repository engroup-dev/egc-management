import { useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import GenericTable from "../tables/table";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import LoadingPage from "../ui/LoadingPage";
import ErrorPage from "../ui/errorPage";
import ColumnFiltersDialog, { optionsOf } from "../tables/filters/ColumnFiltersDialog";
import { useProjectAgreements, useProjectOldMoney } from "../../hooks/agreements/useAgreements";
import RefreshingBadge from "../ui/RefreshingBadge";
import { useAuthUserId, useCan } from "../../hooks/permissions/useCan";
import type { AgreementSummary } from "../../types/agreements.types";
import { formatCurrency, formatDate } from "../../utils/helpper";
import AgreementDetailDialog from "./AgreementDetailDialog";
import AgreementFormDialog from "./AgreementFormDialog";

// The project's agreements with contractors. Click a row to open it (pay,
// edit, versions). Without view_all_project_agreements you see only the
// ones you created. Contractors who took money here before agreements
// existed (as project expenses) show as cards above the table: paying
// them again needs an agreement, created from the card.

type Scope = "all" | "mine";

const STATE_LABEL: Record<string, string> = {
  pending: "دفعة قيد الانتظار",
  open: "مفتوحة",
  paid: "مدفوعة بالكامل",
};

function stateOf(a: AgreementSummary) {
  return a.has_pending ? "pending" : a.remaining <= 0 ? "paid" : "open";
}

export default function ProjectAgreementsTab({ projectId }: { projectId: string }) {
  const { userId } = useAuthUserId();
  const { can: canSeeAll } = useCan("view_all_project_agreements", projectId);
  const { can: canEdit } = useCan("edit_project_agreements", projectId);
  const { can: canPenalty } = useCan("create_contractor_penalty", projectId);
  const oldMoney = useProjectOldMoney(projectId);
  const [presetContractor, setPresetContractor] = useState<{ id: string; name: string | null } | null>(null);
  const { data, isLoading, isFetching, error } = useProjectAgreements(projectId);
  const [scope, setScope] = useState<Scope>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const effectiveScope: Scope = canSeeAll ? scope : "mine";
  const rows = useMemo(
    () => (data ?? []).filter((a) => effectiveScope === "all" || a.created_by === userId),
    [data, effectiveScope, userId],
  );

  const columns = useMemo<ColumnDef<AgreementSummary, unknown>[]>(
    () => [
      {
        accessorKey: "title",
        header: "العنوان",
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        id: "contractor",
        header: "المقاول",
        filterFn: "equalsString",
        accessorFn: (r) => r.contractor_name ?? "",
      },
      {
        accessorKey: "total",
        header: "الإجمالي",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
      },
      {
        accessorKey: "paid",
        header: "المدفوع",
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
      },
      {
        accessorKey: "remaining",
        header: "المتبقي",
        cell: ({ getValue }) => (
          <span className="font-semibold text-blue-800">{formatCurrency(Number(getValue()))}</span>
        ),
      },
      {
        id: "state",
        header: "الحالة",
        filterFn: "equalsString",
        accessorFn: stateOf,
        cell: ({ row }) => {
          const s = stateOf(row.original);
          return (
            <div className="flex gap-1">
              <Badge
                label={STATE_LABEL[s]}
                variant={s === "pending" ? "warning" : s === "paid" ? "success" : "default"}
              />
              {row.original.current_version > 1 && (
                <Badge label={`إصدار ${row.original.current_version}`} variant="info" />
              )}
            </div>
          );
        },
      },
      {
        id: "created_by",
        header: "أنشأها",
        filterFn: "equalsString",
        accessorFn: (r) => r.created_by_name ?? "",
      },
      {
        accessorKey: "created_at",
        header: "التاريخ",
        cell: ({ getValue }) => formatDate(getValue<string>()),
      },
    ],
    [],
  );

  if (isLoading) return <LoadingPage />;
  if (error) return <ErrorPage error={(error as Error).message} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-gray-900">الاتفاقيات</h2>
            <RefreshingBadge show={isFetching && !isLoading} />
          </div>
          <p className="text-sm text-gray-500">اتفاقيات المقاولين في هذا المشروع والدفعات عليها</p>
        </div>
        <div className="flex items-center gap-3">
          {canSeeAll && (
            <div className="flex rounded-lg bg-gray-100 p-1 text-sm">
              {(
                [
                  { value: "all", label: "كل الاتفاقيات" },
                  { value: "mine", label: "اتفاقياتي" },
                ] as const
              ).map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setScope(s.value)}
                  className={`px-3 py-1.5 rounded-md font-medium transition ${
                    scope === s.value ? "bg-white text-primary shadow-sm" : "text-gray-600"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <Button
            type="button"
            onClick={() => {
              setPresetContractor(null);
              setNewOpen(true);
            }}
          >
            <Plus className="w-4 h-4 ml-1" /> اتفاقية جديدة
          </Button>
        </div>
      </div>

      {(oldMoney.data?.contractors.length ?? 0) > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-gray-900">مقاولون استلموا مبالغ سابقاً</h3>
            <p className="text-sm text-gray-600">
              دُفع لهم في هذا المشروع كمصروفات قبل الاتفاقيات. لإضافة دفعة جديدة أنشئ لهم اتفاقية.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {oldMoney.data?.contractors.map((c) => (
              <div key={c.contractor_id} className="rounded-lg border border-amber-200 bg-white p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{c.contractor_name ?? "—"}</p>
                    {c.title_hint && <p className="text-xs text-gray-500 truncate">{c.title_hint}</p>}
                  </div>
                  <Badge label="مصروفات سابقة" variant="warning" />
                </div>
                <p className="text-sm text-gray-700">
                  استلم <span className="font-semibold">{formatCurrency(c.paid)}</span> في {c.payments_count} دفعات
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setPresetContractor({ id: c.contractor_id, name: c.contractor_name });
                    setNewOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 ml-1" /> إنشاء اتفاقية
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <GenericTable<AgreementSummary>
        data={rows}
        columns={columns}
        enableSorting
        enableFiltering
        enablePagination
        showGlobalFilter
        pageSize={10}
        onRowClick={(a) => setOpenId(a.id)}
        emptyMessage="لا توجد اتفاقيات بعد."
        searchAdornment={(table) => (
          <ColumnFiltersDialog
            table={table}
            filters={[
              { columnId: "contractor", label: "المقاول", options: optionsOf(rows.map((r) => r.contractor_name)) },
              {
                columnId: "state",
                label: "الحالة",
                options: Object.entries(STATE_LABEL).map(([value, label]) => ({ value, label })),
              },
              { columnId: "created_by", label: "أنشأها", options: optionsOf(rows.map((r) => r.created_by_name)) },
            ]}
          />
        )}
      />

      <AgreementDetailDialog
        projectId={projectId}
        agreementId={openId}
        onClose={() => setOpenId(null)}
        canEdit={canEdit}
        canPenalty={canPenalty}
        canPay={(createdBy) => canSeeAll || createdBy === userId}
      />
      <AgreementFormDialog
        projectId={projectId}
        isOpen={newOpen}
        onClose={() => setNewOpen(false)}
        presetContractor={presetContractor}
        onSaved={(id) => setOpenId(id)}
      />
    </div>
  );
}
