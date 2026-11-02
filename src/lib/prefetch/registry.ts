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
];

export function isAllowed(entry: PrefetchEntry, granted: Set<string>): boolean {
  if (entry.allOf && !entry.allOf.every((p) => granted.has(p))) return false;
  if (entry.anyOf && !entry.anyOf.some((p) => granted.has(p))) return false;
  return true;
}
