import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { permissionsDb } from "../../lib/permissionsDb";
import { supabase } from "../../lib/supabaseClient";

// =====================================================================
// PROJECT DISTRIBUTION — reads and writes project_distributions
// =====================================================================
//
// Implementation guide sections 2.3 and 4.5. NEW file for Phase 5.
//
// The distribute wizard at /company/distribute and the new shares screen
// both read and write project_distributions, and only project_distributions.
// Issue #18 retired the project_assignments mirror this file used to
// maintain (writeLegacyPercentage) — the payout-run engine
// (useProjectsDistribute.ts) already reads project_distributions
// directly, and it was the last thing this mirror existed for.
//
// WHAT THIS FILE IS ABOUT
//   project + person + percentage. That is all. No project role, no
//   team membership, no access consequences of any kind. A partner can
//   hold a share on a project they have never visited; a salaried site
//   engineer can be on the team with no share. Neither is an error and
//   neither is inferred from the other (guide section 2.3).
//
// THE 100% RULE (guide section 4.5, confirmed)
//   projects.default_bank_percentage
// + projects.default_company_percentage
// + SUM(project_distributions.percentage)
// = 100
//   The bank and company shares are columns on the project, not rows
//   here — they are the house's cut, not a person's. So the people rows
//   do NOT total 100; they total whatever is left. A screen that shows
//   only the people rows and reports "65%" looks broken when it is in
//   fact correct, which is why the editor shows all three parts.
//
//   Soft warning only, never a hard block (confirmed decision). Ten of
//   the sixty-three live projects sum to 95 rather than 100, in an
//   identical 42.5 + 42.5 + 10 pattern that looks deliberate. A hard
//   block would make those projects uneditable.
// =====================================================================

export const projectDistributionsKey = (projectId: string) => [
  "project-distributions",
  projectId,
];
export const DISTRIBUTION_PROJECTS_KEY = ["distribution-projects"];

export interface DistributionShare {
  /** project_distributions.id */
  id: string;
  personId: string;
  fullName: string;
  email: string | null;
  percentage: number;
}

export interface ProjectShareSummary {
  projectId: string;
  projectName: string;
  bankPercentage: number;
  companyPercentage: number;
  peopleTotal: number;
  grandTotal: number;
  /** Within a rounding tolerance of 100. */
  balances: boolean;
}

const TOLERANCE = 0.01;

/**
 * Everyone with a share on one project, plus the project's own bank and
 * company percentages so the editor can show the full equation.
 */
