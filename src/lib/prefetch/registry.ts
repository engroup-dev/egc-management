import type { FetchQueryOptions } from "@tanstack/react-query";
import { projectsListQueryOptions } from "../../hooks/useProjects";
import { contractorsQueryOptions } from "../../hooks/useContractors";
import { vendorsQueryOptions } from "../../hooks/useVendors";
import { banksQueryOptions } from "../../hooks/useBanks";
import { payrollQueryOptions } from "../../hooks/usePayroll";
import { allProjectTeamsQueryOptions } from "../../hooks/team/useAllProjectTeams";
import { projectRolesQueryOptions } from "../../hooks/team/useTeamAssignments";
import { projectRolesAdminQueryOptions } from "../../hooks/team/useProjectRolesAdmin";
import { departmentsQueryOptions } from "../../hooks/permissions/useDepartments";
import { jobRolesQueryOptions } from "../../hooks/permissions/useJobRoles";
import { distributionProjectsQueryOptions } from "../../hooks/company/useProjectDistributions";
import { unitsQueryOptions } from "../../hooks/agreements/useAgreements";
import { websiteCategoriesQueryOptions } from "../../hooks/website/useCategories";
import { websiteProjectsQueryOptions } from "../../hooks/website/useProjects";
import { heroSlidesQueryOptions } from "../../hooks/website/useHeroSlides";
import { shopCategoriesQueryOptions } from "../../hooks/shop/categories/useCategories";
import { shopDivisionsQueryOptions } from "../../hooks/shop/divisions/useDivisions";
import { shopSubcategoriesQueryOptions } from "../../hooks/shop/subcategories/useSubcategories";
import { shopProductsQueryOptions } from "../../hooks/shop/products/useProducts";
import { shopVendorsQueryOptions } from "../../hooks/shop/vendors/useVendors";
import { crmClientsQueryOptions } from "../../hooks/useClients";
import { settingsExpensesQueryOptions } from "../../hooks/settings/useExpenses";
import { settingsRolesQueryOptions } from "../../hooks/settings/useRoles";
import { specialitiesQueryOptions } from "../../hooks/useSpecializations";
import { employeeCountsBySpecializationQueryOptions } from "../../hooks/useEmployees";
import { hrEmployeesListQueryOptions } from "../../hooks/hr/useEmployeesList";
import { hrApplicantsQueryOptions } from "../../hooks/hr/useApplicants";
import { hrJobRequestsQueryOptions } from "../../hooks/hr/useJobRequests";
import { hrQuestionBankQueryOptions } from "../../hooks/hr/useQuestionBank";
import { hrScoringConfigQueryOptions } from "../../hooks/hr/useScoringConfig";
import { hrEvaluationConfigQueryOptions } from "../../hooks/hr/useEvaluationConfig";
import { companyExpensesQueryOptions } from "../../hooks/finance/useComapanyFinance";
import { notPaidExpensesQueryOptions } from "../../hooks/finance/payments/useNotPiadExpense";
import { contractorPaymentsQueryOptions } from "../../hooks/finance/payments/useContractorPayments";
import { pendingContractorPaymentsCountQueryOptions } from "../../hooks/finance/payments/usePendingContractorPaymentsCount";
import { financeOrdersQueryOptions } from "../../hooks/finance/orders/useFinanceOrders";
import { pendingOrdersCountQueryOptions } from "../../hooks/finance/orders/usePendingOrdersCount";
import { undistributedExpensePaymentsQueryOptions } from "../../hooks/finance/distribution/useUndistributedExpensePayments";
import { companyFinanceQueryOptions } from "../../hooks/company/useCompanyFinance";
import { distributionBatchesQueryOptions } from "../../hooks/company/useDistributionBatches";
import { projectsDistributeQueryOptions } from "../../hooks/projects/useProjectsDistribute";
import {
  openAccountNegativePeriodsQueryOptions,
  openProjectNegativePeriodsQueryOptions,
} from "../../hooks/projects/useProjectCounters";
import { boqTemplateTypesQueryOptions } from "../../hooks/operations/boq/useTemplateTypes";

// =====================================================================
// Every overview / list tab the background prefetcher warms after login.
//
// One entry per query, gated the same way the route is:
//   allOf — every one of these must be granted (section gates in App.tsx)
//   anyOf — at least one must be granted (the route's RequirePermission)
// Entries the user cannot open are skipped, so nothing hidden is loaded.
//
// Only queries whose key does not depend on UI state belong here — a
// filter- or page-keyed query would be warmed under a key the screen
// never asks for. Per-project screens other than the overview (team,
// drawings, BOQ, bookkeeping) load on first open and then persist.
// =====================================================================

export interface PrefetchEntry {
  allOf?: string[];
  anyOf?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: () => FetchQueryOptions<any, any, any, any>;
}

const PROJECT_LIST_VIEWERS = [
  "view_projects",
  "view_treasury",
  "view_bookkeeping",
  "view_operations_section",
  "view_shop_orders",
  "manage_execution",
];

