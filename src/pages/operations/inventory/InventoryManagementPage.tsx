import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Layers,
  Lock,
  Package,
  PackageX,
  RefreshCw,
  Search,
  Zap,
} from "lucide-react";
import {
  useApplyDefaultMaterialsToProject,
  useDefaultProjectMaterials,
  useProjectInventoryItems,
  useProjectMaterialIssues,
  useProjectsInventorySummary,
} from "../../../hooks/inventory/useAdminInventory";
import { useCan } from "../../../hooks/permissions/useCan";
import {
  inventoryErrorMessage,
  inventoryItemLabel,
  plannedQuantityFor,
} from "../../../types/inventory";

type Tab = "projects" | "ledger" | "defaults";

const tabClass = (active: boolean) =>
  `pb-3 text-sm font-semibold border-b-2 transition-colors ${
    active ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
  }`;

function StateRow({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "error" }) {
  return (
    <div className={`p-8 text-center text-sm ${tone === "error" ? "text-red-600" : "text-gray-500"}`}>
      {children}
    </div>
  );
}

function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <StateRow tone="error">
      <p>{inventoryErrorMessage(error, "تعذر تحميل البيانات. تحقق من الاتصال ثم أعد المحاولة.")}</p>
      <button
        onClick={onRetry}
        className="mt-3 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
      >
        إعادة المحاولة
      </button>
    </StateRow>
  );
}

function NoAccess() {
  return (
    <StateRow>
      <Lock className="w-5 h-5 mx-auto mb-2 text-gray-400" />
      ليست لديك صلاحية عرض مخزون هذا المشروع.
    </StateRow>
  );
}

const fmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("ar-LY", { maximumFractionDigits: 2 });

