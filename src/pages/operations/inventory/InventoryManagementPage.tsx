import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Layers,
  Package,
  RefreshCw,
  Search,
  Send,
  Zap,
} from "lucide-react";
import {
  useApplyDefaultMaterialsToProject,
  useDefaultProjectMaterials,
  useProjectInventoryItems,
  useProjectMaterialIssues,
  useProjectsInventorySummary,
} from "../../../hooks/inventory/useAdminInventory";

export default function InventoryManagementPage() {
  const [activeTab, setActiveTab] = useState<"projects" | "ledger" | "defaults">("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sqmModalOpen, setSqmModalOpen] = useState(false);
  const [inputSqm, setInputSqm] = useState("200");
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Queries
  const { data: summaries = [], refetch: refetchSummaries } =
    useProjectsInventorySummary();
  const { data: projectItems = [], isLoading: loadingItems, refetch: refetchItems } =
    useProjectInventoryItems(selectedProjectId || undefined);
  const { data: issues = [], isLoading: loadingIssues, refetch: refetchIssues } =
    useProjectMaterialIssues(selectedProjectId || undefined);
  const { data: defaultMaterials = [], isLoading: loadingDefaults } =
    useDefaultProjectMaterials();

  // Mutation
  const applyDefaultsMutation = useApplyDefaultMaterialsToProject();

  // Auto-select first project if none selected
  React.useEffect(() => {
    if (!selectedProjectId && summaries.length > 0) {
      setSelectedProjectId(summaries[0].projectId);
    }
  }, [summaries, selectedProjectId]);

  // Overall KPIs
  const totalTrackedItems = summaries.reduce((acc, s) => acc + s.totalItems, 0);
  const totalLowStockAlerts = summaries.reduce((acc, s) => acc + s.lowStockItems, 0);
  const totalIssuedAll = summaries.reduce((acc, s) => acc + s.totalIssued, 0);

  const activeProjectSummary = summaries.find((s) => s.projectId === selectedProjectId);

  // Filtered items in selected project
  const filteredProjectItems = useMemo(() => {
    if (!searchQuery.trim()) return projectItems;
    const q = searchQuery.toLowerCase().trim();
    return projectItems.filter((i) => {
      const name = i.item_type === "catalog"
        ? (i.shop_product_sizes?.shop_products?.name ?? "").toLowerCase()
        : (i.custom_name ?? "").toLowerCase();
      const specs = (i.custom_specifications ?? "").toLowerCase();
      return name.includes(q) || specs.includes(q);
    });
  }, [projectItems, searchQuery]);

  const handleApplyDefaults = async () => {
    if (!selectedProjectId) return;
    const sqm = parseFloat(inputSqm);
    if (isNaN(sqm) || sqm <= 0) {
      setNotification({ type: "error", text: "يرجى إدخال مساحة صحيحة بالمتر المربع" });
      return;
    }

    try {
      await applyDefaultsMutation.mutateAsync({
        projectId: selectedProjectId,
        squareMeters: sqm,
      });
      setSqmModalOpen(false);
      setNotification({
        type: "success",
        text: `تم تجهيز مواد الكهرباء الافتراضية للمشروع بنجاح بناءً على مساحة ${sqm} م²`,
      });
      refetchItems();
      refetchSummaries();
    } catch (err: any) {
      setNotification({
        type: "error",
        text: err?.message || "فشل تطبيق المواد الافتراضية",
      });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة مخزون ومواد المشاريع</h1>
          <p className="text-sm text-gray-500 mt-1">
            متابعة مخازن المواقع، تنبيهات النقص، وحركات صرف المواد للمقاولين
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              refetchSummaries();
              refetchItems();
              refetchIssues();
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>تحديث البيانات</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between ${
            notification.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-600" />
            )}
            <span className="text-sm font-medium">{notification.text}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-xs font-semibold underline hover:opacity-75"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Global KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm text-gray-500 font-medium">المشاريع المفعلة</div>
            <div className="text-2xl font-bold text-gray-900 mt-0.5">{summaries.length}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm text-gray-500 font-medium">المواد المسجلة بالمخازن</div>
            <div className="text-2xl font-bold text-gray-900 mt-0.5">{totalTrackedItems}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm text-gray-500 font-medium">تنبيهات نقص المخزون</div>
            <div className={`text-2xl font-bold mt-0.5 ${totalLowStockAlerts > 0 ? "text-amber-600" : "text-gray-900"}`}>
              {totalLowStockAlerts}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Send className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm text-gray-500 font-medium">إجمالي الكميات المصروفة</div>
            <div className="text-2xl font-bold text-gray-900 mt-0.5">{totalIssuedAll}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-4">
        <button
          onClick={() => setActiveTab("projects")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "projects"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          مخزون المشاريع
        </button>

        <button
          onClick={() => setActiveTab("ledger")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "ledger"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          سجل الاستهلاك وصرف المواد
        </button>

        <button
          onClick={() => setActiveTab("defaults")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "defaults"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          المواد الافتراضية وحساب المساحة (m²)
        </button>
      </div>

      {/* Tab 1: Project Stock */}
      {activeTab === "projects" && (
        <div className="space-y-4">
          {/* Project Picker & Actions */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                اختر المشروع:
              </label>
              <div className="relative min-w-[260px]">
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5 pl-8 focus:ring-blue-500 focus:border-blue-500"
                >
                  {summaries.map((s) => (
                    <option key={s.projectId} value={s.projectId}>
                      {s.projectName} ({s.totalItems} مادة - {s.lowStockItems} منخفض)
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-gray-500 absolute left-2.5 top-3 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 md:w-64">
                <Search className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="بحث في مواد المشروع..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <button
                onClick={() => setSqmModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-xs"
              >
                <Zap className="w-4 h-4" />
                <span>تجهيز المواد بالـ m²</span>
              </button>
            </div>
          </div>

          {/* Project Stock Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <h2 className="font-semibold text-gray-900">
                قائمة المواد في مخزن: {activeProjectSummary?.projectName || "المشروع"}
              </h2>
              <span className="text-xs text-gray-500">
                إجمالي المواد: {filteredProjectItems.length}
              </span>
            </div>

            {loadingItems ? (
              <div className="p-8 text-center text-gray-500 text-sm">جاري تحميل المواد...</div>
            ) : filteredProjectItems.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                لا توجد مواد مسجلة في مخزن هذا المشروع بعد. يمكنك استخدام زر "تجهيز المواد بالـ m²" لإدراج التجهيزات الأولية.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right text-gray-600">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">المادة</th>
                      <th className="px-4 py-3">المواصفات</th>
                      <th className="px-4 py-3">الرصيد المتاح</th>
                      <th className="px-4 py-3">الوحدة</th>
                      <th className="px-4 py-3">الحالة</th>
                      <th className="px-4 py-3">المصروف للمقاولين</th>
                      <th className="px-4 py-3">حد النقص</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredProjectItems.map((item) => {
                      const name =
                        item.item_type === "catalog"
                          ? `${item.shop_product_sizes?.shop_products?.name ?? "مادة"} (${item.shop_product_sizes?.size ?? ""})`
                          : item.custom_name;
                      const unit =
                        item.item_type === "catalog"
                          ? item.shop_product_sizes?.unit ?? "قطعة"
                          : item.custom_unit ?? "قطعة";
                      const isLow = Number(item.current_quantity) <= Number(item.low_stock_threshold);

                      return (
                        <tr key={item.id} className="hover:bg-gray-50/80">
                          <td className="px-4 py-3 font-semibold text-gray-900">{name}</td>
                          <td className="px-4 py-3 text-gray-500">{item.custom_specifications || "—"}</td>
                          <td className="px-4 py-3 font-bold text-gray-900">{item.current_quantity}</td>
                          <td className="px-4 py-3 text-gray-500">{unit}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                isLow
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-green-100 text-green-800"
                              }`}
                            >
                              {isLow ? "مخزون منخفض" : "متوفر"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700 font-medium">{item.total_issued_quantity}</td>
                          <td className="px-4 py-3 text-gray-500">{item.low_stock_threshold}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Ledger */}
      {activeTab === "ledger" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
            <h2 className="font-semibold text-gray-900">سجل استهلاك وصرف المواد للمقاولين</h2>
            <span className="text-xs text-gray-500">إجمالي الحركات: {issues.length}</span>
          </div>

          {loadingIssues ? (
            <div className="p-8 text-center text-gray-500 text-sm">جاري تحميل سجل الصرف...</div>
          ) : issues.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">لا توجد حركات صرف مسجلة بعد.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right text-gray-600">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3">تاريخ الصرف</th>
                    <th className="px-4 py-3">المشروع</th>
                    <th className="px-4 py-3">المقاول</th>
                    <th className="px-4 py-3">المادة المصروفة</th>
                    <th className="px-4 py-3">الكمية</th>
                    <th className="px-4 py-3">منطقة العمل</th>
                    <th className="px-4 py-3">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {issues.map((issue) => {
                    const itemName =
                      issue.project_inventory_items?.item_type === "catalog"
                        ? `${issue.project_inventory_items.shop_product_sizes?.shop_products?.name ?? ""} (${issue.project_inventory_items.shop_product_sizes?.size ?? ""})`
                        : issue.project_inventory_items?.custom_name ?? "مادة مخصصة";
                    const unit =
                      issue.project_inventory_items?.item_type === "catalog"
                        ? issue.project_inventory_items.shop_product_sizes?.unit ?? "قطعة"
                        : issue.project_inventory_items?.custom_unit ?? "قطعة";

                    return (
                      <tr key={issue.id} className="hover:bg-gray-50/80">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {new Date(issue.issue_date).toLocaleDateString("ar-LY")}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {issue.projects?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-semibold text-blue-600">
                          {issue.contractors ? `${issue.contractors.first_name} ${issue.contractors.last_name || ""}`.trim() : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-900">{itemName}</td>
                        <td className="px-4 py-3 font-bold text-emerald-600">
                          {issue.quantity} {unit}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{issue.work_zone || "—"}</td>
                        <td className="px-4 py-3 text-gray-500">{issue.notes || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Defaults */}
      {activeTab === "defaults" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-gray-200 bg-gray-50/50">
            <h2 className="font-semibold text-gray-900">قائمة المواد الافتراضية ومعدلات الاحتياج (m²)</h2>
            <p className="text-xs text-gray-500 mt-1">
              تُستخدم هذه القائمة لتجهيز المخزون الأولي لمشروع جديد تلقائياً بحساب مساحة المشروع مضروبة في معامل الاحتياج لكل متر مربع.
            </p>
          </div>

          {loadingDefaults ? (
            <div className="p-8 text-center text-gray-500 text-sm">جاري التحميل...</div>
          ) : defaultMaterials.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">لا توجد مواد افتراضية مسجلة بعد.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right text-gray-600">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3">المجال / الحرفة</th>
                    <th className="px-4 py-3">اسم المادة</th>
                    <th className="px-4 py-3">الوحدة</th>
                    <th className="px-4 py-3">المواصفات الفنية</th>
                    <th className="px-4 py-3">معامل الاحتياج (لكل m²)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {defaultMaterials.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3 font-medium text-indigo-600">{d.trade}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{d.name}</td>
                      <td className="px-4 py-3 text-gray-500">{d.unit}</td>
                      <td className="px-4 py-3 text-gray-500">{d.specs || "—"}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">{d.sqm_ratio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SQM Setup Modal */}
      {sqmModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">تجهيز مخزون المشروع بالـ m²</h3>
                <p className="text-xs text-gray-500">
                  مشروع: {activeProjectSummary?.projectName}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                مساحة المشروع الإجمالية (متر مربع):
              </label>
              <input
                type="number"
                value={inputSqm}
                onChange={(e) => setInputSqm(e.target.value)}
                placeholder="200"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                سيقوم النظام بضرب هذه المساحة في معامل كل مادة كهربائية افتراضية وإدراج الكميات المقدرة في مخزون الموقع مباشرة.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setSqmModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                إلغاء
              </button>

              <button
                type="button"
                disabled={applyDefaultsMutation.isPending}
                onClick={handleApplyDefaults}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {applyDefaultsMutation.isPending ? "جاري التجهيز..." : "تطبيق وحساب المواد"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
