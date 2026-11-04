import React, { useState, useMemo } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Edit3,
  FileText,
  HardHat,
  ListTodo,
  Search,
  ShieldAlert,
  Smartphone,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import {
  useAnalyticsData,
  useUpdateProjectProgress,
  ProjectRiskAnalytics,
} from "../../hooks/analytics/useAnalyticsData";
import LoadingPage from "../../components/ui/LoadingPage";

type ActiveTab = "overview" | "projects" | "contractors" | "trades" | "mobile";
type ProjectStatusFilter = "all" | "in_progress" | "completed" | "delayed" | "on_track";

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState<ProjectStatusFilter>("all");
  const [editingProject, setEditingProject] = useState<ProjectRiskAnalytics | null>(null);
  const [newProgressVal, setNewProgressVal] = useState<number>(0);

  const { data, isLoading, error } = useAnalyticsData();
  const updateProgressMutation = useUpdateProjectProgress();

  const handleOpenEdit = (project: ProjectRiskAnalytics) => {
    setEditingProject(project);
    setNewProgressVal(project.actualProgressPct);
  };

  const handleSaveProgress = () => {
    if (!editingProject) return;
    updateProgressMutation.mutate(
      { projectId: editingProject.projectId, progressPct: newProgressVal },
      {
        onSuccess: () => setEditingProject(null),
      }
    );
  };

  const projectCounts = useMemo(() => {
    const list = data?.projects ?? [];
    return {
      all: list.length,
      in_progress: list.filter((p) => p.status !== "completed" && p.actualProgressPct < 100).length,
      completed: list.filter((p) => p.status === "completed" || p.actualProgressPct >= 100).length,
      delayed: list.filter((p) => p.riskStatus === "critical" || p.riskStatus === "attention" || p.delayDays > 0).length,
      on_track: list.filter((p) => p.riskStatus === "on_track" && p.delayDays === 0).length,
    };
  }, [data?.projects]);

  const filteredProjects = useMemo(() => {
    if (!data?.projects) return [];
    let list = data.projects;

    // Filter by project status / completion
    if (projectStatusFilter === "in_progress") {
      list = list.filter((p) => p.status !== "completed" && p.actualProgressPct < 100);
    } else if (projectStatusFilter === "completed") {
      list = list.filter((p) => p.status === "completed" || p.actualProgressPct >= 100);
    } else if (projectStatusFilter === "delayed") {
      list = list.filter((p) => p.riskStatus === "critical" || p.riskStatus === "attention" || p.delayDays > 0);
    } else if (projectStatusFilter === "on_track") {
      list = list.filter((p) => p.riskStatus === "on_track" && p.delayDays === 0);
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((p) => p.projectName.toLowerCase().includes(q));
  }, [data?.projects, projectStatusFilter, searchQuery]);

  const filteredContractors = useMemo(() => {
    if (!data?.contractors) return [];
    if (!searchQuery.trim()) return data.contractors;
    const q = searchQuery.toLowerCase();
    return data.contractors.filter(
      (c) =>
        c.contractorName.toLowerCase().includes(q) ||
        c.projectNames.some((p) => p.toLowerCase().includes(q))
    );
  }, [data?.contractors, searchQuery]);

  if (isLoading) {
    return <LoadingPage label="جاري تجميع وتحليل بيانات الشركة الحية والمؤشرات..." />;
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center" dir="rtl">
        <p className="text-red-600 font-semibold">حدث خطأ أثناء تحميل بيانات التحليلات.</p>
      </div>
    );
  }

  const { tasks, contractors, trades, projects, mobile, finance } = data;

  // Overview metrics
  const criticalProjectsCount = projects.filter((p) => p.riskStatus === "critical").length;
  const overloadedContractorsCount = contractors.filter((c) => c.workloadStatus === "overloaded").length;
  const shortageTradesCount = trades.filter((t) => t.isShortage).length;

  return (
    <div dir="rtl" className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-primary/10 text-primary">
              <BarChart3 className="h-6 w-6" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              التحليلات ومؤشرات الأداء (Analytics & KPIs)
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">
            لوحة القيادة التنفيذية لمتابعة الإنجاز الفعلي، السيولة النقدية، سعة المقاولين، ونشاط المهندسين بالميدان
          </p>
        </div>

        {/* Global Key Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {finance.hasCashDeficit && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-100 text-red-800 text-xs font-bold border border-red-300">
              <AlertTriangle size={14} className="text-red-600" />
              عجز سيولة نقدية
            </span>
          )}
          {criticalProjectsCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-700 text-xs font-bold border border-red-200">
              <AlertTriangle size={14} className="text-red-600" />
              {criticalProjectsCount} مشاريع متأخرة
            </span>
          )}
          {overloadedContractorsCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">
              <HardHat size={14} className="text-amber-600" />
              {overloadedContractorsCount} مقاولين مضغوطين
            </span>
          )}
          {shortageTradesCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 text-orange-700 text-xs font-bold border border-orange-200">
              <Users size={14} className="text-orange-600" />
              {shortageTradesCount} حرف بها عجز عمالة
            </span>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto gap-2 border-b border-gray-200 pb-2">
        {[
          { id: "overview", label: "📊 نظرة عامة شاملة والسيولة", icon: TrendingUp },
          { id: "projects", label: "🚨 مخاطر المشاريع والتدفق", icon: AlertTriangle },
          { id: "contractors", label: "👷‍♂️ سعة وضغط المقاولين", icon: HardHat },
          { id: "trades", label: "🧱 توزيع الحرف ونقص العمالة", icon: Users },
          { id: "mobile", label: "📱 نشاط الميدان وطلبات المواد", icon: Smartphone },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as ActiveTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? "bg-primary text-white shadow-sm"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: OVERVIEW ─── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Top 4 Executive KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Tasks Progress */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-gray-500">
                <span className="text-xs font-semibold">معدل إنجاز المهام</span>
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <ListTodo size={18} />
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-gray-900">{tasks.completionRate}%</span>
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
                  <ArrowUpRight size={14} />
                  {tasks.completedTasks} من {tasks.totalTasks}
                </span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all"
                  style={{ width: `${tasks.completionRate}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-gray-500">
                <span>{tasks.inProgressTasks} قيد التنفيذ</span>
                <span className="text-red-600 font-semibold">{tasks.overdueTasks} متأخرة</span>
              </div>
            </div>

            {/* KPI 2: Projects On-Track */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-gray-500">
                <span className="text-xs font-semibold">انضباط المشاريع للجدول</span>
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <Clock size={18} />
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-gray-900">
                  {projects.length > 0
                    ? Math.round((projects.filter((p) => p.riskStatus === "on_track").length / projects.length) * 100)
                    : 100}
                  %
                </span>
                <span className="text-xs font-semibold text-gray-600">
                  {projects.filter((p) => p.riskStatus === "on_track").length} من {projects.length} مشاريع
                </span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{
                    width: `${
                      projects.length > 0
                        ? (projects.filter((p) => p.riskStatus === "on_track").length / projects.length) * 100
                        : 100
                    }%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-amber-600 font-semibold">
                  {projects.filter((p) => p.riskStatus === "attention").length} بحاجة لمتابعة
                </span>
                <span className="text-red-600 font-semibold">{criticalProjectsCount} حرجة</span>
              </div>
            </div>

            {/* KPI 3: Contractor Overload */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-gray-500">
                <span className="text-xs font-semibold">ضغط وتوزيع المقاولين</span>
                <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <HardHat size={18} />
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-gray-900">{contractors.length} مقاول</span>
                <span className="text-xs font-semibold text-emerald-600">
                  {contractors.filter((c) => c.workloadStatus === "available").length} متاح للتعاقد
                </span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full flex overflow-hidden">
                <div
                  className="bg-red-500 h-full"
                  style={{ width: `${(overloadedContractorsCount / Math.max(1, contractors.length)) * 100}%` }}
                  title="مضغوط"
                />
                <div
                  className="bg-amber-400 h-full"
                  style={{
                    width: `${
                      (contractors.filter((c) => c.workloadStatus === "optimal").length /
                        Math.max(1, contractors.length)) *
                      100
                    }%`,
                  }}
                  title="معتدل"
                />
                <div
                  className="bg-emerald-500 h-full"
                  style={{
                    width: `${
                      (contractors.filter((c) => c.workloadStatus === "available").length /
                        Math.max(1, contractors.length)) *
                      100
                    }%`,
                  }}
                  title="متاح"
                />
              </div>
              <div className="flex justify-between text-[11px] text-gray-500">
                <span className="text-red-600 font-semibold">{overloadedContractorsCount} مضغوطين (3+ مشاريع)</span>
                <span>{contractors.filter((c) => c.workloadStatus === "optimal").length} معتدل</span>
              </div>
            </div>

            {/* KPI 4: Mobile Adoption */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-gray-500">
                <span className="text-xs font-semibold">تفاعل الموبايل وطلبات المواد</span>
                <span className="p-2 rounded-xl bg-purple-50 text-purple-600">
                  <Smartphone size={18} />
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-gray-900">{mobile.adoptionRatePct}%</span>
                <span className="text-xs font-semibold text-purple-600 flex items-center gap-0.5">
                  <Zap size={14} />
                  {mobile.orders.totalOrders} طلب مواد
                </span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-purple-600 h-full rounded-full transition-all"
                  style={{ width: `${mobile.adoptionRatePct}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-gray-500">
                <span>{mobile.activeEngineersCount} مهندس نشط</span>
                <span>{mobile.penalties.totalCount} مخالفة ميدانية</span>
              </div>
            </div>
          </div>

          {/* ─── CASH FLOW & FINANCIAL HEALTH (ركن السيولة والالتزامات النقدية) ─── */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-6 shadow-lg space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Wallet className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    ركن السيولة والتدفق النقدي (Cash Flow & Financial Health)
                  </h3>
                  <p className="text-xs text-slate-300">
                    متابعة التدفقات النقدية الداخلة من الزبائن، المصروفات، التزامات المقاولين، ووفر الغرامات
                  </p>
                </div>
              </div>

              {finance.hasCashDeficit ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/20 text-red-300 text-xs font-bold border border-red-500/40">
                  <AlertTriangle size={14} className="text-red-400" />
                  تحذير: عجز سيولة نقدية (المصروف &gt; المقبوض)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/40">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  السيولة مستقرة وموجبة ✓
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Net Cash Flow */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>صافي التدفق النقدي (Net Cash)</span>
                  <DollarSign size={16} className="text-emerald-400" />
                </div>
                <div className="text-2xl font-black text-white">
                  {finance.netCashFlow.toLocaleString()} <span className="text-xs font-normal text-slate-400">د.ل</span>
                </div>
                <div className="text-[11px] text-slate-300 space-y-0.5">
                  <div className="flex justify-between">
                    <span>مقبوض زبائن:</span>
                    <span className="text-emerald-400 font-bold">{finance.totalIncomeCollected.toLocaleString()} د.ل</span>
                  </div>
                  <div className="flex justify-between">
                    <span>مصروف مشاريع:</span>
                    <span className="text-slate-300 font-bold">{finance.totalExpensesPaid.toLocaleString()} د.ل</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Contractor Pending Dues */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>مستحقات المقاولين المعلقة</span>
                  <CreditCard size={16} className="text-amber-400" />
                </div>
                <div className="text-2xl font-black text-amber-300">
                  {finance.contractorPendingDues.toLocaleString()} <span className="text-xs font-normal text-slate-400">د.ل</span>
                </div>
                <div className="text-[11px] text-slate-300 space-y-0.5">
                  <div className="flex justify-between">
                    <span>إجمالي العقود:</span>
                    <span className="font-semibold">{finance.totalContractorAgreements.toLocaleString()} د.ل</span>
                  </div>
                  <div className="flex justify-between">
                    <span>تم صرفه فعلياً:</span>
                    <span className="text-slate-400">{finance.totalContractorPaid.toLocaleString()} د.ل</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Recovered Penalties */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>إجمالي الغرامات المحصلة (الوفر)</span>
                  <ShieldAlert size={16} className="text-teal-400" />
                </div>
                <div className="text-2xl font-black text-teal-300">
                  {finance.penaltiesRecovered.toLocaleString()} <span className="text-xs font-normal text-slate-400">د.ل</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  مبالغ تم خصمها فعلياً من دفعات المقاولين نتيجة المخالفات كوفورات لصالح الشركة
                </p>
              </div>

              {/* Card 4: Spend vs Collection Ratio */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>نسبة التحصيل مقابل الصرف</span>
                  <TrendingUp size={16} className="text-primary" />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-white">{finance.collectionToSpendRatio}%</span>
                  <span className={`text-xs font-bold ${finance.collectionToSpendRatio >= 100 ? "text-emerald-400" : "text-red-400"}`}>
                    {finance.collectionToSpendRatio >= 100 ? "تغطية ممتازة" : "الصرف أسرع"}
                  </span>
                </div>
                <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      finance.collectionToSpendRatio >= 100 ? "bg-emerald-400" : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(100, finance.collectionToSpendRatio)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  {finance.collectionToSpendRatio >= 100
                    ? "التحصيلات تغطي كافة المصروفات بأريحية"
                    : "تحذير: الصرف يفوق السيولة المحصلة من المالك"}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Split Cards: Priority Attention Projects & Trade Shortages */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Priority Watch Projects */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="text-red-600 h-5 w-5" />
                  <h3 className="text-sm font-bold text-gray-900">مشاريع تتطلب تدخلاً عاجلاً</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("projects")}
                  className="text-xs text-primary hover:underline font-semibold"
                >
                  عرض كافة المشاريع &larr;
                </button>
              </div>

              <div className="divide-y divide-gray-100">
                {projects.slice(0, 4).map((p) => (
                  <div key={p.projectId} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                            p.riskStatus === "critical"
                              ? "bg-red-500 animate-pulse"
                              : p.riskStatus === "attention"
                              ? "bg-amber-400"
                              : "bg-emerald-500"
                          }`}
                        />
                        <h4 className="text-xs font-bold text-gray-900 truncate">{p.projectName}</h4>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-500">
                        <span>مخطط: {p.plannedProgressPct}%</span>
                        <span>•</span>
                        <span className="font-semibold text-gray-700">فعلي: {p.actualProgressPct}%</span>
                        {p.delayDays > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-red-600 font-bold">متأخر {p.delayDays} يوم</span>
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(p)}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium border border-gray-200 transition-colors"
                    >
                      <Edit3 size={13} />
                      تعديل الإنجاز
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Trade Shortages Alert Card */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="text-amber-600 h-5 w-5" />
                  <h3 className="text-sm font-bold text-gray-900">تنبيهات نقص العمالة والحرف الميدانية</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("trades")}
                  className="text-xs text-primary hover:underline font-semibold"
                >
                  كشف الحرف بالكامل &larr;
                </button>
              </div>

              <div className="space-y-3">
                {trades.slice(0, 4).map((t) => (
                  <div
                    key={t.tradeId}
                    className={`p-3 rounded-xl border flex items-center justify-between ${
                      t.isShortage ? "bg-amber-50/50 border-amber-200" : "bg-gray-50 border-gray-100"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="p-2 rounded-lg bg-white border border-gray-200 text-gray-700 font-bold text-xs">
                        {t.tradeName.slice(0, 2)}
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900">{t.tradeName}</h4>
                        <span className="text-[11px] text-gray-500">قسم {t.category}</span>
                      </div>
                    </div>

                    <div className="text-left">
                      {t.isShortage ? (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                          ⚠️ يوجد عجز / نقص
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                          ✓ متوفر كافي
                        </span>
                      )}
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {t.activeContractorsCount} مقاولين معتمدين في {t.assignedProjectsCount} مواقع
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: PROJECTS & BUDGET DELAY ─── */}
      {activeTab === "projects" && (
        <div className="space-y-5">
          {/* Filters Bar: Search, Status Badges & Quick Filter Chips */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search size={16} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
                <input
                  type="text"
                  placeholder="بحث عن اسم مشروع..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pr-9 pl-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Traffic Light Status Legend */}
              <div className="flex items-center gap-4 text-xs font-semibold text-gray-600 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  منضبط للجدول
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  تأخير بسيط
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  تأخير حرج (&gt; 15%)
                </span>
              </div>
            </div>

            {/* Quick Filter Buttons: الكل | قيد الإنجاز | منجز | متأخر | منضبط */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100 overflow-x-auto">
              <span className="text-xs font-bold text-gray-400 whitespace-nowrap ml-1">تصفية:</span>

              <button
                type="button"
                onClick={() => setProjectStatusFilter("all")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  projectStatusFilter === "all"
                    ? "bg-gray-900 text-white shadow-xs"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <span>جميع المشاريع</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    projectStatusFilter === "all" ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"
                  }`}
                >
                  {projectCounts.all}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setProjectStatusFilter("in_progress")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  projectStatusFilter === "in_progress"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/50"
                }`}
              >
                <span>⏳ قيد الإنجاز (مستمرة)</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    projectStatusFilter === "in_progress" ? "bg-white/20 text-white" : "bg-blue-200 text-blue-800"
                  }`}
                >
                  {projectCounts.in_progress}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setProjectStatusFilter("completed")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  projectStatusFilter === "completed"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/50"
                }`}
              >
                <span>✅ مشاريع منجزة بالكامل</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    projectStatusFilter === "completed" ? "bg-white/20 text-white" : "bg-emerald-200 text-emerald-800"
                  }`}
                >
                  {projectCounts.completed}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setProjectStatusFilter("delayed")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  projectStatusFilter === "delayed"
                    ? "bg-red-600 text-white shadow-xs"
                    : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200/50"
                }`}
              >
                <span>⚠️ متأخرة عن الجدول</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    projectStatusFilter === "delayed" ? "bg-white/20 text-white" : "bg-red-200 text-red-800"
                  }`}
                >
                  {projectCounts.delayed}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setProjectStatusFilter("on_track")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  projectStatusFilter === "on_track"
                    ? "bg-teal-600 text-white shadow-xs"
                    : "bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200/50"
                }`}
              >
                <span>🎯 منضبطة بالموعد</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    projectStatusFilter === "on_track" ? "bg-white/20 text-white" : "bg-teal-200 text-teal-800"
                  }`}
                >
                  {projectCounts.on_track}
                </span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-50/80 border-b border-gray-200 text-gray-600 font-bold">
                  <tr>
                    <th className="py-3 px-4">المشروع</th>
                    <th className="py-3 px-4">مخطط زمني</th>
                    <th className="py-3 px-4">إنجاز فعلي على الأرض</th>
                    <th className="py-3 px-4">مؤشر التأخير</th>
                    <th className="py-3 px-4">السيولة والمستحقات (مقبوض vs مصروف)</th>
                    <th className="py-3 px-4">استهلاك الميزانية</th>
                    <th className="py-3 px-4 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProjects.map((p) => {
                    return (
                      <tr key={p.projectId} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-gray-900">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{p.projectName}</span>
                              {p.status === "completed" || p.actualProgressPct >= 100 ? (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                  منجز بالكامل ✓
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-medium">
                                  قيد الإنجاز
                                </span>
                              )}
                            </div>
                            <span className="block text-[11px] font-normal text-gray-400 mt-0.5">
                              {p.startDate ? `بدأ: ${p.startDate}` : "بدون تاريخ بدء"}
                            </span>
                          </div>
                        </td>

                        {/* Planned Progress Bar */}
                        <td className="py-3.5 px-4 w-40">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="font-semibold text-slate-700">{p.plannedProgressPct}%</span>
                              <span className="text-gray-400">مخطط</span>
                            </div>
                            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-slate-400 h-full rounded-full"
                                style={{ width: `${p.plannedProgressPct}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Actual Progress Bar */}
                        <td className="py-3.5 px-4 w-40">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="font-bold text-primary">{p.actualProgressPct}%</span>
                              <span className="text-gray-400">فعلي معتمد</span>
                            </div>
                            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  p.riskStatus === "critical"
                                    ? "bg-red-500"
                                    : p.riskStatus === "attention"
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                                }`}
                                style={{ width: `${p.actualProgressPct}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Risk & Delay Status */}
                        <td className="py-3.5 px-4">
                          {p.riskStatus === "critical" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-bold text-[11px]">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-ping" />
                              متأخر {p.delayPct}% ({p.delayDays} يوم)
                            </span>
                          ) : p.riskStatus === "attention" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold text-[11px]">
                              تأخر بسيط {p.delayPct}%
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[11px]">
                              <CheckCircle2 size={12} />
                              منضبط للجدول
                            </span>
                          )}
                        </td>

                        {/* Cash Flow & Contractor Dues */}
                        <td className="py-3.5 px-4 w-52">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-gray-500">مقبوض:</span>
                              <span className="font-bold text-emerald-700">{p.totalCollected.toLocaleString()} د.ل</span>
                            </div>
                            <div className="flex justify-between text-[11px]">
                              <span className="text-gray-500">مصروف:</span>
                              <span className="font-bold text-gray-800">{p.totalSpent.toLocaleString()} د.ل</span>
                            </div>
                            <div className="pt-0.5 flex items-center justify-between gap-1 flex-wrap">
                              {p.isCashDeficit ? (
                                <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-700 text-[10px] font-bold inline-flex items-center gap-1">
                                  <AlertTriangle size={11} />
                                  عجز: {Math.abs(p.netCash).toLocaleString()} د.ل
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                                  فائض: +{p.netCash.toLocaleString()} د.ل
                                </span>
                              )}
                              {p.contractorPendingDues > 0 && (
                                <span className="text-[10px] text-amber-700 font-semibold">
                                  متبقي: {p.contractorPendingDues.toLocaleString()} د.ل
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Budget Burn */}
                        <td className="py-3.5 px-4 w-44">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="font-bold text-gray-900">
                                {p.totalSpent.toLocaleString()} د.ل
                              </span>
                              <span className="text-gray-500">({p.budgetBurnPct}%)</span>
                            </div>
                            <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  p.hasFinancialWarning ? "bg-red-600" : "bg-blue-600"
                                }`}
                                style={{ width: `${p.budgetBurnPct}%` }}
                              />
                            </div>
                            {p.hasFinancialWarning && (
                              <span className="text-[10px] text-red-600 font-bold block">
                                ⚠️ الصرف ({p.budgetBurnPct}%) أعلى بكثير من الإنجاز ({p.actualProgressPct}%)!
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Action: Edit actual progress */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(p)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold transition-colors cursor-pointer"
                          >
                            <Edit3 size={13} />
                            تحديث الإنجاز
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: CONTRACTOR WORKLOAD ─── */}
      {activeTab === "contractors" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
              <input
                type="text"
                placeholder="بحث عن مقاول أو مشروع..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pr-9 pl-3 text-xs focus:outline-none"
              />
            </div>
            <div className="text-xs text-gray-500">
              إجمالي المقاولين: <span className="font-bold text-gray-900">{contractors.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredContractors.map((c) => {
              return (
                <div
                  key={c.contractorId}
                  className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="p-2 rounded-xl bg-amber-50 text-amber-700">
                          <HardHat size={18} />
                        </span>
                        <div>
                          <h4 className="text-sm font-bold text-gray-900">{c.contractorName}</h4>
                          <span className="text-[11px] text-gray-400">{c.phone || "بدون هاتف"}</span>
                        </div>
                      </div>

                      {c.workloadStatus === "overloaded" ? (
                        <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold whitespace-nowrap">
                          🚨 مضغوط ({c.activeProjectsCount} مشاريع)
                        </span>
                      ) : c.workloadStatus === "optimal" ? (
                        <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold whitespace-nowrap">
                          معتدل ({c.activeProjectsCount} مشاريع)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold whitespace-nowrap">
                          ✓ متاح للتعاقد
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">إجمالي قيمة العقود:</span>
                      <span className="font-bold text-primary">
                        {c.totalAgreementsValue.toLocaleString()} د.ل
                      </span>
                    </div>

                    {c.projectNames.length > 0 && (
                      <div className="pt-2">
                        <span className="text-[11px] text-gray-400 block mb-1">المشاريع الحالية:</span>
                        <div className="flex flex-wrap gap-1">
                          {c.projectNames.map((pName, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-[10px] font-medium"
                            >
                              {pName}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TAB 4: TRADES & LABOR DISTRIBUTION ─── */}
      {activeTab === "trades" && (
        <div className="space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-900">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5 h-5 w-5" />
            <div>
              <h4 className="text-xs sm:text-sm font-bold">مصفوفة توازن المهن والعمالة الحرفية</h4>
              <p className="text-xs text-amber-800 mt-0.5">
                توضح هذه الشاشة تخصصات العمالة المتاحة ومقارنتها باحتياج المشاريع لتفادي توقف البنود بسبب نقص الحرفيين
                (مثل اللياسين أو الزواقين).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {trades.map((t) => (
              <div
                key={t.tradeId}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                    {t.tradeName.slice(0, 2)}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">{t.tradeName}</h4>
                    <span className="text-xs text-gray-400">تصنيف: {t.category}</span>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-600">
                      <span>{t.activeContractorsCount} مقاولين / جهات مسجلة</span>
                      <span>•</span>
                      <span>تعمل في {t.assignedProjectsCount} مشاريع</span>
                    </div>
                  </div>
                </div>

                <div className="text-left">
                  {t.isShortage ? (
                    <div className="space-y-1">
                      <span className="px-3 py-1 rounded-full bg-red-100 text-red-800 font-bold text-xs inline-block">
                        ⚠️ نقص حاد
                      </span>
                      <span className="block text-[11px] text-red-600 font-medium">مطلوب توظيف/تعاقد</span>
                    </div>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs inline-block">
                      ✓ متوفر بكفاية
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── TAB 5: MOBILE & FIELD ACTIVITY ─── */}
      {activeTab === "mobile" && (
        <div className="space-y-6">
          {/* 3 Real Mobile KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Card 1: Shop Orders */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-gray-500">
                <span className="text-xs font-semibold">طلبات المواد من الموقع</span>
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <FileText size={18} />
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-gray-900">{mobile.orders.totalOrders} طلب</span>
                <span className="text-xs font-semibold text-blue-600">
                  {mobile.orders.ordersThisMonth} هذا الشهر
                </span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all"
                  style={{ width: `${mobile.orders.approvalRatePct}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-gray-600">
                <span>نسبة الاعتماد: <strong className="text-emerald-600 font-bold">{mobile.orders.approvalRatePct}%</strong> ({mobile.orders.approvedOrders} معتمد)</span>
                <span className="text-amber-600 font-semibold">{mobile.orders.pendingOrders} قيد المراجعة</span>
              </div>
              <div className="pt-2 border-t border-gray-100 flex justify-between text-xs">
                <span className="text-gray-500">إجمالي قيمة المواد المعتمدة:</span>
                <span className="font-bold text-primary">{mobile.orders.totalApprovedValue.toLocaleString()} د.ل</span>
              </div>
            </div>

            {/* Card 2: Field Penalties */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-gray-500">
                <span className="text-xs font-semibold">الغرامات والمخالفات الميدانية</span>
                <span className="p-2 rounded-xl bg-red-50 text-red-600">
                  <ShieldAlert size={18} />
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-gray-900">{mobile.penalties.totalCount} مخالفة</span>
                <span className="text-xs font-semibold text-red-600 font-bold">
                  {mobile.penalties.totalAmount.toLocaleString()} د.ل
                </span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{
                    width: `${
                      mobile.penalties.totalCount > 0
                        ? Math.round((mobile.penalties.deductedCount / mobile.penalties.totalCount) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-gray-600">
                <span className="text-emerald-700 font-bold">
                  ✓ خُصم فعلياً: {mobile.penalties.deductedAmount.toLocaleString()} د.ل
                </span>
                <span className="text-amber-700 font-semibold">
                  قيد الخصم: {mobile.penalties.pendingAmount.toLocaleString()} د.ل
                </span>
              </div>
              <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-500">
                مبالغ الوفر المالي المخصومة مباشرة من دفعات المقاولين لصالح خزينة الشركة
              </div>
            </div>

            {/* Card 3: Mobile Adoption & Devices */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-gray-500">
                <span className="text-xs font-semibold">معدل تبني الطاقم والأجهزة</span>
                <span className="p-2 rounded-xl bg-purple-50 text-purple-600">
                  <Smartphone size={18} />
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-gray-900">{mobile.adoptionRatePct}%</span>
                <span className="text-xs font-semibold text-purple-600">
                  {mobile.activeEngineersCount} من أصل {mobile.totalEngineersCount} مهندس
                </span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-purple-600 h-full rounded-full transition-all"
                  style={{ width: `${mobile.adoptionRatePct}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-gray-500">
                <span>{mobile.activeDevicesCount} هاتف نشط بالموقع</span>
                <span className="text-emerald-600 font-bold">ربط مباشر مع الخادم ✓</span>
              </div>
              <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-500">
                تحكم كامل بصلاحيات دخول التطبيق وإلغاء التفعيل الفوري للمهندسين
              </div>
            </div>
          </div>

          {/* Leaderboard Table: Top Field Engineers */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <Award size={20} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    لوحة شرف وترتيب أنشط المهندسين ميدانياً (Site Performance Leaderboard)
                  </h3>
                  <p className="text-xs text-gray-500">
                    الترتيب مبني على: إغلاق المهام الميدانية (+3) • رفع طلبات المواد (+2) • تسجيل المخالفات (+2)
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-50/80 border-b border-gray-200 text-gray-600 font-bold">
                  <tr>
                    <th className="py-3 px-4 text-center">الترتيب</th>
                    <th className="py-3 px-4">اسم المهندس</th>
                    <th className="py-3 px-4 text-center">المهام المنجزة الميدانية</th>
                    <th className="py-3 px-4 text-center">طلبات المواد المرفوعة</th>
                    <th className="py-3 px-4 text-center">المخالفات المسجلة</th>
                    <th className="py-3 px-4 text-center">مجموع نقاط النشاط</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {mobile.topActiveEngineers.map((eng, idx) => (
                    <tr key={eng.userId || idx} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`h-7 w-7 rounded-full inline-flex items-center justify-center font-bold text-xs ${
                            idx === 0
                              ? "bg-amber-100 text-amber-800 border border-amber-300"
                              : idx === 1
                              ? "bg-slate-200 text-slate-700"
                              : idx === 2
                              ? "bg-orange-100 text-orange-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          #{idx + 1}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <span>{eng.name}</span>
                          {idx === 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200">
                              🥇 الأكثر نشاطاً
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-blue-600">
                        {eng.completedTasks} مهمة
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-purple-600">
                        {eng.ordersCreated} طلب مواد
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-red-600">
                        {eng.penaltiesCreated} مخالفة
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-black text-xs">
                          {eng.totalScore} نقطة
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: UPDATE PROJECT ACTUAL PROGRESS ─── */}
      {editingProject && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-gray-200 space-y-5 animate-scale-in">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-gray-900">تحديث نسبة الإنجاز الفعلي</h3>
              <button
                type="button"
                onClick={() => setEditingProject(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div>
              <p className="text-xs text-gray-500">المشروع المحدد:</p>
              <h4 className="text-sm font-bold text-primary mt-0.5">{editingProject.projectName}</h4>
            </div>

            <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-700">نسبة الإنجاز الفعلي على الأرض:</span>
                <span className="text-2xl font-black text-primary">{newProgressVal}%</span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={newProgressVal}
                onChange={(e) => setNewProgressVal(Number(e.target.value))}
                className="w-full accent-primary h-2 bg-gray-200 rounded-lg cursor-pointer"
              />

              {/* Quick Select Chips */}
              <div className="flex gap-2 pt-1 justify-center">
                {[10, 25, 50, 75, 90, 100].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setNewProgressVal(val)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                      newProgressVal === val
                        ? "bg-primary text-white"
                        : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveProgress}
                disabled={updateProgressMutation.isPending}
                className="flex-1 bg-primary hover:bg-primary-dark text-white py-2.5 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                {updateProgressMutation.isPending ? "جاري الحفظ..." : "حفظ واعتماد النسبة ✓"}
              </button>
              <button
                type="button"
                onClick={() => setEditingProject(null)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-100 font-bold text-xs transition-colors cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
