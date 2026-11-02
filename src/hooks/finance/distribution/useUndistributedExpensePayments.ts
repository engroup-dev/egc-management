import { queryOptions, useQuery } from "@tanstack/react-query";
import { PostgrestError, PostgrestResponse } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import { TIERS } from "../../../lib/queryClient";

// Supabase/PostgREST rejects `.in()` filters once the query string gets too
// long, which happens fast once there are a few hundred undistributed logs.
// Batch the lookups so each request stays well under that limit.
const IN_CHUNK_SIZE = 150;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchInChunks<T>(
  ids: string[],
  fetchChunk: (chunkIds: string[]) => PromiseLike<PostgrestResponse<T>>,
): Promise<T[]> {
  if (ids.length === 0) return [];

  const results = await Promise.all(chunk(ids, IN_CHUNK_SIZE).map(fetchChunk));

  const rows: T[] = [];
  for (const { data, error } of results) {
    if (error) throw error;
    if (data) rows.push(...data);
  }
  return rows;
}

export interface UndistributedExpensePaymentRow {
  logId: string;
  logType: "expense" | "refund";
  paymentId: string | null;
  expenseId: string | null;
  refundId: string | null;
  projectId: string;
  projectName: string;
  projectSerial: number | null;
  percentageAmount: number;
  percentage: number;
  paymentAmount: number | null;
  paymentDate: string | null;
  paymentMethod: "cash" | "bank" | null;
  paymentSerial: number | null;
  expenseDescription: string | null;
  expenseSerial: number | null;
  expenseDate: string | null;
  expenseType: "material" | "labor" | "maps" | null;
  phase: "construction" | "finishing" | "initial" | null;
  currency: string;
  vendorName: string | null;
  contractorName: string | null;
  createdAt: string;
}

const logSelect =
  "id, amount, percentage, project_id, payment_id, expense_id, refund_id, type, created_at";

export interface SerialRange {
  from: number | null;
  to: number | null;
}

export type RangeSection = "expenses" | "maps" | "refunds";
export type SectionRanges = Partial<Record<RangeSection, SerialRange | null>>;

const isActiveRange = (r?: SerialRange | null): r is SerialRange =>
  !!r && (r.from != null || r.to != null);

async function fetchRangeLogs(
  pid: string,
  section: RangeSection,
  r: SerialRange,
) {
  const withRange = <
    Q extends {
      gte: (c: string, v: number) => Q;
      lte: (c: string, v: number) => Q;
    },
  >(
    q: Q,
  ) => {
    if (r.from != null) q = q.gte("serial_number", r.from);
    if (r.to != null) q = q.lte("serial_number", r.to);
    return q;
  };

  if (section === "refunds") {
    const { data, error } = await withRange(
      supabase.from("project_refund").select("id").eq("project_id", pid),
    );
    if (error) throw error;
    return fetchInChunks(
      (data ?? []).map((e) => e.id),
      (ids) =>
        supabase
          .from("project_percentage_logs")
          .select(logSelect)
          .eq("project_id", pid)
          .eq("type", "refund")
          .in("refund_id", ids),
    );
  }

  const expensesQuery = supabase
    .from("project_expenses")
    .select("id")
    .eq("project_id", pid);
  const { data, error } = await withRange(
    section === "maps"
      ? expensesQuery.eq("expense_type", "maps")
      : expensesQuery.or("expense_type.is.null,expense_type.neq.maps"),
  );
  if (error) throw error;
  return fetchInChunks(
    (data ?? []).map((e) => e.id),
    (ids) =>
      supabase
        .from("project_percentage_logs")
        .select(logSelect)
        .eq("project_id", pid)
        .eq("type", "expense")
        .not("payment_id", "is", null)
        .in("expense_id", ids),
  );
}