export const PREFETCH_REGISTRY: PrefetchEntry[] = [
  // Projects — shared by ~8 list screens across sections.
  { anyOf: PROJECT_LIST_VIEWERS, options: projectsListQueryOptions },

  // Supply chain
  { anyOf: ["view_contractors"], options: contractorsQueryOptions },
  { anyOf: ["view_vendors"], options: vendorsQueryOptions },

  // Execution management
  {
    allOf: ["view_execution_section"],
    anyOf: ["view_all_project_teams"],
    options: allProjectTeamsQueryOptions,
  },
  {
    anyOf: ["view_all_project_teams", "manage_project_roles", "manage_project_team"],
    options: projectRolesQueryOptions,
  },

  // Company (money)
  { allOf: ["view_company_section"], anyOf: ["view_own_salary"], options: payrollQueryOptions },
  {
    allOf: ["view_company_section"],
    anyOf: ["view_distribution"],
    options: distributionProjectsQueryOptions,
  },

  // Settings
  {
    allOf: ["view_settings_section"],
    anyOf: ["manage_reference_data"],
    options: banksQueryOptions,
  },
  {
    allOf: ["view_settings_section"],
    anyOf: ["manage_reference_data"],
    options: () => unitsQueryOptions(false),
  },
  {
    allOf: ["view_settings_section"],
    anyOf: ["manage_project_roles"],
    options: projectRolesAdminQueryOptions,
  },
  {
    allOf: ["view_settings_section"],
    anyOf: ["manage_departments"],
    options: departmentsQueryOptions,
  },
  {
    allOf: ["view_settings_section"],
    anyOf: ["manage_permissions_company"],
    options: jobRolesQueryOptions,
  },
  {
    allOf: ["view_settings_section"],
    anyOf: ["manage_website"],
    options: websiteCategoriesQueryOptions,
  },
  {
    allOf: ["view_settings_section"],
    anyOf: ["manage_website"],
    options: websiteProjectsQueryOptions,
  },
  {
    allOf: ["view_settings_section"],
    anyOf: ["manage_website"],
    options: heroSlidesQueryOptions,
  },

  // Agreement item rows pick from the active units everywhere.
  { anyOf: ["view_operations_section", "view_project_agreements"], options: () => unitsQueryOptions(true) },

  // CRM
  { anyOf: ["view_clients"], options: crmClientsQueryOptions },

  // Shops
  { allOf: ["view_shops_section"], anyOf: ["view_shop_catalog"], options: shopDivisionsQueryOptions },
  { allOf: ["view_shops_section"], anyOf: ["view_shop_catalog"], options: shopCategoriesQueryOptions },
  { allOf: ["view_shops_section"], anyOf: ["view_shop_catalog"], options: shopSubcategoriesQueryOptions },
  { allOf: ["view_shops_section"], anyOf: ["view_shop_catalog"], options: shopProductsQueryOptions },
  { allOf: ["view_shops_section"], anyOf: ["view_vendors"], options: shopVendorsQueryOptions },

  // HR
  { allOf: ["view_hr_section"], anyOf: ["view_employees"], options: hrEmployeesListQueryOptions },
  { allOf: ["view_hr_section"], anyOf: ["view_applicants"], options: hrApplicantsQueryOptions },
  { allOf: ["view_hr_section"], anyOf: ["view_job_requests"], options: () => hrJobRequestsQueryOptions() },

  // Finance (money)
  { allOf: ["view_finance_section"], options: pendingOrdersCountQueryOptions },
  { allOf: ["view_finance_section"], options: pendingContractorPaymentsCountQueryOptions },
  { allOf: ["view_finance_section"], anyOf: ["view_company_finance"], options: companyExpensesQueryOptions },
  { allOf: ["view_finance_section"], anyOf: ["view_payments"], options: notPaidExpensesQueryOptions },
  { allOf: ["view_finance_section"], anyOf: ["view_payments"], options: contractorPaymentsQueryOptions },
  { allOf: ["view_finance_section"], anyOf: ["view_payments"], options: financeOrdersQueryOptions },
  {
    allOf: ["view_finance_section"],
    anyOf: ["view_pending_distribution"],
    options: () => undistributedExpensePaymentsQueryOptions(),
  },

  // Company (money)
  { allOf: ["view_company_section"], anyOf: ["view_distribution"], options: companyFinanceQueryOptions },
  { allOf: ["view_company_section"], anyOf: ["view_distribution"], options: distributionBatchesQueryOptions },
  { allOf: ["view_company_section"], anyOf: ["view_distribution"], options: projectsDistributeQueryOptions },

  // Project counters (money)
  { anyOf: ["view_all_project_counters"], options: openProjectNegativePeriodsQueryOptions },
  { anyOf: ["view_all_project_counters"], options: openAccountNegativePeriodsQueryOptions },

  // Operations settings
  {
    allOf: ["view_operations_section"],
    anyOf: ["view_operations_settings"],
    options: boqTemplateTypesQueryOptions,
  },

  // Settings — reference data, roles, HR evaluation config
  { allOf: ["view_settings_section"], anyOf: ["manage_reference_data"], options: settingsExpensesQueryOptions },
  { allOf: ["view_settings_section"], anyOf: ["manage_roles"], options: settingsRolesQueryOptions },
  { allOf: ["view_settings_section"], anyOf: ["manage_specialities"], options: specialitiesQueryOptions },
  {
    allOf: ["view_settings_section"],
    anyOf: ["manage_specialities"],
    options: employeeCountsBySpecializationQueryOptions,
  },
  { allOf: ["view_settings_section"], anyOf: ["manage_question_bank"], options: hrQuestionBankQueryOptions },
  { allOf: ["view_settings_section"], anyOf: ["manage_evaluation_settings"], options: hrScoringConfigQueryOptions },
  {
    allOf: ["view_settings_section"],
    anyOf: ["manage_evaluation_settings"],
    options: () => hrEvaluationConfigQueryOptions("interview", false),
  },
  {
    allOf: ["view_settings_section"],
    anyOf: ["manage_evaluation_settings"],
    options: () => hrEvaluationConfigQueryOptions("performance", false),
  },
];

export function isAllowed(entry: PrefetchEntry, granted: Set<string>): boolean {
  if (entry.allOf && !entry.allOf.every((p) => granted.has(p))) return false;
  if (entry.anyOf && !entry.anyOf.some((p) => granted.has(p))) return false;
  return true;
}
