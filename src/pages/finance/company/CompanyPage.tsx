import ExpenseTab from "../../../components/finance/company/ExpenseTab";
// import IncomeTab from "../../../components/finance/company/IncomeTab";
import ErrorPage from "../../../components/ui/errorPage";
import LoadingPage from "../../../components/ui/LoadingPage";
import RefreshingBadge from "../../../components/ui/RefreshingBadge";
import Tabs from "../../../components/ui/Tabs";
import { useComapnyFinance } from "../../../hooks/finance/useComapanyFinance";

const CompanyPage = () => {
  const { error, expenses, loading, addExpense, refreshing } =
    useComapnyFinance();
  const tabs = [
    {
      id: "expenses",
      label: "المصاريف",
      content: (
        <ExpenseTab expenses={expenses ?? []} onAddExpense={addExpense} />
      ),
    },
    // {
    //   id: "income",
    //   label: "الدخل",
    //   content: <IncomeTab />,
    // },
  ];

  if (loading) {
    return <LoadingPage label="جاري تحميل المصاريف" />;
  }
  if (error) {
    return <ErrorPage error={error.message} label="حدث خطاء" />;
  }
  return (
    <div>
      <RefreshingBadge show={refreshing} />
      <Tabs tabs={tabs} defaultTab="expenses" />
    </div>
  );
};

export default CompanyPage;