// With a serial range on a section (project view only) the "undistributed"
// restriction is dropped for that section: every expense/map/refund whose
// serial falls inside the range is returned along with its logs, distributed
// or not. Sections without a range keep the undistributed-only behaviour.
async function fetchUndistributedExpensePayments(
  projectId: string | undefined,
  ranges: SectionRanges | null | undefined,
): Promise<UndistributedExpensePaymentRow[]> {
  const activeSections: [RangeSection, SerialRange][] = projectId
    ? (["expenses", "maps", "refunds"] as RangeSection[]).flatMap((k) => {
        const r = ranges?.[k];
        return isActiveRange(r) ? [[k, r] as [RangeSection, SerialRange]] : [];
      })
    : [];
  const activeKeys = new Set(activeSections.map(([k]) => k));

  let logsData: Awaited<ReturnType<typeof fetchRangeLogs>> = [];

  {
    // Expense logs add to the company share, refund logs subtract from it
    // (they are stored with a negative amount), so the pending view has to
    // carry both to match what the distribution run will actually move.
    let logsQuery = supabase
      .from("project_percentage_logs")
      .select(logSelect)
      .eq("distributed", false)
      .gt("percentage", 0)
      .or(
        "and(type.eq.expense,payment_id.not.is.null),and(type.eq.refund,refund_id.not.is.null)",
      );

    if (projectId) {
      logsQuery = logsQuery.eq("project_id", projectId);
    } else {
      logsQuery = logsQuery.not(
        "project_id",
        "in",
        `(5451aaae-c632-46f4-9913-8670cffcc8e7,e0a50575-bcc1-474a-98b8-8f57770a14fa,eed51009-4cfa-497c-87a1-cbf5a756f3da,f2d38514-32e0-4eeb-b6cd-fcdbed6a93ab)`,
      );
    }

    const { data, error: logsError } = await logsQuery.order("created_at", {
      ascending: false,
    });
    if (logsError) throw logsError;
    logsData = data ?? [];
  }

  const rangeLogIds = new Set<string>();
  if (projectId && activeSections.length > 0) {
    const rangeResults = await Promise.all(
      activeSections.map(([k, r]) => fetchRangeLogs(projectId, k, r)),
    );
    const seen = new Set(logsData.map((l) => l.id));
    rangeResults.flat().forEach((l) => {
      rangeLogIds.add(l.id);
      if (!seen.has(l.id)) {
        seen.add(l.id);
        logsData.push(l);
      }
    });
    logsData.sort((p, q) =>
      (q.created_at ?? "").localeCompare(p.created_at ?? ""),
    );
  }

  const paymentIds = new Set<string>();
  const expenseIds = new Set<string>();
  const refundIds = new Set<string>();
  const projectIds = new Set<string>();

  logsData.forEach((l) => {
    if (l.payment_id) paymentIds.add(l.payment_id);
    if (l.expense_id) expenseIds.add(l.expense_id);
    if (l.refund_id) refundIds.add(l.refund_id);
    projectIds.add(l.project_id);
  });

  const [paymentsData, expensesData, refundsData, projectsData] =
    await Promise.all([
      fetchInChunks(Array.from(paymentIds), (ids) =>
        supabase
          .from("expense_payments")
          .select("id, amount, created_at, payment_method, serial_number")
          .in("id", ids),
      ),
      fetchInChunks(Array.from(expenseIds), (ids) =>
        supabase
          .from("project_expenses")
          .select(
            "id, description, serial_number, expense_date, expense_type, phase, currency, vendor_id, contractor_id",
          )
          .in("id", ids),
      ),
      fetchInChunks(Array.from(refundIds), (ids) =>
        supabase
          .from("project_refund")
          .select(
            "id, amount, description, serial_number, income_date, payment_method, currency",
          )
          .in("id", ids),
      ),
      fetchInChunks(Array.from(projectIds), (ids) =>
        supabase
          .from("projects")
          .select("id, name, serial_number")
          .in("id", ids),
      ),
    ]);

  const vendorIds = new Set<string>();
  const contractorIds = new Set<string>();
  expensesData.forEach((e) => {
    if (e.vendor_id) vendorIds.add(e.vendor_id);
    if (e.contractor_id) contractorIds.add(e.contractor_id);
  });

  const [vendorsData, contractorsData] = await Promise.all([
    fetchInChunks(Array.from(vendorIds), (ids) =>
      supabase.from("vendors").select("id, vendor_name").in("id", ids),
    ),
    fetchInChunks(Array.from(contractorIds), (ids) =>
      supabase
        .from("contractors")
        .select("id, first_name, last_name")
        .in("id", ids),
    ),
  ]);

  const paymentsMap = new Map(paymentsData.map((p) => [p.id, p]));
  const expensesMap = new Map(expensesData.map((e) => [e.id, e]));
  const refundsMap = new Map(refundsData.map((r) => [r.id, r]));
  const projectsMap = new Map(projectsData.map((p) => [p.id, p]));
  const vendorsMap = new Map(vendorsData.map((v) => [v.id, v]));
  const contractorsMap = new Map(contractorsData.map((c) => [c.id, c]));

  const mapped: UndistributedExpensePaymentRow[] = logsData.map((l) => {
    const payment = l.payment_id ? paymentsMap.get(l.payment_id) : undefined;
    const expense = l.expense_id ? expensesMap.get(l.expense_id) : undefined;
    const refund = l.refund_id ? refundsMap.get(l.refund_id) : undefined;
    const project = projectsMap.get(l.project_id);
    const vendor = expense?.vendor_id
      ? vendorsMap.get(expense.vendor_id)
      : undefined;
    const contractor = expense?.contractor_id
      ? contractorsMap.get(expense.contractor_id)
      : undefined;

    const isRefund = l.type === "refund";

    return {
      logId: l.id,
      logType: isRefund ? ("refund" as const) : ("expense" as const),
      paymentId: l.payment_id,
      expenseId: l.expense_id,
      refundId: l.refund_id,
      projectId: l.project_id,
      projectName: project?.name ?? "—",
      projectSerial: project?.serial_number ?? null,
      percentageAmount: l.amount,
      percentage: l.percentage,
      // A refund gives money back, so it counts against the payment total
      // the same way its log amount counts against the company share.
      paymentAmount: isRefund
        ? refund
          ? -refund.amount
          : null
        : (payment?.amount ?? null),
      paymentDate: isRefund
        ? (refund?.income_date ?? null)
        : (payment?.created_at ?? null),
      paymentMethod: isRefund
        ? (refund?.payment_method ?? null)
        : (payment?.payment_method ?? null),
      paymentSerial: isRefund
        ? (refund?.serial_number ?? null)
        : (payment?.serial_number ?? null),
      expenseDescription: isRefund
        ? (refund?.description ?? null)
        : (expense?.description ?? null),
      expenseSerial: isRefund
        ? (refund?.serial_number ?? null)
        : (expense?.serial_number ?? null),
      expenseDate: isRefund
        ? (refund?.income_date ?? null)
        : (expense?.expense_date ?? null),
      expenseType: isRefund ? null : (expense?.expense_type ?? null),
      phase: isRefund ? null : (expense?.phase ?? null),
      currency: isRefund
        ? (refund?.currency ?? "LYD")
        : (expense?.currency ?? "LYD"),
      vendorName: vendor?.vendor_name ?? null,
      contractorName: contractor
        ? `${contractor.first_name} ${contractor.last_name ?? ""}`.trim()
        : null,
      createdAt: l.created_at ?? "",
    };
  });

  // A section with an active range shows only what the range matched;
  // the undistributed base rows of that section are dropped.
  return mapped.filter((r) => {
    const key: RangeSection =
      r.logType === "refund"
        ? "refunds"
        : r.expenseType === "maps"
          ? "maps"
          : "expenses";
    return !activeKeys.has(key) || rangeLogIds.has(r.logId);
  });
}

