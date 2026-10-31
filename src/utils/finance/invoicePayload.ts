import { ProjectWithDetailsForBook } from "../../types/projects.type";

// Payloads for the project invoice PDFs on the pdf-service:
//   buildInvoicePayload        -> /invoice/pdf and /invoice/scoped/pdf
//   buildSummedInvoicePayload  -> /invoice/summed/pdf (rows with the same name merged)
// Moved as-is out of the old InvoiceButton / InvoiceButtonSummed so the totals
// they print can't drift.

const r = (n: number) => Math.round(n * 100) / 100;

export function buildInvoicePayload(project: ProjectWithDetailsForBook) {
  const lydExpenses = project.project_expenses.filter(
    (e) => e.currency === "LYD" && e.deleted_at === null,
  );

  const totalMetrials = r(
    lydExpenses
      .filter((e) => e.expense_type === "material")
      .reduce((acc, e) => acc + (e.total_amount ?? 0), 0),
  );

  const totalLabors = r(
    lydExpenses
      .filter((e) => e.expense_type === "labor")
      .reduce((acc, e) => acc + (e.total_amount ?? 0), 0),
  );

  const totalNotPaid = r(
    lydExpenses.reduce(
      (acc, e) => acc + ((e.total_amount ?? 0) - (e.amount_paid ?? 0)),
      0,
    ),
  );

  const lydRefundIds = new Set(
    project.project_refund
      .filter((rf) => rf.currency === "LYD")
      .map((rf) => rf.id),
  );

  // Refund percentage logs are stored as negative amounts (the company's
  // cut given back on a refund). Moving that amount out of the company
  // percentage and into the refund total means subtracting this negative
  // sum, which adds its absolute value to whichever side it's added to.
  const refundPercentageLogsTotal = r(
    (project.project_percentage_logs ?? [])
      .filter(
        (log) =>
          log.type === "refund" && lydRefundIds.has(log.refund_id ?? ""),
      )
      .reduce((acc, log) => acc + (log.amount ?? 0), 0),
  );

  const totalRefundWithPercentage = r(
    project.project_refund
      .filter((rf) => rf.currency === "LYD")
      .reduce((acc, rf) => acc + (rf.amount ?? 0), 0) -
      refundPercentageLogsTotal,
  );

  const totalRefund = r(
    project.project_refund
      .filter((rf) => rf.currency === "LYD")
      .reduce((acc, rf) => acc + (rf.amount ?? 0), 0),
  );

  const lydBalances = project.project_balances.filter(
    (a) => a.currency === "LYD",
  );

  // Excludes the refund-type deduction so this reflects only the
  // percentage earned from expenses, not netted down by refunds.
  const totalCompanyPercentage = r(
    lydBalances.reduce((acc, a) => acc + (a.total_percentage ?? 0), 0) -
      refundPercentageLogsTotal,
  );

  const totalDeposit = r(
    project.project_incomes
      .filter((i) => i.currency === "LYD")
      .reduce((acc, i) => acc + (i.amount ?? 0), 0),
  );

  const projectMaps = (project.project_maps ?? [])
    .filter((map) => map.amount != null && map.date != null)
    .sort((a, b) => (a.serial_number ?? 0) - (b.serial_number ?? 0));
  const totalMaps = r(
    projectMaps.reduce((acc, map) => acc + Number(map.amount ?? 0), 0),
  );

  const remaingAmount = r(
    lydBalances.reduce((acc, a) => acc + (a.balance ?? 0), 0),
  );
  // totalAmount = materials + labor + company percentage + maps - refund
  const totalAmount = r(
    totalMetrials +
      totalLabors +
      totalCompanyPercentage +
      totalMaps -
      totalRefund,
  );

  const today = new Date().toISOString().split("T")[0];

  const allRelevantDates = [
    ...lydExpenses.map((e) => e.expense_date).filter(Boolean),
    ...project.project_refund
      .filter((rf) => rf.currency === "LYD")
      .map((rf) => rf.income_date)
      .filter(Boolean),
    ...project.project_incomes
      .filter((i) => i.currency === "LYD")
      .map((i) => i.income_date)
      .filter(Boolean),
    ...projectMaps.map((map) => map.date).filter(Boolean),
  ].filter((date): date is string => {
    if (!date) return false;
    const parsed = new Date(date);
    return !Number.isNaN(parsed.getTime());
  });

  const start_date =
    allRelevantDates.length > 0
      ? allRelevantDates.reduce((min, current) =>
          new Date(current) < new Date(min) ? current : min,
        )
      : today;

  const end_date =
    allRelevantDates.length > 0
      ? allRelevantDates.reduce((max, current) =>
          new Date(current) > new Date(max) ? current : max,
        )
      : today;

  return {
    serial_number: project.serial_number,
    invoice_date: today,
    project_name: project.name,
    project_location: project.address,
    start_date,
    end_date,

    finance_invoice: {
      total_metrial: totalMetrials,
      total_labor: totalLabors,
      total_labor_and_metrial_and_percentage_and_maps: r(
        totalMetrials + totalLabors + totalCompanyPercentage + totalMaps,
      ),
      total_refund_with_percentage: totalRefundWithPercentage,
      total_maps: totalMaps,
      total_not_paid: totalNotPaid,
      total_refund: totalRefund,
      total_company_percentage: totalCompanyPercentage,
      total_deposit: totalDeposit,
      remaing_amount: remaingAmount,
      total_amount: totalAmount,
    },

    metrials: lydExpenses
      .filter((e) => e.expense_type === "material")
      .sort((a, b) => (a.serial_number ?? 0) - (b.serial_number ?? 0)) // ✅ add this
      .map((e) => ({
        name: e.description,
        serial_number: e.serial_number,
        total_price: r(e.total_amount ?? 0),
        date: e.expense_date,
      })),

    labors: lydExpenses
      .filter((e) => e.expense_type === "labor")
      .sort((a, b) => (a.serial_number ?? 0) - (b.serial_number ?? 0)) // ✅ add this
      .map((e) => ({
        name: e.description,
        contractor_name: e.contract_name ?? "غير معروف",
        serial_number: e.serial_number,
        total_price: r(e.total_amount ?? 0),
        date: e.expense_date,
      })),

    maps: projectMaps.map((map) => ({
      name: map.description ?? "",
      serial_number: map.serial_number ?? 0,
      total_price: r(Number(map.amount ?? 0)),
      date: map.date,
    })),

    refund: project.project_refund
      .filter((rf) => rf.currency === "LYD")
      .sort((a, b) => (a.serial_number ?? 0) - (b.serial_number ?? 0)) // ✅ add this
      .map((rf) => ({
        name: rf.description,
        serial_number: rf.serial_number,
        amount: r(rf.amount ?? 0),
        date: rf.income_date,
      })),

    deposit: project.project_incomes
      .filter((i) => i.currency === "LYD")
      .sort((a, b) => (a.serial_number ?? 0) - (b.serial_number ?? 0)) // ✅ add this
      .map((i) => ({
        name: i.client_name,
        serial_number: i.serial_number,
        amount: r(i.amount ?? 0),
        method: i.payment_method === "bank" ? "بنك" : "كاش",
        description: i.description,
        date: i.income_date,
      })),
  };
}

