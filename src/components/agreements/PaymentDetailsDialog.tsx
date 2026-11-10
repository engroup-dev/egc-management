import { FileSignature, FileText, Printer } from "lucide-react";
import Dialog from "../ui/Dialog";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import LoadingSpinner from "../ui/LoadingSpinner";
import ContractPaymentActionsCell from "../tables/actions/payments/ContractPaymentActionsCell";
import { useAgreementDetail } from "../../hooks/agreements/useAgreements";
import { useAgreementPdf } from "../../hooks/agreements/useAgreementPdf";
import type { ContractPayment } from "../../types/contracts.type";
import { currentItems, lineText, PAYMENT_STATUS } from "../../utils/agreements/versions";
import { formatCurrency, formatDate } from "../../utils/helpper";
import { translatePaymentMethod } from "../../utils/translations";
import AgreementAttachments from "./AgreementAttachments";

// =====================================================================
// One payment, everything the approver needs before accept / decline
// =====================================================================
// Why the money is being paid (the reason typed in the field), what it's
// paid against (the agreement: its total, what was paid before, what is
// left after this one, and its items), which penalties come off and why,
// and where the money goes. Accept / decline sit at the bottom.
// =====================================================================

type Props = {
  payment: ContractPayment | null;
  onClose: () => void;
  onOpenAgreement: (agreementId: string, projectId: string) => void;
  onDecided: () => void;
};