export const undistributedExpensePaymentsKey = (
  projectId?: string,
  ranges?: SectionRanges | null,
) =>
  [
    "finance",
    "undistributed-payments",
    projectId ?? null,
    ranges ?? null,
  ] as const;

// Exported so the background prefetcher can warm the pending-distribution
// screen (called with no arguments).
export const undistributedExpensePaymentsQueryOptions = (
  projectId?: string,
  ranges?: SectionRanges | null,
) =>
  queryOptions({
    queryKey: undistributedExpensePaymentsKey(projectId, ranges),
    queryFn: async () => {
      try {
        return await fetchUndistributedExpensePayments(projectId, ranges);
      } catch (err) {
        console.error("Error fetching undistributed expense payments:", err);
        throw err;
      }
    },
    ...TIERS.C,
  });

export function useUndistributedExpensePayments(
  projectId?: string,
  ranges?: SectionRanges | null,
) {
  const query = useQuery({
    ...undistributedExpensePaymentsQueryOptions(projectId, ranges),
    // Changing a serial range keeps the current rows on screen (with
    // loading=true) until the new ones arrive, as before — but never
    // another project's rows.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[2] === (projectId ?? null) ? prev : undefined,
  });

  return {
    rows: query.data ?? [],
    loading: query.isPending || query.isPlaceholderData,
    error: query.error as PostgrestError | null,
    refreshing:
      query.isFetching && !query.isPending && !query.isPlaceholderData,
    refetch: async () => {
      await query.refetch();
    },
  };
}
