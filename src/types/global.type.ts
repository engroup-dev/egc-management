// types/database.ts
import { Database, Tables } from "../lib/supabase";

export type Currency = Database["public"]["Enums"]["currency_type"];

export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type ExpenseType = Database["public"]["Enums"]["expense_type"];
export type Phase = Database["public"]["Enums"]["phase_type"];
export type ExpenseStatus = Database["public"]["Enums"]["expense_status"];

/**
 * ✅ IMPORTANT:
 * Your schema shows some columns as USER-DEFINED (enums/domains).
 * If your Supabase generated types include them under Database["public"]["Enums"],
 * you should use them.
 *
 * If NOT, you can safely fallback to union literals ("bank" | "cash").
 */

// ------------------------------------------------------------
// Core entity types
// ------------------------------------------------------------
export type Clients = Tables<"clients">;
export type Specialities = Tables<"specialities">;
export type Specializations = Tables<"specialities">;
export type Contractors = Tables<"contractors">;
export type ContractorSpecialities = Tables<"contractor_specialities">;
export type VendorSpecialities = Tables<"vendor_specialities">;
export type EmployeeSpecialities = Tables<"employee_specialities">;

export type Projects = Tables<"projects">;
export type Employees = Tables<"employees">;
export type EmployeeCertifications = Tables<"employee_certifications">;
export type EmployeesDocuments = Tables<"employee_documents">;
export type ProjectIncome = Tables<"project_incomes">;
export type ProjectRefund = Tables<"project_refund">;
export type ProjectExpenses = Tables<"project_expenses">;
export type Account = Tables<"accounts">;
export type Users = Tables<"users">;
export type Roles = Tables<"roles">;
export type Company = Tables<"company">;
export type Payroll = Tables<"payroll">;
export type Vendor = Tables<"vendors">;
export type expenses = Tables<"expenses">;
export type ProjectMaps = Tables<"project_maps">;

// company
export type CompanyExpense = Tables<"company_expense">;
export type CompanyExpensePayments = Tables<"company_expense_payments">;
export type CompanyAccount = Tables<"company_account">;

// Additional
export type ExpensePayments = Tables<"expense_payments">;
export type ProjectRoles = Tables<"project_roles">;
export type ProjectBalances = Tables<"project_balances">;
export type ProjectPercentage = Tables<"project_percentage">;
export type ProjectPercentageLogs = Tables<"project_percentage_logs">;
export type UserRoles = Tables<"user_roles">;
export type MapType = Tables<"map_types">;
export type DrawingFolder = Database["drawings"]["Tables"]["folders"]["Row"];
export type DrawingVersion = Database["drawings"]["Tables"]["versions"]["Row"];
export type DrawingNotice = Database["drawings"]["Tables"]["notices"]["Row"];
export type DrawingAccess = Database["drawings"]["Tables"]["access"]["Row"];
export type Bank = Database["lookups"]["Tables"]["banks"]["Row"];
export type Attachments = Tables<"attachments">;

export type ProjectPercentagePeriods = Tables<"project_percentage_periods">;

//shops
export type Divisions = Tables<"shop_divisions">;
export type Categories = Tables<"shop_categories">;
export type Subcategories = Tables<"shop_subcategories">;
export type Products = Tables<"shop_products">;
export type ProductSizes = Tables<"shop_product_sizes">;
export type Orders = Tables<"shop_orders">;

// ------------------------------------------------------------
// ✅ NEW: Types for PercentageDistribution periods
// ------------------------------------------------------------

/**
 * This matches what you insert into project_percentage_periods.type.
 * If your DB enum exists in generated types, use it.
 * Otherwise keep the literal union.
 */
export type PercentagePeriodType =
  | (Database["public"]["Enums"] extends { percentage_period_type: infer T }
      ? T
      : never)
  | "bank"
  | "cash";

/**
 * Mode used in code when writing items to a period.
 */
export type DistributionMode = "bank" | "cash" | "both";

/**
 * Strong typed period rows returned from inserts/selects.
 * (This replaces `any` for bankPeriodData / cashPeriodData)
 */
export type ProjectPercentagePeriodRow = ProjectPercentagePeriods;

/**
 * Helpers for your function variables:
 */
export type BankPeriodData = ProjectPercentagePeriodRow | null;
export type CashPeriodData = ProjectPercentagePeriodRow | null;

// ------------------------------------------------------------
// UI types
// ------------------------------------------------------------
export type ButtonVariant =
  | "primary"
  | "primary-light"
  | "primary-outline"
  | "secondary"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "ghost"
  | "muted";

export type AttachmentDraft = {
  file: File;
  title: string;
  preview?: string;
};
