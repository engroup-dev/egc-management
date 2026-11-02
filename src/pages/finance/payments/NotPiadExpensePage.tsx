import { useMemo, useState } from "react";
import { NotPiadExpenseColumns } from "../../../components/tables/columns/NotPiadExpenseColumns";
import GenericTable from "../../../components/tables/table";
import ErrorPage from "../../../components/ui/errorPage";
import LoadingPage from "../../../components/ui/LoadingPage";
import RefreshingBadge from "../../../components/ui/RefreshingBadge";
import { useNotPiadExpense } from "../../../hooks/finance/payments/useNotPiadExpense";
import { ExpenseWithProject } from "../../../types/projects.type";

type ExpenseCategoryTab = "all" | "materials" | "labor";

// TODO: confirm these match your actual expense_type enum values
const MATERIAL_EXPENSE_TYPES = ["material"];
const LABOR_EXPENSE_TYPES = ["labor"];

const NotPiadExpensePage = () => {
  const { error, expenses, loading, refreshing } = useNotPiadExpense();
  const [activeTab, setActiveTab] = useState<ExpenseCategoryTab>("all");

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    if (activeTab === "materials") {
      return expenses.filter((e) =>
        MATERIAL_EXPENSE_TYPES.includes(e.expense_type),
      );
    }
    if (activeTab === "labor") {
      return expenses.filter((e) =>
        LABOR_EXPENSE_TYPES.includes(e.expense_type),
      );
    }
    return expenses;
  }, [expenses, activeTab]);

  if (loading) return <LoadingPage />;
  if (error) return <ErrorPage />;

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeTab === "all"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          الكل
        </button>
        <button
          onClick={() => setActiveTab("materials")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeTab === "materials"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          مواد
        </button>
        <button
          onClick={() => setActiveTab("labor")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeTab === "labor"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          عمالة
        </button>
        <RefreshingBadge show={refreshing} />
      </div>

      <div>
        <GenericTable<ExpenseWithProject>
          enableFiltering
          showGlobalFilter
          enableSorting
          enableRowSelection
          data={filteredExpenses}
          columns={NotPiadExpenseColumns}
        />
      </div>
    </div>
  );
};

export default NotPiadExpensePage;
