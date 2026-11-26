import { useState } from "react";
import { useAuth } from "../../../../hooks/useAuth";
import { supabase } from "../../../../lib/supabaseClient";
import Button from "../../../ui/Button";
import { ContractPayment } from "../../../../types/contracts.type";

interface ContractPaymentActionsCellProps {
  payment: ContractPayment;
  onRefresh?: () => void;
}

const ContractPaymentActionsCell = ({
  payment,
  onRefresh,
}: ContractPaymentActionsCellProps) => {
  const { user } = useAuth();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isPending = payment.status === "pending";

  // Approve / decline only the payment exactly as it was loaded: still
  // pending, and not edited in the field app since (an edit sets
  // updated_at). Otherwise nothing is written and the approver is told to
  // reopen it, so no one approves an amount they haven't seen.
  function decide(fields: Record<string, unknown>) {
    let query = supabase
      .schema("contracts")
      .from("payments")
      .update(fields)
      .eq("id", payment.id)
      .eq("status", "pending");
    query = payment.updated_at ? query.eq("updated_at", payment.updated_at) : query.is("updated_at", null);
    return query.select("id");
  }

  function staleNotice() {
    setNotice("تم تعديل الدفعة أو البت فيها بعد فتحها — أعد فتحها وراجعها");
    onRefresh?.();
  }

  async function handleAccept() {
    if (!user?.id) return;
    setBusy("accept");
    try {
      const { data, error } = await decide({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      });
      if (error) throw error;
      if (!data?.length) return staleNotice();

      if (payment.method === "bank" && !payment.contractor?.bank_account_aproved) {
        const contractorBankUpdate: { bank_name?: string; bank_number?: string } =
          {};
        if (payment.bank_name) contractorBankUpdate.bank_name = payment.bank_name;
        if (payment.bank_number)
          contractorBankUpdate.bank_number = payment.bank_number;

        if (Object.keys(contractorBankUpdate).length > 0) {
          const { error: contractorError } = await supabase
            .from("contractors")
            .update(contractorBankUpdate)
            .eq("id", payment.contractor_id);
          if (contractorError) {
            console.error(
              "Error updating contractor bank info:",
              contractorError,
            );
          }
        }
      }

      onRefresh?.();
    } catch (err) {
      console.error("Error approving payment:", err);
    } finally {
      setBusy(null);
    }
  }

  async function handleDecline() {
    setBusy("decline");
    try {
      const { data, error } = await decide({ status: "declined" });
      if (error) throw error;
      if (!data?.length) return staleNotice();
      onRefresh?.();
    } catch (err) {
      console.error("Error declining payment:", err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {notice && <p className="text-xs text-red-700 text-center max-w-[220px]">{notice}</p>}
      <div className="flex items-center justify-center gap-2">
        <Button
          type="button"
          variant="success"
          size="xs"
          disabled={!isPending}
          loading={busy === "accept"}
          onClick={handleAccept}
        >
          قبول
        </Button>
        <Button
          type="button"
          variant="error"
          size="xs"
          disabled={!isPending}
          loading={busy === "decline"}
          onClick={handleDecline}
        >
          رفض
        </Button>
      </div>
    </div>
  );
};

export default ContractPaymentActionsCell;