export default function PaymentDetailsDialog({ payment, onClose, onOpenAgreement, onDecided }: Props) {
  const agreementId = payment?.agreement_id ?? null;
  const { data: detail, isLoading } = useAgreementDetail(agreementId);
  const pdf = useAgreementPdf();

  if (!payment) return null;

  const status = PAYMENT_STATUS[payment.status] ?? { label: payment.status, variant: "default" as const };
  const contractorName = payment.contractor
    ? `${payment.contractor.first_name} ${payment.contractor.last_name ?? ""}`.trim()
    : (payment.new_contractor_name ?? "—");
  const amount = Number(payment.amount) || 0;
  const prev = Number(payment.prev_amount) || 0;
  const penalty = Number(payment.penalty_amount) || 0;
  const penaltyReasons = (payment.penalty_reason ?? "").split(" • ").filter(Boolean);
  const a = detail?.agreement;

  return (
    <Dialog isOpen onClose={onClose}>
      <div dir="rtl" className="space-y-5 max-h-[78vh] overflow-y-auto px-1">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">دفعة رقم {payment.payments_number}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {contractorName} · {payment.project?.name ?? "—"}
            </p>
          </div>
          <Badge label={status.label} variant={status.variant} />
        </div>

        <Section title="سبب الدفعة">
          {payment.payments_reason ? (
            <p className="text-gray-800 whitespace-pre-wrap">{payment.payments_reason}</p>
          ) : (
            <p className="text-gray-400">لم يُكتب سبب لهذه الدفعة</p>
          )}
        </Section>

        {agreementId ? (
          <Section
            title="الاتفاقية"
            action={
              a && (
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    variant="primary-outline"
                    disabled={!!pdf.loading}
                    onClick={() => detail && pdf.print("agreement", detail)}
                  >
                    <Printer className="w-3.5 h-3.5 ml-1" />
                    {pdf.loading === "agreement" ? "جاري التجهيز..." : "طباعة الاتفاقية"}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="primary-outline"
                    disabled={!!pdf.loading}
                    onClick={() => detail && pdf.print("full", detail)}
                  >
                    <FileText className="w-3.5 h-3.5 ml-1" />
                    {pdf.loading === "full" ? "جاري التجهيز..." : "الملف الكامل"}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="primary-outline"
                    onClick={() => onOpenAgreement(a.id, a.project_id)}
                  >
                    <FileSignature className="w-3.5 h-3.5 ml-1" /> فتح الاتفاقية
                  </Button>
                </div>
              )
            }
          >
            {isLoading || !a ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="space-y-3">
                <p className="font-medium text-gray-900">{a.title}</p>
                <div className="grid grid-cols-4 gap-2">
                  <Stat label="إجمالي الاتفاقية" value={a.total} />
                  <Stat label="المدفوع قبلها" value={prev} />
                  <Stat label="هذه الدفعة" value={amount} strong />
                  <Stat label="المتبقي بعدها" value={a.total - prev - amount} />
                </div>
                {pdf.error && (
                  <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{pdf.error}</p>
                )}
                <AgreementAttachments
                  agreementId={a.id}
                  attachments={detail?.attachments ?? []}
                  canAdd={false}
                />
                <details className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <summary className="cursor-pointer text-sm text-gray-600">
                    بنود الاتفاقية ({currentItems(detail.items).length})
                  </summary>
                  <table className="w-full text-sm mt-2">
                    <tbody>
                      {currentItems(detail.items).map((item, i) => (
                        <tr key={item.id} className="border-t border-gray-100">
                          <td className="py-1.5 w-6 text-gray-400">{i + 1}</td>
                          <td className="py-1.5">
                            {item.description}
                            <div className="text-xs text-gray-500">{lineText(item)}</div>
                          </td>
                          <td className="py-1.5 text-left whitespace-nowrap">{formatCurrency(item.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            )}
          </Section>
        ) : (
          <Section title="الاتفاقية">
            <p className="text-gray-400">دفعة قديمة — بدون اتفاقية</p>
            {payment.expense && (
              <p className="text-sm text-gray-600 mt-1">
                مرتبطة بالمصروف #{payment.expense.serial_number} {payment.expense.description ?? ""}
              </p>
            )}
          </Section>
        )}

        <Section title="الغرامات المخصومة">
          {penalty > 0 ? (
            <div className="space-y-1">
              {penaltyReasons.length > 0 ? (
                penaltyReasons.map((r, i) => (
                  <p key={i} className="text-sm text-gray-800">
                    • {r}
                  </p>
                ))
              ) : (
                <p className="text-sm text-gray-400">بدون سبب</p>
              )}
              <p className="text-sm font-semibold text-red-700">المجموع: −{formatCurrency(penalty)}</p>
            </div>
          ) : (
            <p className="text-gray-400">لا توجد غرامات على هذه الدفعة</p>
          )}
        </Section>

        <Section title="طريقة الدفع">
          <p className="text-gray-800">{translatePaymentMethod(payment.method)}</p>
          {payment.method === "bank" && (
            <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
              <Field label="البنك" value={payment.bank_name} />
              <Field label="رقم الحساب" value={payment.bank_number} />
              <Field label="صاحب الحساب" value={payment.bank_holder_name} />
            </div>
          )}
        </Section>

        <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3">
          <span className="text-sm font-medium text-gray-600">الصافي للمقاول</span>
          <span className="text-xl font-bold text-blue-800">{formatCurrency(amount - penalty)}</span>
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <span className="text-sm text-gray-500">
            أنشأها{" "}
            {payment.created_by_employee
              ? `${payment.created_by_employee.first_name} ${payment.created_by_employee.last_name ?? ""}`
              : "—"}{" "}
            · {formatDate(payment.created_at)}
          </span>
          {payment.status === "pending" && (
            <ContractPaymentActionsCell payment={payment} onRefresh={onDecided} />
          )}
        </div>
      </div>
    </Dialog>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-500">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`rounded-lg p-2.5 ${strong ? "bg-primary text-white" : "bg-gray-50 border border-gray-100"}`}>
      <div className={`text-xs ${strong ? "text-blue-100" : "text-gray-500"}`}>{label}</div>
      <div className="text-sm font-bold">{formatCurrency(value)}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg bg-gray-50 p-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-medium text-gray-800">{value || "—"}</div>
    </div>
  );
}
