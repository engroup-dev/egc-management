import OverviewStatus from "../../components/ui/OverviewStatus";
import { useCompanyFinance } from "../../hooks/company/useCompanyFinance";
import { formatCurrency } from "../../utils/helpper";
import LoadingPage from "../../components/ui/LoadingPage";
import ErrorPage from "../../components/ui/errorPage";
import RefreshingBadge from "../../components/ui/RefreshingBadge";

const CompanyOverview = () => {
  const { account, error, loading, refreshing } = useCompanyFinance();

  // Filter for accounts
  const mainAccount = account?.filter((acc) => acc.type === "main") || [];
  const reserveAccount = account?.filter((acc) => acc.type === "bank") || [];

  // Sum balances
  const totalMainAccount = mainAccount.reduce(
    (sum, acc) => sum + acc.cash_balance + acc.bank_balance,
    0,
  );

  const totalReserveAccount = reserveAccount.reduce(
    (sum, acc) => sum + acc.cash_balance + acc.bank_balance,
    0,
  );

  if (loading) {
    return <LoadingPage label="جاري تحميل البيانات" />;
  }

  if (error) {
    <ErrorPage label="حدث خطاء" error={error.message} />;
  }

  return (
    <div className="p-4">
      <RefreshingBadge show={refreshing} />
      <OverviewStatus
        stats={[
          {
            label: "حساب الاساسي",
            value: formatCurrency(totalMainAccount),
          },
          {
            label: "حساب الاحتياطي",
            value: formatCurrency(totalReserveAccount),
          },
        ]}
      />
    </div>
  );
};

export default CompanyOverview;
