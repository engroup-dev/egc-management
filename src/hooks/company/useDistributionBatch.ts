import { queryOptions, useQuery } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import { TIERS } from "../../lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BatchDetailProject {
  projectId: string;
  projectName: string;
  projectSerial: number | null;
  totalsByCurrency: Record<string, number>;
  employeeCount: number;
  hasReversed: boolean;
}

export interface BatchDetailEmployee {
  employeeId: string;
  firstName: string;
  lastName: string | null;
  specialization: string | null;
  projectCount: number;
  totalsByCurrency: Record<string, number>;
}

export interface BatchDetail {
  date: string;
  projects: BatchDetailProject[];
  employees: BatchDetailEmployee[];
  totalsByCurrency: Record<string, number>;
  totalEmployeeCount: number;
  hasReversed: boolean;
}

type RawItem = {
  item_type: string;
  user_id: string | null;
  total: number;
  period_id: string;
  period: {
    project_id: string;
    currency: string;
    status: string;
  };
  employee: {
    id: string;
    first_name: string;
    last_name: string | null;
    employee_specialities: { speciality: { name: string } | null }[] | null;
  } | null;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const batchDetailKey = (date: string) =>
  ["company", "distribution-batch", date] as const;

async function fetchBatchDetail(date: string): Promise<BatchDetail> {
  // Fetch all periods for this date, with their items + employee info
  const { data: periods, error: periodsError } = await supabase
    .from("project_percentage_periods")
    .select(
      `id, project_id, currency, status, total_amount,
       project:projects(id, name, serial_number),
       items:project_percentage_period_items(
         item_type, user_id, total, period_id,
         employee:employees(
           id, first_name, last_name,
           employee_specialities(speciality:specialities(name))
         )
       )`,
    )
    .eq("end_date", date)
    .order("created_at", { ascending: false });

  if (periodsError) throw periodsError;

  // ── Build project map ──────────────────────────────────────────────────
  const projectMap = new Map<string, BatchDetailProject>();

  for (const period of periods ?? []) {
    const pid = period.project_id;
    const isReversed = period.status === "reversed";
    const currency: string = period.currency ?? "LYD";

    let proj = projectMap.get(pid);
    if (!proj) {
      proj = {
        projectId: pid,
        projectName: period.project?.name ?? "—",
        projectSerial: period.project?.serial_number ?? null,
        totalsByCurrency: {},
        employeeCount: 0,
        hasReversed: false,
      };
      projectMap.set(pid, proj);
    }

    if (isReversed) {
      proj.hasReversed = true;
    } else {
      proj.totalsByCurrency[currency] =
        (proj.totalsByCurrency[currency] ?? 0) + Number(period.total_amount);
    }

    // employees are counted per project below
  }

  // ── Build employee map ─────────────────────────────────────────────────
  // We need unique employees with their totals summed across all active periods
  const employeeMap = new Map<
    string,
    {
      employeeId: string;
      firstName: string;
      lastName: string | null;
      specialization: string | null;
      projectIds: Set<string>;
      totalsByCurrency: Record<string, number>;
    }
  >();

  // Also track per-project unique employee IDs for employeeCount
  const projectEmployeeIds = new Map<string, Set<string>>();

  for (const period of periods ?? []) {
    const isReversed = period.status === "reversed";
    const currency: string = period.currency ?? "LYD";
    const pid = period.project_id;

    let projectEmployees = projectEmployeeIds.get(pid);
    if (!projectEmployees) {
      projectEmployees = new Set();
      projectEmployeeIds.set(pid, projectEmployees);
    }

    for (const item of (period.items as RawItem[]).filter(
      (i) =>
        i.item_type === "employee" && i.user_id !== null && i.employee !== null,
    )) {
      const uid = item.user_id as string;
      const emp = item.employee;
      if (!emp) continue; // the filter above already dropped these

      projectEmployees.add(uid);

      let entry = employeeMap.get(uid);
      if (!entry) {
        entry = {
          employeeId: uid,
          firstName: emp.first_name,
          lastName: emp.last_name,
          specialization:
            emp.employee_specialities?.[0]?.speciality?.name ?? null,
          projectIds: new Set(),
          totalsByCurrency: {},
        };
        employeeMap.set(uid, entry);
      }
      entry.projectIds.add(pid);

      if (!isReversed) {
        entry.totalsByCurrency[currency] =
          (entry.totalsByCurrency[currency] ?? 0) + Number(item.total);
      }
    }
  }

  // Patch employeeCount onto each project
  for (const [pid, empIds] of projectEmployeeIds.entries()) {
    const proj = projectMap.get(pid);
    if (proj) proj.employeeCount = empIds.size;
  }

  // ── Build batch-level totals ───────────────────────────────────────────
  const totalsByCurrency: Record<string, number> = {};
  const allEmployeeIds = new Set<string>();

  for (const period of periods ?? []) {
    if (period.status === "reversed") continue;
    const currency: string = period.currency ?? "LYD";
    totalsByCurrency[currency] =
      (totalsByCurrency[currency] ?? 0) + Number(period.total_amount);
  }

  employeeMap.forEach((_, uid) => allEmployeeIds.add(uid));

  const result: BatchDetail = {
    date,
    projects: Array.from(projectMap.values()),
    employees: Array.from(employeeMap.values()).map((e) => ({
      employeeId: e.employeeId,
      firstName: e.firstName,
      lastName: e.lastName,
      specialization: e.specialization,
      projectCount: e.projectIds.size,
      totalsByCurrency: e.totalsByCurrency,
    })),
    totalsByCurrency,
    totalEmployeeCount: allEmployeeIds.size,
    hasReversed: (periods ?? []).some((p) => p.status === "reversed"),
  };

  return result;
}

export const batchDetailQueryOptions = (date: string) =>
  queryOptions({
    queryKey: batchDetailKey(date),
    queryFn: () => fetchBatchDetail(date),
    enabled: !!date,
    ...TIERS.C,
  });

export function useBatchDetail(date: string) {
  const query = useQuery(batchDetailQueryOptions(date));
  return {
    batch: query.data ?? null,
    loading: query.isPending,
    error: query.error as PostgrestError | null,
    refetch: async () => {
      await query.refetch();
    },
  };
}
