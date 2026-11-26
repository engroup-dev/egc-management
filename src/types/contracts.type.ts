import { Database } from "../lib/supabase";

type ContractPaymentRow = Database["contracts"]["Tables"]["payments"]["Row"];

type ContractorSummary = {
  id: string;
  first_name: string;
  last_name: string | null;
  whatsapp_number: string | null;
  phone_number: string | null;
  bank_account_aproved: boolean | null;
};

type ProjectSummary = {
  id: string;
  name: string;
};

type EmployeeSummary = {
  id: string;
  first_name: string;
  last_name: string | null;
};

type ExpenseSummary = {
  id: string;
  description: string | null;
  serial_number: number | null;
};

export interface ContractPayment extends ContractPaymentRow {
  /** Not in the generated row type yet (agreements, 2026-10-21). */
  agreement_id?: string | null;
  /** Times it was edited while pending, in the field app (2026-11-16). */
  edit_count?: number;
  /** The agreement it was paid against; null = an old quick payment.
   * total / version are the agreement as it stood when the payment was made. */
  agreement: {
    id: string;
    title: string;
    total: number;
    version: number;
    opening_paid: number;
  } | null;
  /** The penalties this payment deducted, one by one (empty = none, or the
   * payment was declined and they were given back). */
  penalties: { reason: string; amount: number }[];
  approved_by_employee: EmployeeSummary | null;
  contractor: ContractorSummary | null;
  project: ProjectSummary | null;
  created_by_employee: EmployeeSummary | null;
  expense: ExpenseSummary | null;
}