export function useProjectDistribution(projectId: string | undefined) {
  return useQuery({
    queryKey: projectDistributionsKey(projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const [{ data: project, error: projectError }, { data: rows, error }] =
        await Promise.all([
          supabase
            .from("projects")
            .select(
              "id, name, default_bank_percentage, default_company_percentage",
            )
            .eq("id", projectId as string)
            .single(),
          permissionsDb
            .from("project_distributions")
            .select("id, person_id, percentage")
            .eq("project_id", projectId as string),
        ]);

      if (projectError) throw projectError;
      if (error) throw error;

      const distributionRows = rows ?? [];
      const personIds = distributionRows.map((r) => r.person_id);

      const { data: users } = personIds.length
        ? await supabase
            .from("users")
            .select("id, first_name, last_name, email")
            .in("id", personIds)
        : { data: [] as never[] };

      const userById = new Map((users ?? []).map((u) => [u.id, u]));

      const shares: DistributionShare[] = distributionRows
        .map((row) => {
          const user = userById.get(row.person_id);
          return {
            id: row.id,
            personId: row.person_id,
            fullName:
              `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() ||
              "—",
            email: user?.email ?? null,
            percentage: Number(row.percentage),
          };
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));

      const bankPercentage = Number(project.default_bank_percentage ?? 0);
      const companyPercentage = Number(project.default_company_percentage ?? 0);
      const peopleTotal = shares.reduce((sum, s) => sum + s.percentage, 0);
      const grandTotal = bankPercentage + companyPercentage + peopleTotal;

      const summary: ProjectShareSummary = {
        projectId: project.id,
        projectName: project.name ?? "—",
        bankPercentage,
        companyPercentage,
        peopleTotal,
        grandTotal,
        balances: Math.abs(grandTotal - 100) <= TOLERANCE,
      };

      return { summary, shares };
    },
  });
}

export interface DistributionProjectListItem extends ProjectShareSummary {
  shareCount: number;
}

/** Every project with its three-part total, for the list page. */
// Exported for the background prefetcher (src/lib/prefetch).
export const distributionProjectsQueryOptions = () =>
  queryOptions<DistributionProjectListItem[]>({
    queryKey: DISTRIBUTION_PROJECTS_KEY,
    queryFn: async () => {
      const { data: projects, error } = await supabase
        .from("projects")
        .select(
          "id, name, default_bank_percentage, default_company_percentage, serial_number",
        )
        .order("serial_number", { ascending: false });
      if (error) throw error;

      const { data: rows, error: rowsError } = await permissionsDb
        .from("project_distributions")
        .select("project_id, percentage");
      if (rowsError) throw rowsError;

      const totals = new Map<string, { sum: number; count: number }>();
      for (const row of rows ?? []) {
        const current = totals.get(row.project_id) ?? { sum: 0, count: 0 };
        current.sum += Number(row.percentage);
        current.count += 1;
        totals.set(row.project_id, current);
      }

      return (projects ?? []).map((project) => {
        const bankPercentage = Number(project.default_bank_percentage ?? 0);
        const companyPercentage = Number(
          project.default_company_percentage ?? 0,
        );
        const entry = totals.get(project.id) ?? { sum: 0, count: 0 };
        const grandTotal = bankPercentage + companyPercentage + entry.sum;
        return {
          projectId: project.id,
          projectName: project.name ?? "—",
          bankPercentage,
          companyPercentage,
          peopleTotal: entry.sum,
          grandTotal,
          balances: Math.abs(grandTotal - 100) <= TOLERANCE,
          shareCount: entry.count,
        };
      });
    },
  });

export function useDistributionProjects() {
  return useQuery(distributionProjectsQueryOptions());
}

export interface DistributionCandidate {
  id: string;
  fullName: string;
  email: string | null;
}

/**
 * Who can be given a share.
 *
 * ALL company accounts — deliberately NOT filtered to the project team.
 * Restricting this to team members would make the partner case
 * unexpressible, and that case is the whole reason distribution is a
 * separate table (guide section 4.5 step 4).
 */
export function useDistributionCandidates() {
  return useQuery<DistributionCandidate[]>({
    queryKey: ["distribution-candidates"],
    queryFn: async () => {
      const { data: employees, error } = await permissionsDb
        .from("employees")
        .select("id");
      if (error) throw error;
      if (!employees?.length) return [];

      const { data: users, error: usersError } = await permissionsDb
        .from("users")
        .select("id, first_name, last_name, email, party_type")
        .in(
          "id",
          employees.map((e) => e.id),
        )
        .eq("party_type", "company");
      if (usersError) throw usersError;

      return (users ?? [])
        .map((u) => ({
          id: u.id,
          fullName: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "—",
          email: u.email,
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));
    },
  });
}

// ---------------------------------------------------------------------
// WRITES — project_distributions only
// ---------------------------------------------------------------------
//
// Issue #18 retired the project_assignments mirror this file used to
// maintain on every write (writeLegacyPercentage, and the compensating
// rollback either mutation ran if that second write failed). The payout
// engine, the shares wizard and the shares PDF all read
// project_distributions directly now, so there is nothing left reading
// the old table that this needs to keep in step with.
//
// UNIQUE (project_id, person_id) on project_distributions means there is
// exactly one row per person per project — no "canonical row plus zero
// out the rest" bookkeeping like the old table needed, because the old
// table had no such constraint and could hold several rows per person
// (one per project role).

interface UpsertArgs {
  projectId: string;
  personId: string;
  percentage: number;
  /** users.id of whoever is making the change. */
  updatedBy: string | null;
}

/**
 * Sets (or creates) one person's share.
 *
 * Relies on UNIQUE (project_id, person_id) rather than doing its own
 * "does a row exist" check — which is what makes the old table's
 * multi-row-update bug structurally impossible here. There is exactly
 * one row to write, and the database guarantees it.
 */
export function useSetProjectShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      personId,
      percentage,
      updatedBy,
    }: UpsertArgs) => {
      const { error } = await permissionsDb
        .from("project_distributions")
        .upsert(
          {
            project_id: projectId,
            person_id: personId,
            percentage,
            updated_by: updatedBy,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "project_id,person_id" },
        );
      if (error) throw error;
    },
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({
        queryKey: projectDistributionsKey(variables.projectId),
      });
      queryClient.invalidateQueries({ queryKey: DISTRIBUTION_PROJECTS_KEY });
    },
  });
}

interface RemoveArgs {
  projectId: string;
  personId: string;
}

/**
 * Removes one person's share.
 *
 * Deletes the project_distributions row outright — team_assignments is
 * a separate table entirely, so this has no effect on whether the
 * person is still on the project team. That is the entire point of the
 * split (guide section 2.3).
 */
export function useRemoveProjectShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, personId }: RemoveArgs) => {
      const { error } = await permissionsDb
        .from("project_distributions")
        .delete()
        .eq("project_id", projectId)
        .eq("person_id", personId);
      if (error) throw error;
    },
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({
        queryKey: projectDistributionsKey(variables.projectId),
      });
      queryClient.invalidateQueries({ queryKey: DISTRIBUTION_PROJECTS_KEY });
    },
  });
}

/** Bank and company shares live on the project row, not here. */
export function useSetProjectHouseShares() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      bankPercentage,
      companyPercentage,
    }: {
      projectId: string;
      bankPercentage: number;
      companyPercentage: number;
    }) => {
      const { error } = await supabase
        .from("projects")
        .update({
          default_bank_percentage: bankPercentage,
          default_company_percentage: companyPercentage,
        })
        .eq("id", projectId);
      if (error) throw error;
      // No dual-write needed: these are the same two columns the old
      // editor writes. One source, both screens.
    },
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({
        queryKey: projectDistributionsKey(variables.projectId),
      });
      queryClient.invalidateQueries({ queryKey: DISTRIBUTION_PROJECTS_KEY });
    },
  });
}