// Merges rows that share the same expense name, summing their total_price.
// No serial_number/contractor/date is kept — just the name and the total,
// so two expenses named "EX1" become a single "EX1" line with the combined
// amount, regardless of who they were paid to.
function sumByName(
  rows: { name: string | null; total_price: number }[],
): { name: string | null; total_price: number }[] {
  const merged = new Map<
    string,
    { name: string | null; total_price: number }
  >();

  for (const row of rows) {
    const key = row.name ?? "";
    const existing = merged.get(key);
    if (existing) {
      existing.total_price = r(existing.total_price + row.total_price);
    } else {
      merged.set(key, { ...row });
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) => b.total_price - a.total_price,
  );
}

export function buildSummedInvoicePayload(project: ProjectWithDetailsForBook) {
  const lydExpenses = project.project_expenses.filter(
    (e) => e.currency === "LYD" && e.deleted_at === null,
  );

  const totalMetrials = r(
    lydExpenses
      .filter((e) => e.expense_type === "material")
      .reduce((acc, e) => acc + (e.total_amount ?? 0), 0),
  );

  const totalLabors = r(
    lydExpenses
      .filter((e) => e.expense_type === "labor")
      .reduce((acc, e) => acc + (e.total_amount ?? 0), 0),
  );

  const totalNotPaid = r(
    lydExpenses.reduce(
      (acc, e) => acc + ((e.total_amount ?? 0) - (e.amount_paid ?? 0)),
      0,
    ),
  );

  const lydRefundIds = new Set(
    project.project_refund
      .filter((rf) => rf.currency === "LYD")
      .map((rf) => rf.id),
  );

  // Refund percentage logs are stored as negative amounts (the company's
  // cut given back on a refund). Moving that amount out of the company
  // percentage and into the refund total means subtracting this negative
  // sum, which adds its absolute value to whichever side it's added to.
  const refundPercentageLogsTotal = r(
    (project.project_percentage_logs ?? [])
      .filter(
        (log) =>
          log.type === "refund" && lydRefundIds.has(log.refund_id ?? ""),
      )
      .reduce((acc, log) => acc + (log.amount ?? 0), 0),
  );

  const totalRefund = r(
    project.project_refund
      .filter((rf) => rf.currency === "LYD")
      .reduce((acc, rf) => acc + (rf.amount ?? 0), 0) -
      refundPercentageLogsTotal,
  );

  const lydBalances = project.project_balances.filter(
    (a) => a.currency === "LYD",
  );

  // Excludes the refund-type deduction so this reflects only the
  // percentage earned from expenses, not netted down by refunds.
  const totalCompanyPercentage = r(
    lydBalances.reduce((acc, a) => acc + (a.total_percentage ?? 0), 0) -
      refundPercentageLogsTotal,
  );

  const totalDeposit = r(
    project.project_incomes
      .filter((i) => i.currency === "LYD")
      .reduce((acc, i) => acc + (i.amount ?? 0), 0),
  );

  const projectMaps = (project.project_maps ?? [])
    .filter((map) => map.amount != null && map.date != null)
    .sort((a, b) => (a.serial_number ?? 0) - (b.serial_number ?? 0));
  const totalMaps = r(
    projectMaps.reduce((acc, map) => acc + Number(map.amount ?? 0), 0),
  );

  const remaingAmount = r(
    lydBalances.reduce((acc, a) => acc + (a.balance ?? 0), 0),
  );
  // totalAmount = materials + labor + company percentage + maps - refund
  const totalAmount = r(
    totalMetrials +
      totalLabors +
      totalCompanyPercentage +
      totalMaps -
      totalRefund,
  );

  const today = new Date().toISOString().split("T")[0];

  const allRelevantDates = [
    ...lydExpenses.map((e) => e.expense_date).filter(Boolean),
    ...project.project_refund
      .filter((rf) => rf.currency === "LYD")
      .map((rf) => rf.income_date)
      .filter(Boolean),
    ...project.project_incomes
      .filter((i) => i.currency === "LYD")
      .map((i) => i.income_date)
      .filter(Boolean),
    ...projectMaps.map((map) => map.date).filter(Boolean),
  ].filter((date): date is string => {
    if (!date) return false;
    const parsed = new Date(date);
    return !Number.isNaN(parsed.getTime());
  });

  const start_date =
    allRelevantDates.length > 0
      ? allRelevantDates.reduce((min, current) =>
          new Date(current) < new Date(min) ? current : min,
        )
      : today;

  const end_date =
    allRelevantDates.length > 0
      ? allRelevantDates.reduce((max, current) =>
          new Date(current) > new Date(max) ? current : max,
        )
      : today;

  return {
    serial_number: project.serial_number,
    invoice_date: today,
    project_name: project.name,
    project_location: project.address,
    start_date,
    end_date,

    finance_invoice: {
      total_metrial: totalMetrials,
      total_labor: totalLabors,
      total_labor_and_metrial_and_percentage_and_maps: r(
        totalMetrials + totalLabors + totalCompanyPercentage + totalMaps,
      ),
      total_maps: totalMaps,
      total_not_paid: totalNotPaid,
      total_refund: totalRefund,
      total_company_percentage: totalCompanyPercentage,
      total_deposit: totalDeposit,
      remaing_amount: remaingAmount,
      total_amount: totalAmount,
    },

    metrials: sumByName(
      lydExpenses
        .filter((e) => e.expense_type === "material")
        .map((e) => ({
          name: e.description,
          total_price: r(e.total_amount ?? 0),
        })),
    ),

    labors: sumByName(
      lydExpenses
        .filter((e) => e.expense_type === "labor")
        .map((e) => ({
          name: e.description,
          total_price: r(e.total_amount ?? 0),
        })),
    ),
    maps: projectMaps.map((map) => ({
      name: map.description,
      serial_number: map.serial_number,
      total_price: r(map.amount ?? 0),
      date: map.date,
    })),

    refund: project.project_refund
      .filter((rf) => rf.currency === "LYD")
      .sort((a, b) => (a.serial_number ?? 0) - (b.serial_number ?? 0))
      .map((rf) => ({
        name: rf.description,
        serial_number: rf.serial_number,
        amount: r(rf.amount ?? 0),
        date: rf.income_date,
      })),

    deposit: project.project_incomes
      .filter((i) => i.currency === "LYD")
      .sort((a, b) => (a.serial_number ?? 0) - (b.serial_number ?? 0))
      .map((i) => ({
        name: i.client_name,
        serial_number: i.serial_number,
        amount: r(i.amount ?? 0),
        method: i.payment_method === "bank" ? "بنك" : "كاش",
        description: i.description,
        date: i.income_date,
      })),
  };
}