export default function InventoryManagementPage() {
  const [activeTab, setActiveTab] = useState<Tab>("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sqmModalOpen, setSqmModalOpen] = useState(false);
  const [inputSqm, setInputSqm] = useState("200");
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const summariesQuery = useProjectsInventorySummary();
  const summaries = summariesQuery.data ?? [];

  const projectId = selectedProjectId || undefined;
  const view = useCan("view_inventory", projectId);
  const manage = useCan("manage_inventory", projectId);
  const canView = view.can || manage.can;
  const permissionLoading = view.loading || manage.loading;

  const itemsQuery = useProjectInventoryItems(projectId, canView);
  const issuesQuery = useProjectMaterialIssues(projectId, canView && activeTab === "ledger");
  const defaultsQuery = useDefaultProjectMaterials();
  const applyDefaults = useApplyDefaultMaterialsToProject();

  const projectItems = itemsQuery.data ?? [];
  const issues = issuesQuery.data ?? [];
  const defaultMaterials = defaultsQuery.data ?? [];

  // Default to the first project that has inventory, else the first one.
  useEffect(() => {
    if (!selectedProjectId && summaries.length > 0) {
      const withItems = summaries.find((s) => s.totalItems > 0);
      setSelectedProjectId((withItems ?? summaries[0]).projectId);
    }
  }, [summaries, selectedProjectId]);

  const projectsWithInventory = summaries.filter((s) => s.totalItems > 0).length;
  const totalTrackedItems = summaries.reduce((acc, s) => acc + s.totalItems, 0);
  const totalLowStock = summaries.reduce((acc, s) => acc + s.lowStockItems, 0);
  const totalOutOfStock = summaries.reduce((acc, s) => acc + s.outOfStockItems, 0);

  const activeProjectSummary = summaries.find((s) => s.projectId === selectedProjectId);

  const filteredProjectItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return projectItems;
    return projectItems.filter((i) => {
      const { name } = inventoryItemLabel(i);
      return name.toLowerCase().includes(q) || (i.custom_specifications ?? "").toLowerCase().includes(q);
    });
  }, [projectItems, searchQuery]);

  // Preview of what the m² tool will add, mirroring inventory_apply_defaults.
  const sqm = parseFloat(inputSqm);
  const sqmValid = !isNaN(sqm) && sqm > 0;
  const existingNames = useMemo(
    () =>
      new Set(
        projectItems
          .filter((i) => i.item_type === "custom" && i.custom_name)
          .map((i) => i.custom_name!.trim().toLowerCase()),
      ),
    [projectItems],
  );
  const preview = useMemo(
    () =>
      defaultMaterials
        .filter((d) => d.trade === "electrical")
        .map((d) => ({
          ...d,
          qty: sqmValid ? plannedQuantityFor(d.sqm_ratio, sqm) : 0,
          exists: existingNames.has(d.name.trim().toLowerCase()),
        })),
    [defaultMaterials, existingNames, sqm, sqmValid],
  );
  const previewNewCount = preview.filter((p) => !p.exists).length;

  const refreshAll = () => {
    summariesQuery.refetch();
    if (canView) {
      itemsQuery.refetch();
      if (activeTab === "ledger") issuesQuery.refetch();
    }
  };

  const handleApplyDefaults = async () => {
    if (!selectedProjectId || !sqmValid) {
      setNotification({ type: "error", text: "يرجى إدخال مساحة صحيحة بالمتر المربع" });
      return;
    }
    try {
      const result = await applyDefaults.mutateAsync({ projectId: selectedProjectId, squareMeters: sqm });
      setSqmModalOpen(false);
      setNotification({
        type: "success",
        text:
          result.inserted > 0
            ? `تمت إضافة ${result.inserted} مادة بكميات مخططة لمساحة ${sqm} م²` +
              (result.skipped > 0 ? ` (تم تخطي ${result.skipped} مادة موجودة مسبقاً)` : "")
            : "كل المواد الافتراضية موجودة مسبقاً في هذا المشروع، لم تتم إضافة شيء",
      });
    } catch (err) {
      setNotification({ type: "error", text: inventoryErrorMessage(err, "فشل تطبيق المواد الافتراضية") });
    }
  };

  const projectGate = (content: React.ReactNode) => {
    if (!selectedProjectId) return <StateRow>اختر مشروعاً لعرض مخزونه.</StateRow>;
    if (permissionLoading) return <StateRow>جاري التحقق من الصلاحية...</StateRow>;
    if (!canView) return <NoAccess />;
    return content;
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
        <button
          onClick={refreshAll}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>تحديث البيانات</span>
        </button>
      </div>

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
          <button onClick={() => setNotification(null)} className="text-xs font-semibold underline hover:opacity-75">
            إغلاق
          </button>
        </div>
      )}

      {/* KPIs. Counts only: quantities are in different units and can't be summed. */}
      {summariesQuery.isError ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <QueryError error={summariesQuery.error} onRetry={() => summariesQuery.refetch()} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "مشاريع لديها مخزون", value: projectsWithInventory, icon: Layers, tone: "bg-blue-50 text-blue-600" },
            { label: "المواد المسجلة بالمخازن", value: totalTrackedItems, icon: Package, tone: "bg-indigo-50 text-indigo-600" },
            { label: "تنبيهات نقص المخزون", value: totalLowStock, icon: AlertTriangle, tone: "bg-amber-50 text-amber-600", warn: totalLowStock > 0 },
            { label: "مواد نفدت", value: totalOutOfStock, icon: PackageX, tone: "bg-red-50 text-red-600", warn: totalOutOfStock > 0 },
          ].map(({ label, value, icon: Icon, tone, warn }) => (
            <div key={label} className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center gap-4">
              <div className={`p-3 rounded-lg ${tone}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm text-gray-500 font-medium">{label}</div>
                <div className={`text-2xl font-bold mt-0.5 ${warn ? "text-amber-600" : "text-gray-900"}`}>
                  {summariesQuery.isPending ? "…" : value}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Project picker, shared by the project and ledger tabs */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">اختر المشروع:</label>
          <div className="relative min-w-[260px]">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5 pl-8 focus:ring-blue-500 focus:border-blue-500"
            >
              {summaries.map((s) => (
                <option key={s.projectId} value={s.projectId}>
                  {s.projectName}
                  {s.totalItems > 0 ? ` (${s.totalItems} مادة - ${s.lowStockItems} منخفض)` : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-500 absolute left-2.5 top-3 pointer-events-none" />
          </div>
        </div>

        {activeTab === "projects" && canView && (
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
            {manage.can && (
              <button
                onClick={() => setSqmModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-xs whitespace-nowrap"
              >
                <Zap className="w-4 h-4" />
                <span>تخطيط المواد بالـ m²</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-4">
        <button onClick={() => setActiveTab("projects")} className={tabClass(activeTab === "projects")}>
          مخزون المشروع
        </button>
        <button onClick={() => setActiveTab("ledger")} className={tabClass(activeTab === "ledger")}>
          سجل صرف المواد
        </button>
        <button onClick={() => setActiveTab("defaults")} className={tabClass(activeTab === "defaults")}>
          المواد الافتراضية (m²)
        </button>
      </div>

      {/* Tab 1: Project stock */}
      {activeTab === "projects" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
            <h2 className="font-semibold text-gray-900">
              قائمة المواد في مخزن: {activeProjectSummary?.projectName || "المشروع"}
            </h2>
            {canView && <span className="text-xs text-gray-500">إجمالي المواد: {filteredProjectItems.length}</span>}
          </div>

          {projectGate(
            itemsQuery.isPending ? (
              <StateRow>جاري تحميل المواد...</StateRow>
            ) : itemsQuery.isError ? (
              <QueryError error={itemsQuery.error} onRetry={() => itemsQuery.refetch()} />
            ) : filteredProjectItems.length === 0 ? (
              <StateRow>
                {searchQuery.trim()
                  ? "لا توجد مواد مطابقة للبحث."
                  : manage.can
                    ? 'لا توجد مواد في مخزن هذا المشروع بعد. يمكنك استخدام "تخطيط المواد بالـ m²" لإدراج الكميات المخططة، أو إضافة المواد من تطبيق الموقع.'
                    : "لا توجد مواد في مخزن هذا المشروع بعد."}
              </StateRow>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right text-gray-600">
                  <thead className="text-xs text-gray-700 bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">المادة</th>
                      <th className="px-4 py-3">المواصفات</th>
                      <th className="px-4 py-3">الرصيد المتاح</th>
                      <th className="px-4 py-3">المخطط</th>
                      <th className="px-4 py-3">المستلم</th>
                      <th className="px-4 py-3">المصروف للمقاولين</th>
                      <th className="px-4 py-3">حد النقص</th>
                      <th className="px-4 py-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredProjectItems.map((item) => {
                      const { name, unit } = inventoryItemLabel(item);
                      const current = Number(item.current_quantity);
                      const isOut = current <= 0;
                      const isLow = current <= Number(item.low_stock_threshold);
                      const specs =
                        item.custom_specifications || item.shop_product_sizes?.shop_products?.description || "—";

                      return (
                        <tr key={item.id} className="hover:bg-gray-50/80">
                          <td className="px-4 py-3 font-semibold text-gray-900">{name}</td>
                          <td className="px-4 py-3 text-gray-500">{specs}</td>
                          <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">
                            {fmt(item.current_quantity)} {unit}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {Number(item.planned_quantity) > 0 ? fmt(item.planned_quantity) : "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-700">{fmt(item.total_received_quantity)}</td>
                          <td className="px-4 py-3 text-gray-700">{fmt(item.total_issued_quantity)}</td>
                          <td className="px-4 py-3 text-gray-500">{fmt(item.low_stock_threshold)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                isOut
                                  ? "bg-red-100 text-red-800"
                                  : isLow
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-green-100 text-green-800"
                              }`}
                            >
                              {isOut ? "نفد" : isLow ? "مخزون منخفض" : "متوفر"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ),
          )}
        </div>
      )}

      {/* Tab 2: Issue ledger for the selected project */}
      {activeTab === "ledger" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
            <h2 className="font-semibold text-gray-900">
              سجل صرف المواد للمقاولين: {activeProjectSummary?.projectName || "المشروع"}
            </h2>
            {canView && <span className="text-xs text-gray-500">إجمالي الحركات: {issues.length}</span>}
          </div>

          {projectGate(
            issuesQuery.isPending ? (
              <StateRow>جاري تحميل سجل الصرف...</StateRow>
            ) : issuesQuery.isError ? (
              <QueryError error={issuesQuery.error} onRetry={() => issuesQuery.refetch()} />
            ) : issues.length === 0 ? (
              <StateRow>لا توجد حركات صرف مسجلة في هذا المشروع بعد.</StateRow>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right text-gray-600">
                  <thead className="text-xs text-gray-700 bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">تاريخ الصرف</th>
                      <th className="px-4 py-3">المقاول</th>
                      <th className="px-4 py-3">المادة المصروفة</th>
                      <th className="px-4 py-3">الكمية</th>
                      <th className="px-4 py-3">منطقة العمل</th>
                      <th className="px-4 py-3">ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {issues.map((issue) => {
                      const { name, unit } = inventoryItemLabel(issue.project_inventory_items);
                      return (
                        <tr key={issue.id} className="hover:bg-gray-50/80">
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                            {new Date(issue.issue_date).toLocaleDateString("ar-LY")}
                          </td>
                          <td className="px-4 py-3 font-semibold text-blue-600">
                            {issue.contractors
                              ? `${issue.contractors.first_name} ${issue.contractors.last_name || ""}`.trim()
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-900">{name}</td>
                          <td className="px-4 py-3 font-bold text-emerald-600 whitespace-nowrap">
                            {fmt(issue.quantity)} {unit}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{issue.work_zone || "—"}</td>
                          <td className="px-4 py-3 text-gray-500">{issue.notes || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ),
          )}
        </div>
      )}

      {/* Tab 3: Template */}
      {activeTab === "defaults" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-gray-200 bg-gray-50/50">
            <h2 className="font-semibold text-gray-900">قائمة المواد الافتراضية ومعدلات الاحتياج (m²)</h2>
            <p className="text-xs text-gray-500 mt-1">
              تُستخدم لحساب الكميات المخططة لمشروع جديد: مساحة المشروع × معامل الاحتياج لكل متر مربع. الكميات المخططة لا
              تُضاف إلى الرصيد المتاح؛ الرصيد يزيد فقط عند استلام المواد فعلياً.
            </p>
          </div>

          {defaultsQuery.isPending ? (
            <StateRow>جاري التحميل...</StateRow>
          ) : defaultsQuery.isError ? (
            <QueryError error={defaultsQuery.error} onRetry={() => defaultsQuery.refetch()} />
          ) : defaultMaterials.length === 0 ? (
            <StateRow>لا توجد مواد افتراضية مسجلة بعد.</StateRow>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right text-gray-600">
                <thead className="text-xs text-gray-700 bg-gray-50 border-b border-gray-200">
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

      {/* m² planning modal, with a preview of what will be added */}
      {sqmModalOpen && manage.can && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">تخطيط مواد المشروع بالـ m²</h3>
                <p className="text-xs text-gray-500">مشروع: {activeProjectSummary?.projectName}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                مساحة المشروع الإجمالية (متر مربع):
              </label>
              <input
                type="number"
                min={1}
                value={inputSqm}
                onChange={(e) => setInputSqm(e.target.value)}
                placeholder="200"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                تُسجل هذه الكميات ككميات مخططة فقط، ويبقى الرصيد المتاح صفراً حتى يتم استلام المواد. المواد الموجودة مسبقاً
                في المشروع لن تتغير.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg">
              {!sqmValid ? (
                <StateRow>أدخل مساحة صحيحة لعرض الكميات.</StateRow>
              ) : itemsQuery.isPending || defaultsQuery.isPending ? (
                <StateRow>جاري التحميل...</StateRow>
              ) : (
                <table className="w-full text-sm text-right text-gray-600">
                  <thead className="text-xs text-gray-700 bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-2">المادة</th>
                      <th className="px-3 py-2">الكمية المخططة</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.map((p) => (
                      <tr key={p.id} className={p.exists ? "text-gray-400" : ""}>
                        <td className="px-3 py-2">{p.name}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {fmt(p.qty)} {p.unit}
                        </td>
                        <td className="px-3 py-2 text-xs">{p.exists ? "موجودة، سيتم تخطيها" : "جديدة"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-gray-500">
                {sqmValid ? `سيتم إضافة ${previewNewCount} من ${preview.length} مادة` : ""}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSqmModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={applyDefaults.isPending || !sqmValid || previewNewCount === 0}
                  onClick={handleApplyDefaults}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {applyDefaults.isPending ? "جاري الإضافة..." : "إضافة الكميات المخططة"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
