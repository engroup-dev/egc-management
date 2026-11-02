import { useMemo, useState } from "react";
import Tabs from "../../../components/ui/Tabs";
import GenericTable from "../../../components/tables/table";
import ErrorPage from "../../../components/ui/errorPage";
import LoadingPage from "../../../components/ui/LoadingPage";
import RefreshingBadge from "../../../components/ui/RefreshingBadge";
import Button from "../../../components/ui/Button";
import ContractorPaymentsFiltersDialog from "../../../components/tables/filters/ContractorPaymentsFiltersDialog";
import { useContractorPayments } from "../../../hooks/finance/payments/useContractorPayments";
import { useContractorPaymentsPdf } from "../../../hooks/finance/payments/useContractorPaymentsPdf";
import { getContractorPaymentsColumns } from "../../../components/tables/columns/ContractorPaymentsColumns";
import { ContractPayment } from "../../../types/contracts.type";
import ActivityFeed from "../../../components/logs/ActivityFeed";
import { useMyPermissions } from "../../../hooks/permissions/useCan";
import PenaltiesTable from "../../../components/agreements/PenaltiesTable";
import PaymentDetailsDialog from "../../../components/agreements/PaymentDetailsDialog";
import AgreementDetailDialog from "../../../components/agreements/AgreementDetailDialog";

// The history tab: who approved or declined each payment, and each
// penalty (penalties are approved on this page too).
const PAYMENT_LOGS = { logNames: ["contractor_payment", "contractor_penalty"] };

function uniqueSorted(values: (string | undefined | null)[]): string[] {
  return Array.from(
    new Set(values.filter((v): v is string => Boolean(v))),
  ).sort((a, b) => a.localeCompare(b, "ar"));
}

const ContractorPaymentsPage = () => {
  const { payments, loading, error, refetch, refreshing } =
    useContractorPayments();
  const {
    generate: generatePdf,
    loading: printing,
    error: printError,
  } = useContractorPaymentsPdf();
  const { data: myPermissions } = useMyPermissions();
  const canViewFinanceLogs = myPermissions?.has("view_finance_logs") ?? false;

  const [selectedPayments, setSelectedPayments] = useState<ContractPayment[]>(
    [],
  );
  const [clearSelectionSignal, setClearSelectionSignal] = useState(0);
  const [detailsPayment, setDetailsPayment] = useState<ContractPayment | null>(null);
  // Opened from the payments list: read-only here — paying and editing
  // happen from the project's agreements page under Operations.
  const [openAgreement, setOpenAgreement] = useState<{ id: string; projectId: string } | null>(null);

  const paymentsFilterOptions = useMemo(
    () => ({
      statuses: uniqueSorted(payments.map((p) => p.status)),
      projects: uniqueSorted(payments.map((p) => p.project?.name)),
      contractors: uniqueSorted(
        payments.map((p) =>
          p.contractor
            ? `${p.contractor.first_name} ${p.contractor.last_name ?? ""}`.trim()
            : p.new_contractor_name,
        ),
      ),
      employees: uniqueSorted(
        payments.map((p) =>
          p.created_by_employee
            ? `${p.created_by_employee.first_name} ${p.created_by_employee.last_name ?? ""}`.trim()
            : undefined,
        ),
      ),
    }),
    [payments],
  );

  if (loading) return <LoadingPage />;
  if (error) return <ErrorPage error={error.message} />;

  const pendingPaymentsCount = payments.filter(
    (p) => p.status === "pending",
  ).length;

  async function handlePrintSelected() {
    if (selectedPayments.length === 0) return;
    const success = await generatePdf(selectedPayments);
    if (success) {
      setSelectedPayments([]);
      setClearSelectionSignal((n) => n + 1);
    }
  }

  return (
    <div>
      <PaymentDetailsDialog
        payment={detailsPayment}
        onClose={() => setDetailsPayment(null)}
        onOpenAgreement={(id, projectId) => setOpenAgreement({ id, projectId })}
        onDecided={() => {
          setDetailsPayment(null);
          refetch();
        }}
      />
      <AgreementDetailDialog
        projectId={openAgreement?.projectId ?? ""}
        agreementId={openAgreement?.id ?? null}
        onClose={() => setOpenAgreement(null)}
        canEdit={false}
        canPay={() => false}
      />
      <Tabs
        tabs={[
          {
            id: "payments",
            label: "الدفعات",
            badge: pendingPaymentsCount,
            content: (
              <>
                <div className="px-6 pt-6">
                  <h1 className="text-2xl font-semibold text-gray-900">
                    مدفوعات المقاولين <RefreshingBadge show={refreshing} />
                  </h1>
                  <p className="text-sm text-gray-500 mt-1">
                    مراجعة دفعات المقاولين والموافقة عليها أو رفضها
                  </p>
                </div>

                {selectedPayments.length > 0 && (
                  <div className="mx-6 mt-4 flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
                    <span className="text-sm font-medium text-blue-800">
                      {selectedPayments.length} محدد
                    </span>
                    <div className="flex items-center gap-3">
                      {printError && (
                        <span className="text-sm text-red-600">
                          {printError}
                        </span>
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

                <GenericTable<ContractPayment>
                  data={payments}
                  columns={getContractorPaymentsColumns(refetch, {
                    onOpenDetails: setDetailsPayment,
                    onOpenAgreement: (id, projectId) => setOpenAgreement({ id, projectId }),
                  })}
                  enableSorting
                  enableFiltering
                  enablePagination
                  showGlobalFilter
                  enableRowSelection={true}
                  onRowSelectionChange={setSelectedPayments}
                  clearSelectionSignal={clearSelectionSignal}
                  emptyMessage="لا توجد دفعات لعرضها."
                  pageSize={10}
                  searchAdornment={(table) => (
                    <ContractorPaymentsFiltersDialog
                      table={table}
                      statusOptions={paymentsFilterOptions.statuses}
                      projectOptions={paymentsFilterOptions.projects}
                      contractorOptions={paymentsFilterOptions.contractors}
                      employeeOptions={paymentsFilterOptions.employees}
                    />
                  )}
                />
              </>
            ),
          },
          {
            // Recorded in the field app; they count right away and come
            // off the contractor's next payment in the same project. A
            // wrong one can be cancelled here until then.
            id: "penalties",
            label: "الغرامات",
            content: (
              <>
                <div className="px-6 pt-6">
                  <h1 className="text-2xl font-semibold text-gray-900">
                    غرامات المقاولين
                  </h1>
                  <p className="text-sm text-gray-500 mt-1">
                    تُخصم الغرامة تلقائياً من أول دفعة للمقاول في نفس المشروع، ويمكن إلغاؤها قبل ذلك
                  </p>
                </div>
                <div className="p-6">
                  <PenaltiesTable projectId={null} canCancelAny />
                </div>
              </>
            ),
          },
          ...(canViewFinanceLogs
            ? [
                {
                  id: "history",
                  label: "السجل",
                  content: (
                    <div className="p-6">
                      <h1 className="text-2xl font-semibold text-gray-900">
                        سجل الدفعات
                      </h1>
                      <p className="text-sm text-gray-500 mt-1 mb-4">
                        من وافق على كل دفعة أو رفضها، ومتى
                      </p>
                      <ActivityFeed filters={PAYMENT_LOGS} />
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
};

export default ContractorPaymentsPage;
