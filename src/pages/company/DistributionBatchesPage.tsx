import { useNavigate } from "react-router-dom";
import { useDistributionBatches } from "../../hooks/company/useDistributionBatches";
import LoadingPage from "../../components/ui/LoadingPage";
import ErrorPage from "../../components/ui/errorPage";
import RefreshingBadge from "../../components/ui/RefreshingBadge";
import { formatCurrency } from "../../utils/helpper";
import BatchSharesPdfButton from "../../components/pdf-buttons/BatchSharesPdfButton";
import { ArrowLeft } from "lucide-react";

const CURRENCIES = ["LYD", "USD", "EUR"];

const DistributionBatchesPage = () => {
  const { batches, loading, refreshing, error } = useDistributionBatches();
  const navigate = useNavigate();

  if (loading) return <LoadingPage label="جاري تحميل سجل التوزيعات" />;
  if (error)
    return (
      <ErrorPage error={error.message || "حدث خطأ"} label="سجل التوزيعات" />
    );

  const safeBatches = batches ?? [];

  return (
    <div className="p-4" dir="rtl">
      <div className="max-w-3xl mx-auto mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-gray-800">سجل التوزيعات</h1>
          <RefreshingBadge show={refreshing} />
        </div>
        <p className="text-sm text-gray-400 mt-0.5">
          اضغط على أي دفعة لعرض تفاصيلها
        </p>
      </div>

      {safeBatches.length === 0 ? (
        <div className="max-w-3xl mx-auto py-20 text-center text-gray-400 text-sm">
          لا توجد توزيعات مسجّلة
        </div>
      ) : (
        <div className="max-w-3xl mx-auto space-y-2">
          {safeBatches.map((batch, batchIndex) => (
            <div
              key={batch.date}
              onClick={() =>
                navigate(`/company/distribute/batch/${batch.date}`)
              }
              className="flex items-center justify-between px-5 py-4 bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              {/* Left: index + date + meta */}
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center shrink-0">
                  {safeBatches.length - batchIndex}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    دفعة {batch.date}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {batch.periods.length} مشروع · {batch.employeeCount} موظف
                    {batch.hasReversed && (
                      <span className="text-red-400 mr-2">
                        · يحتوي على معكوس
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Right: currency totals + print button + arrow */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden sm:flex gap-2">
                  {CURRENCIES.filter(
                    (c) => (batch.totalsByCurrency[c] ?? 0) > 0,
                  ).map((c) => (
                    <span
                      key={c}
                      className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-md tabular-nums"
                    >
                      {c} {formatCurrency(batch.totalsByCurrency[c], c)}
                    </span>
                  ))}
                </div>

                <div onClick={(e) => e.stopPropagation()}>
                  <BatchSharesPdfButton batch={batch} />
                </div>

                <span className="text-gray-300 text-sm">
                  <ArrowLeft size={16} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DistributionBatchesPage;
