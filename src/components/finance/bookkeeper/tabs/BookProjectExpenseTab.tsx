import {
  Expense,
  ProjectWithDetailsForBook,
} from "../../../../types/projects.type";
import { ProjectsExpensesColumns } from "../../../tables/columns/ProjectExpenseColumns";
import GenericTable from "../../../tables/table";
import ProjectExpenseForm from "../../form/ProjectExpenseForm";
import { ProjectExpenseFormValues } from "../../../../types/schema/ProjectBook.schema";
import { PostgrestError } from "@supabase/supabase-js";
import { ProjectExpenses } from "../../../../types/global.type";
import OverviewStatus from "../../../ui/OverviewStatus";
import Button from "../../../ui/Button";
import { Link } from "react-router-dom";
import { formatCurrency } from "../../../../utils/helpper";
import PrintProjectDialog from "../PrintProjectDialog";
import ExpenseTableFilters from "../../../tables/filters/ExpenseTableFilters";

interface BookProjectExpenseTabProps {
  project: ProjectWithDetailsForBook | null;
  addExpense: (data: ProjectExpenseFormValues) => Promise<{
    data: ProjectExpenses | null;
    error: PostgrestError | null;
  }>;
}

const BookProjectExpenseTab = ({
  project,
  addExpense,
}: BookProjectExpenseTabProps) => {
  const filteredProject = project?.project_expenses.filter(
    (expense) => expense.deleted_at === null,
  );

  const lydBalances =
    project?.project_balances.filter((b) => b.currency === "LYD") ?? [];

  // balances
  const projectBalance = lydBalances.reduce(
    (acc, b) => acc + (b.balance || 0),
    0,
  );
  const accountBalance =
    project?.accounts
      .filter((a) => a.currency === "LYD")
      .reduce((acc, a) => acc + (a.balance || 0), 0) ?? 0;
  const balanceDiff = projectBalance - accountBalance;

  // income
  const totalIncome = lydBalances.reduce(
    (acc, b) => acc + (b.total_transactions || 0),
    0,
  );
  const lydIncomes =
    project?.project_incomes.filter((i) => i.currency === "LYD") ?? [];
  const cashIncome = lydIncomes
    .filter((i) => i.payment_method === "cash")
    .reduce((acc, i) => acc + (i.amount || 0), 0);
  const bankIncome = lydIncomes
    .filter((i) => i.payment_method === "bank")
    .reduce((acc, i) => acc + (i.amount || 0), 0);

  // expenses
  const balanceTotalExpense = lydBalances.reduce(
    (acc, b) => acc + (b.total_expense || 0),
    0,
  );
  const accountTotalExpenseCash =
    project?.accounts
      .filter((a) => a.currency === "LYD" && a.type === "cash")
      .reduce((acc, a) => acc + (a.total_expense || 0), 0) ?? 0;
  const accountTotalExpenseBank =
    project?.accounts
      .filter((a) => a.currency === "LYD" && a.type === "bank")
      .reduce((acc, a) => acc + (a.total_expense || 0), 0) ?? 0;

  const accountCashBalance =
    project?.accounts
      .filter((a) => a.currency === "LYD" && a.type === "cash")
      .reduce((acc, a) => acc + (a.balance || 0), 0) ?? 0;
  const accountBankBalance =
    project?.accounts
      .filter((a) => a.currency === "LYD" && a.type === "bank")
      .reduce((acc, a) => acc + (a.balance || 0), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Button variant="secondary">
          <Link to={`./bulk-expenses`}>إضافة مصروفات بالجملة</Link>
        </Button>
        <PrintProjectDialog project={project} />
      </div>

      <div>
        <OverviewStatus
          stats={[
            {
              label: "الرصيد",
              value: formatCurrency(projectBalance),
              secondaryLabel: "رصيد الحالي",
              secondaryValue: formatCurrency(accountBalance),
              tertiaryLabel: "الفرق (غير مدفوع)",
              tertiaryValue: formatCurrency(balanceDiff),
            },
            {
              label: "اجمالي الدخل",
              value: formatCurrency(totalIncome),
              secondaryLabel: "نقدي",
              secondaryValue: formatCurrency(cashIncome),
              tertiaryLabel: "بنكي",
              tertiaryValue: formatCurrency(bankIncome),
            },
            {
              label: "اجمالي المصروفات",
              value: formatCurrency(balanceTotalExpense),
              secondaryLabel: "كاش",
              secondaryValue: formatCurrency(accountTotalExpenseCash),
              tertiaryLabel: "بنك",
              tertiaryValue: formatCurrency(accountTotalExpenseBank),
            },
            {
              label: "رصيد الحسابات",
              value: formatCurrency(accountBalance),
              secondaryLabel: "كاش",
              secondaryValue: formatCurrency(accountCashBalance),
              tertiaryLabel: "بنك",
              tertiaryValue: formatCurrency(accountBankBalance),
            },
          ]}
        />
      </div>

      <div>
        <ProjectExpenseForm
          projectId={project?.id || ""}
          addExpense={addExpense}
        />
      </div>

      <div>
        <GenericTable<Expense>
          enableFiltering
          showGlobalFilter
          enableSorting
          enableRowSelection
          initialSorting={[{ id: "serial_number", desc: true }]}
          data={filteredProject || []}
          columns={ProjectsExpensesColumns}
          // ── Filter panel wired to the live table instance ──────────────
          headerActions={(table) => <ExpenseTableFilters table={table} />}
        />
      </div>
    </div>
  );
};

export default BookProjectExpenseTab;
