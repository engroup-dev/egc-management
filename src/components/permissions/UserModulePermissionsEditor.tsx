import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Minus,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import type {
  GrantScope,
  PermissionCatalogRow,
} from "../../types/permissions.types";
import { useAuth } from "../../hooks/useAuth";
import { usePermissionCatalog } from "../../hooks/permissions/usePermissionCatalog";
import { useGrants, useSaveGrants } from "../../hooks/permissions/useGrants";
import {
  useEffectivePermissions,
  useInheritedGrants,
} from "../../hooks/permissions/useEffectivePermissions";
import type { PermissionUserSummary } from "../../hooks/permissions/useUserPermissionsAdmin";
import {
  buildGrantDiff,
  describeChange,
  DraftMap,
  draftsFromGrants,
  EMPTY_DRAFT,
  PermissionState,
  SCOPE_LABELS,
  validateDrafts,
} from "./permissionModel";
import {
  classifyPermissionAction,
  getPermissionShortLabel,
  GroupedModulePermissions,
  groupCatalogByModule,
} from "./userModuleModel";
import Button from "../ui/Button";
import LoadingPage from "../ui/LoadingPage";

interface Props {
  selectedUser: PermissionUserSummary;
  allUsers: PermissionUserSummary[];
  onDirtyChange?: (dirty: boolean) => void;
}

interface CategoryStatus {
  state: "all" | "partial" | "none" | "unavailable";
  allowedCount: number;
  total: number;
}

function getCategoryStatus(
  perms: PermissionCatalogRow[],
  isAllowedFn: (p: PermissionCatalogRow) => boolean,
): CategoryStatus {
  if (perms.length === 0) {
    return { state: "unavailable", allowedCount: 0, total: 0 };
  }
  const allowedCount = perms.filter(isAllowedFn).length;
  if (allowedCount === perms.length) {
    return { state: "all", allowedCount, total: perms.length };
  }
  if (allowedCount > 0) {
    return { state: "partial", allowedCount, total: perms.length };
  }
  return { state: "none", allowedCount: 0, total: perms.length };
}

function UnavailableActionCell({
  actionLabel,
  hint,
}: {
  actionLabel: string;
  hint?: string;
}) {
  return (
    <span
      className="inline-flex items-center justify-center gap-1 h-7 px-1.5 rounded-md border border-dashed border-gray-200 bg-gray-50/80 text-[10px] font-medium text-gray-400 select-none cursor-help hover:border-gray-300 hover:text-gray-600 transition-colors"
      title={hint || `عملية (${actionLabel}) غير متوفرة في النظام لهذا الموديول`}
    >
      <span className="text-gray-300 text-[9px] leading-none font-bold">✕</span>
      <span>غير متاح</span>
    </span>
  );
}

export default function UserModulePermissionsEditor({
  selectedUser,
  allUsers,
  onDirtyChange,
}: Props) {
  const { user: currentAdmin } = useAuth();
  const userId = selectedUser.id;

  const { data: catalog, isLoading: catalogLoading } = usePermissionCatalog();
  const { data: savedGrants, isLoading: grantsLoading } = useGrants(
    "user",
    userId,
    { initialData: selectedUser.overrides },
  );
  const { data: effective } = useEffectivePermissions(userId);
  const { data: inherited } = useInheritedGrants(userId);
  const saveGrants = useSaveGrants();

  const original = useMemo(
    () => draftsFromGrants(catalog ?? [], savedGrants ?? []),
    [catalog, savedGrants],
  );

  const [drafts, setDrafts] = useState<DraftMap>(original);
  const [search, setSearch] = useState("");
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);
  const [presetScope, setPresetScope] =
    useState<GrantScope>("team_projects_only");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySearch, setCopySearch] = useState("");
  const [showProblems, setShowProblems] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccessBanner, setSaveSuccessBanner] = useState(false);

  useEffect(() => {
    setDrafts(original);
    setShowProblems(false);
    setSaveError(null);
    setSaveSuccessBanner(false);
    setExpandedModuleId(null);
  }, [original, userId]);

  const diff = useMemo(
    () => buildGrantDiff(catalog ?? [], original, drafts, "scoped"),
    [catalog, original, drafts],
  );

  useEffect(() => {
    onDirtyChange?.(!diff.isEmpty);
  }, [diff.isEmpty, onDirtyChange]);

  const problems = useMemo(
    () => validateDrafts(catalog ?? [], drafts, "scoped"),
    [catalog, drafts],
  );

  const summaryLines = useMemo(
    () => describeChange(catalog ?? [], diff, selectedUser.full_name),
    [catalog, diff, selectedUser.full_name],
  );

  const baselineById = useMemo<Record<string, { allowed: boolean; text: string }>>(() => {
    if (!catalog) return {};
    const effectiveByName = new Map(
      (effective ?? []).map((r) => [r.permission_name, r]),
    );
    const out: Record<string, { allowed: boolean; text: string }> = {};

    for (const perm of catalog) {
      const base = inherited?.[perm.id];
      const res = effectiveByName.get(perm.name);

      if (res?.source_layer === "ineligible") {
        out[perm.id] = { allowed: false, text: "غير مؤهل" };
        continue;
      }

      if (base) {
        const owner =
          base.layer === "role_baseline"
            ? `دور ${base.ownerName}`
            : `قسم ${base.ownerName}`;
        out[perm.id] = {
          allowed: base.allowed,
          text: `${base.allowed ? "مسموح" : "ممنوع"} من ${owner}`,
        };
      } else {
        out[perm.id] = { allowed: false, text: "غير محدد بالدور" };
      }
    }
    return out;
  }, [catalog, inherited, effective]);

  const isAllowed = (perm: PermissionCatalogRow): boolean => {
    const d = drafts[perm.id] ?? EMPTY_DRAFT;
    if (d.state === "allow") return true;
    if (d.state === "deny") return false;
    return baselineById[perm.id]?.allowed ?? false;
  };

  const moduleGroups = useMemo(
    () => groupCatalogByModule(catalog ?? []),
    [catalog],
  );

  const visibleModules = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return moduleGroups;
    return moduleGroups.filter(
      (g) =>
        g.module.label.toLowerCase().includes(term) ||
        g.module.subtitle.toLowerCase().includes(term) ||
        g.allPermissions.some(
          (p) =>
            p.name.toLowerCase().includes(term) ||
            p.description.toLowerCase().includes(term),
        ),
    );
  }, [moduleGroups, search]);

  // ─── Batch Updaters ────────────────────────────────────────────────
  const setPermissionsBatch = (
    perms: PermissionCatalogRow[],
    targetState: PermissionState,
    ensureGates?: PermissionCatalogRow[],
  ) => {
    setSaveSuccessBanner(false);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const p of perms) {
        const existing = prev[p.id] ?? EMPTY_DRAFT;
        const resolvedScope = p.is_project_scoped
          ? (existing.scope ?? presetScope)
          : null;
        if (targetState === "unset") {
          next[p.id] = { ...EMPTY_DRAFT };
        } else {
          next[p.id] = {
            ...existing,
            state: targetState,
            scope: resolvedScope,
          };
        }
      }
      if (targetState === "allow" && ensureGates) {
        for (const g of ensureGates) {
          const existing = prev[g.id] ?? EMPTY_DRAFT;
          next[g.id] = {
            ...existing,
            state: "allow",
            scope: g.is_project_scoped ? (existing.scope ?? presetScope) : null,
          };
        }
      }
      return next;
    });
  };

  const toggleCategory = (
    categoryPerms: PermissionCatalogRow[],
    gatePerms: PermissionCatalogRow[],
  ) => {
    if (categoryPerms.length === 0) return;
    const allAreAllowed = categoryPerms.every((p) => isAllowed(p));
    const nextState: PermissionState = allAreAllowed ? "deny" : "allow";
    setPermissionsBatch(
      categoryPerms,
      nextState,
      nextState === "allow" ? gatePerms : undefined,
    );
  };

  const toggleModuleGate = (gatePerms: PermissionCatalogRow[]) => {
    if (gatePerms.length === 0) return;
    const isCurrentlyOn = gatePerms.every((p) => isAllowed(p));
    setPermissionsBatch(gatePerms, isCurrentlyOn ? "deny" : "allow");
  };

  const applyFullModule = (group: GroupedModulePermissions) => {
    setPermissionsBatch(group.allPermissions, "allow");
  };

  const applyBlockModule = (group: GroupedModulePermissions) => {
    setPermissionsBatch(group.allPermissions, "deny");
  };

  const applyResetModule = (group: GroupedModulePermissions) => {
    setPermissionsBatch(group.allPermissions, "unset");
  };

  const toggleSinglePermission = (
    perm: PermissionCatalogRow,
    gatePerms?: PermissionCatalogRow[],
  ) => {
    setSaveSuccessBanner(false);
    const currentlyAllowed = isAllowed(perm);
    const nextState: PermissionState = currentlyAllowed ? "deny" : "allow";

    setDrafts((prev) => {
      const next = { ...prev };
      const existing = prev[perm.id] ?? EMPTY_DRAFT;
      const resolvedScope = perm.is_project_scoped
        ? (existing.scope ?? presetScope)
        : null;
      next[perm.id] = {
        ...existing,
        state: nextState,
        scope: resolvedScope,
      };

      if (nextState === "allow" && gatePerms) {
        for (const g of gatePerms) {
          const gExisting = prev[g.id] ?? EMPTY_DRAFT;
          next[g.id] = {
            ...gExisting,
            state: "allow",
            scope: g.is_project_scoped ? (gExisting.scope ?? presetScope) : null,
          };
        }
      }
      return next;
    });
  };

  const resetSinglePermission = (perm: PermissionCatalogRow) => {
    setSaveSuccessBanner(false);
    setDrafts((prev) => ({
      ...prev,
      [perm.id]: { ...EMPTY_DRAFT },
    }));
  };

  const handleBlockAllModules = () => {
    if (!catalog) return;
    setSaveSuccessBanner(false);
    setPermissionsBatch(catalog, "deny");
  };

  const handleCopyFromUser = (sourceUser: PermissionUserSummary) => {
    if (!catalog) return;
    setSaveSuccessBanner(false);
    setDrafts(draftsFromGrants(catalog, sourceUser.overrides));
    setCopyModalOpen(false);
    setCopySearch("");
  };

  const handleResetAll = () => {
    if (!catalog) return;
    setSaveSuccessBanner(false);
    const empty: DraftMap = {};
    for (const p of catalog) empty[p.id] = { ...EMPTY_DRAFT };
    setDrafts(empty);
  };

  const handleSaveClick = () => {
    setSaveError(null);
    if (problems.length > 0) {
      setShowProblems(true);
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    try {
      await saveGrants.mutateAsync({
        layer: "user",
        ownerId: userId,
        diff,
        grantedBy: currentAdmin?.id ?? null,
      });
      setConfirmOpen(false);
      setSaveSuccessBanner(true);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "فشل حفظ الصلاحيات",
      );
      setConfirmOpen(false);
    }
  };

  if (catalogLoading || (grantsLoading && !savedGrants)) {
    return <LoadingPage label="جاري تحميل الصلاحيات..." />;
  }

  const changeCount = diff.upserts.length + diff.deletes.length;
  const totalOverridesInDraft = Object.values(drafts).filter(
    (d) => d.state !== "unset",
  ).length;

  return (
    <div className="space-y-4" dir="rtl">
      {/* ─── 1) User Identity Header ───────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">
              {selectedUser.full_name}
            </h2>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                selectedUser.status === "active"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {selectedUser.status === "active" ? "نشط" : "غير نشط"}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <Briefcase size={13} className="text-gray-400" />
              الدور: <strong>{selectedUser.role_name || "بدون دور"}</strong>
            </span>
            <span className="flex items-center gap-1">
              <Building2 size={13} className="text-gray-400" />
              القسم: <strong>{selectedUser.department_name || "غير محدد"}</strong>
            </span>
            {selectedUser.email && (
              <span className="text-gray-400" dir="ltr">
                {selectedUser.email}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={handleBlockAllModules}
            className="text-red-700 hover:bg-red-50 border border-red-200"
            title="إغلاق وحجب جميع الموديولات للبدء من الصفر وتحديد ما تريده فقط"
          >
            <ShieldAlert size={13} className="ml-1 text-red-600" />
            حجب وإغلاق كل الموديولات
          </Button>

          <Button
            variant="ghost"
            size="xs"
            onClick={() => setCopyModalOpen(true)}
          >
            <Copy size={13} className="ml-1" />
            نسخ من مستخدم آخر
          </Button>

          {totalOverridesInDraft > 0 && (
            <Button variant="ghost" size="xs" onClick={handleResetAll}>
              <RotateCcw size={13} className="ml-1" />
              إرجاع الكل لافتراضي الدور
            </Button>
          )}

          {selectedUser.has_employee_profile && (
            <Link
              to={`/hr/employees/${selectedUser.id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <ExternalLink size={12} />
              ملف الموظف
            </Link>
          )}
        </div>
      </div>

      {/* ─── 2) Sticky Save Action Bar ─────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {diff.isEmpty ? (
            <span className="text-gray-500">لا توجد تغييرات غير محفوظة</span>
          ) : (
            <span className="text-amber-700 font-semibold">
              {changeCount} تغيير غير محفوظ للمستخدم {selectedUser.full_name}
            </span>
          )}
          {showProblems && problems.length > 0 && (
            <span className="flex items-center gap-1.5 text-red-600 mt-1 text-xs">
              <AlertTriangle size={14} />
              {problems.length} صلاحيات تحتاج تحديد نطاق التطبيق (كل المشاريع / مشاريع الفريق)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={diff.isEmpty || saveGrants.isPending}
            onClick={() => {
              setDrafts(original);
              setShowProblems(false);
              setSaveError(null);
            }}
          >
            <RotateCcw size={14} className="ml-1" />
            تراجع
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={diff.isEmpty || saveGrants.isPending}
            loading={saveGrants.isPending}
            onClick={handleSaveClick}
          >
            <Save size={14} className="ml-1" />
            حفظ التغييرات
          </Button>
        </div>
      </div>

      {saveSuccessBanner && diff.isEmpty && (
        <div className="border border-green-200 bg-green-50 text-green-800 rounded-xl px-4 py-2.5 text-xs flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 size={15} className="text-green-600" />
            تم حفظ الصلاحيات وتطبيقها فوراً للمستخدم {selectedUser.full_name}.
          </span>
          <button
            type="button"
            onClick={() => setSaveSuccessBanner(false)}
            className="text-green-700 hover:text-green-900"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {saveError && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
          {saveError}
        </div>
      )}

      {/* ─── 3) Search Bar ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400"
          />
          <input
            type="text"
            dir="rtl"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم الموديول (مثال: موظف، مالية، مشاريع...)"
            className="w-full border border-gray-200 rounded-lg py-2 pr-9 pl-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>نطاق الصلاحيات الميدانية:</span>
          {(["team_projects_only", "all_projects"] as GrantScope[]).map((sc) => (
            <button
              key={sc}
              type="button"
              onClick={() => setPresetScope(sc)}
              className={`px-2 py-1 rounded border transition-colors ${
                presetScope === sc
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {SCOPE_LABELS[sc]}
            </button>
          ))}
        </div>
      </div>

      {/* ─── 4) Clean Master Permissions Table ─────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden w-full">
        <table className="w-full text-right border-collapse table-fixed">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold text-gray-600">
              <th className="py-2.5 px-3">الموديول</th>
              <th className="py-2.5 px-1 text-center w-[60px]">ظهور</th>
              <th className="py-2.5 px-1 text-center w-[70px]">قراءة</th>
              <th className="py-2.5 px-1 text-center w-[70px]">حفظ</th>
              <th className="py-2.5 px-1 text-center w-[70px]">تعديل</th>
              <th className="py-2.5 px-1 text-center w-[70px]">حذف</th>
              <th className="py-2.5 px-1 text-center w-[115px]">تحكم سريع</th>
            </tr>
          </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {visibleModules.map((group) => {
                const Icon = group.module.icon;

                // Gate visibility status
                const gateIsAllowed =
                  group.gatePermissions.length === 0 ||
                  group.gatePermissions.every((p) => isAllowed(p));

                // Actions status
                const viewPerms = group.byCategory.view;
                const createPerms = group.byCategory.create;
                const editPerms = group.byCategory.edit;
                const deletePerms = group.byCategory.delete;

                const viewStatus = getCategoryStatus(viewPerms, isAllowed);
                const createStatus = getCategoryStatus(createPerms, isAllowed);
                const editStatus = getCategoryStatus(editPerms, isAllowed);
                const deleteStatus = getCategoryStatus(deletePerms, isAllowed);

                const anyCustomOverride = group.allPermissions.some(
                  (p) => (drafts[p.id] ?? EMPTY_DRAFT).state !== "unset",
                );
                const isExpanded = expandedModuleId === group.module.id;

                return (
                  <Fragment key={group.module.id}>
                    <tr
                      className={`hover:bg-gray-50/50 transition-colors ${
                        !gateIsAllowed ? "bg-gray-50/40 opacity-75" : ""
                      } ${isExpanded ? "bg-primary-superLight/20 border-b-0" : ""}`}
                    >
                      {/* Column 1: Module Identity with Expand Chevron */}
                      <td className="py-2.5 px-3 align-middle">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedModuleId(
                                isExpanded ? null : group.module.id,
                              )
                            }
                            className={`p-1.5 rounded-lg border transition-all shrink-0 ${
                              isExpanded
                                ? "bg-primary text-white border-primary rotate-180 shadow-2xs"
                                : "bg-gray-50 text-gray-400 border-gray-200 hover:text-gray-700 hover:bg-gray-100"
                            }`}
                            title={
                              isExpanded
                                ? "طي تفاصيل الشاشات"
                                : "اضغط لعرض وتخصيص تفاصيل الشاشات والصلاحيات الداخلية"
                            }
                          >
                            <ChevronDown size={13} />
                          </button>

                          <span className="p-1.5 rounded-lg bg-gray-100 text-primary shrink-0">
                            <Icon size={16} />
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedModuleId(
                                    isExpanded ? null : group.module.id,
                                  )
                                }
                                className="font-semibold text-gray-900 hover:text-primary text-right transition-colors text-xs sm:text-sm truncate"
                                title="اضغط لعرض أو طي تفاصيل الشاشات الداخلية"
                              >
                                {group.module.label}
                              </button>
                              {anyCustomOverride && (
                                <span className="text-[9px] bg-primary-superLight/60 text-primary border border-primary/20 px-1 py-0.2 rounded-full font-medium shrink-0">
                                  مخصص
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-400 mt-0.2 truncate" title={group.module.subtitle}>
                              {group.module.subtitle}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Module Visibility Switch */}
                      <td className="py-2 px-1 text-center align-middle">
                        {group.gatePermissions.length > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              toggleModuleGate(group.gatePermissions)
                            }
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              gateIsAllowed ? "bg-primary" : "bg-gray-200"
                            }`}
                            title={
                              gateIsAllowed
                                ? "الموديول ظاهر في القائمة الرئيسية (اضغط للإخفاء)"
                                : "الموديول مخفي من القائمة الرئيسية (اضغط للإظهار)"
                            }
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                gateIsAllowed
                                  ? "-translate-x-4"
                                  : "translate-x-0"
                              }`}
                            />
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-400">
                            دائم
                          </span>
                        )}
                      </td>

                    {/* Column 3: Read Toggle */}
                    <td className="py-2 px-1 text-center align-middle">
                      {viewPerms.length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            toggleCategory(viewPerms, group.gatePermissions)
                          }
                          className={`inline-flex items-center justify-center gap-1 h-7 px-1.5 rounded-md border text-[11px] font-semibold transition-all ${
                            viewStatus.state === "all"
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs hover:bg-emerald-700"
                              : viewStatus.state === "partial"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs hover:bg-emerald-100 ring-1 ring-emerald-300/40"
                              : "bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600"
                          }`}
                          title={
                            viewStatus.state === "all"
                              ? `صلاحيات القراءة مفعّلة بالكامل (${viewStatus.total} من ${viewStatus.total}) - اضغط للتعطيل`
                              : viewStatus.state === "partial"
                              ? `مسموح جزئياً (${viewStatus.allowedCount} من ${viewStatus.total} شاشات تعمل) - باقي الشاشات لم تُغلق، اضغط لتفعيل الكل`
                              : "صلاحية القراءة معطلة بالكامل - اضغط للتفعيل"
                          }
                        >
                          {viewStatus.state === "all" ? (
                            <Check size={12} className="stroke-[3]" />
                          ) : viewStatus.state === "partial" ? (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />
                          ) : (
                            <Minus size={12} />
                          )}
                          <span>قراءة</span>
                          {viewStatus.state === "partial" && (
                            <span className="text-[9px] px-1 rounded bg-emerald-200/80 text-emerald-900 font-bold leading-none font-mono">
                              {viewStatus.allowedCount}
                            </span>
                          )}
                        </button>
                      ) : (
                        <UnavailableActionCell
                          actionLabel="القراءة"
                          hint="لا توجد شاشات قراءة مستقلة في النظام لهذا الموديول"
                        />
                      )}
                    </td>

                    {/* Column 4: Create/Save Toggle */}
                    <td className="py-2 px-1 text-center align-middle">
                      {createPerms.length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            toggleCategory(createPerms, group.gatePermissions)
                          }
                          className={`inline-flex items-center justify-center gap-1 h-7 px-1.5 rounded-md border text-[11px] font-semibold transition-all ${
                            createStatus.state === "all"
                              ? "bg-blue-600 text-white border-blue-600 shadow-2xs hover:bg-blue-700"
                              : createStatus.state === "partial"
                              ? "bg-blue-50 text-blue-800 border-blue-300 shadow-2xs hover:bg-blue-100 ring-1 ring-blue-300/40"
                              : "bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600"
                          }`}
                          title={
                            createStatus.state === "all"
                              ? `صلاحيات الحفظ والإضافة مفعّلة بالكامل (${createStatus.total} من ${createStatus.total}) - اضغط للتعطيل`
                              : createStatus.state === "partial"
                              ? `مسموح جزئياً (${createStatus.allowedCount} من ${createStatus.total} عمليات تعمل) - اضغط لتفعيل الكل`
                              : "صلاحية الحفظ والإضافة مقفلة - اضغط للتفعيل"
                          }
                        >
                          {createStatus.state === "all" ? (
                            <Check size={12} className="stroke-[3]" />
                          ) : createStatus.state === "partial" ? (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                          ) : (
                            <Minus size={12} />
                          )}
                          <span>حفظ</span>
                          {createStatus.state === "partial" && (
                            <span className="text-[9px] px-1 rounded bg-blue-200/80 text-blue-900 font-bold leading-none font-mono">
                              {createStatus.allowedCount}
                            </span>
                          )}
                        </button>
                      ) : (
                        <UnavailableActionCell
                          actionLabel="الحفظ والإضافة"
                          hint="لا توجد عمليات إنشاء أو إضافة جديدة في النظام لهذا الموديول"
                        />
                      )}
                    </td>

                    {/* Column 5: Edit Toggle */}
                    <td className="py-2 px-1 text-center align-middle">
                      {editPerms.length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            toggleCategory(editPerms, group.gatePermissions)
                          }
                          className={`inline-flex items-center justify-center gap-1 h-7 px-1.5 rounded-md border text-[11px] font-semibold transition-all ${
                            editStatus.state === "all"
                              ? "bg-amber-600 text-white border-amber-600 shadow-2xs hover:bg-amber-700"
                              : editStatus.state === "partial"
                              ? "bg-amber-50 text-amber-800 border-amber-300 shadow-2xs hover:bg-amber-100 ring-1 ring-amber-300/40"
                              : "bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600"
                          }`}
                          title={
                            editStatus.state === "all"
                              ? `صلاحيات التعديل مفعّلة بالكامل (${editStatus.total} من ${editStatus.total}) - اضغط للتعطيل`
                              : editStatus.state === "partial"
                              ? `مسموح جزئياً (${editStatus.allowedCount} من ${editStatus.total} عمليات تعمل) - اضغط لتفعيل الكل`
                              : "صلاحية التعديل مقفلة - اضغط للتفعيل"
                          }
                        >
                          {editStatus.state === "all" ? (
                            <Check size={12} className="stroke-[3]" />
                          ) : editStatus.state === "partial" ? (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-600 shrink-0" />
                          ) : (
                            <Minus size={12} />
                          )}
                          <span>تعديل</span>
                          {editStatus.state === "partial" && (
                            <span className="text-[9px] px-1 rounded bg-amber-200/80 text-amber-900 font-bold leading-none font-mono">
                              {editStatus.allowedCount}
                            </span>
                          )}
                        </button>
                      ) : (
                        <UnavailableActionCell
                          actionLabel="التعديل"
                          hint="لا توجد عمليات تعديل بيانات في النظام لهذا الموديول"
                        />
                      )}
                    </td>

                    {/* Column 6: Delete Toggle */}
                    <td className="py-2 px-1 text-center align-middle">
                      {deletePerms.length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            toggleCategory(deletePerms, group.gatePermissions)
                          }
                          className={`inline-flex items-center justify-center gap-1 h-7 px-1.5 rounded-md border text-[11px] font-semibold transition-all ${
                            deleteStatus.state === "all"
                              ? "bg-red-600 text-white border-red-600 shadow-2xs hover:bg-red-700"
                              : deleteStatus.state === "partial"
                              ? "bg-red-50 text-red-800 border-red-300 shadow-2xs hover:bg-red-100 ring-1 ring-red-300/40"
                              : "bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600"
                          }`}
                          title={
                            deleteStatus.state === "all"
                              ? `صلاحيات الحذف مفعّلة بالكامل (${deleteStatus.total} من ${deleteStatus.total}) - اضغط للتعطيل`
                              : deleteStatus.state === "partial"
                              ? `مسموح جزئياً (${deleteStatus.allowedCount} من ${deleteStatus.total} عمليات تعمل) - اضغط لتفعيل الكل`
                              : "صلاحية الحذف مقفلة - اضغط للتفعيل"
                          }
                        >
                          {deleteStatus.state === "all" ? (
                            <Check size={12} className="stroke-[3]" />
                          ) : deleteStatus.state === "partial" ? (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />
                          ) : (
                            <Minus size={12} />
                          )}
                          <span>حذف</span>
                          {deleteStatus.state === "partial" && (
                            <span className="text-[9px] px-1 rounded bg-red-200/80 text-red-900 font-bold leading-none font-mono">
                              {deleteStatus.allowedCount}
                            </span>
                          )}
                        </button>
                      ) : (
                        <UnavailableActionCell
                          actionLabel="الحذف"
                          hint="عمليات الحذف غير متوفرة في النظام لهذا الموديول (حماية للسجلات)"
                        />
                      )}
                    </td>

                    {/* Column 7: Quick Actions */}
                    <td className="py-2 px-1 text-center align-middle">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => applyFullModule(group)}
                          className="px-1.5 py-0.5 text-[11px] rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 font-medium transition-colors whitespace-nowrap"
                          title="منح جميع الصلاحيات في هذا الموديول"
                        >
                          كامل
                        </button>

                        <button
                          type="button"
                          onClick={() => applyBlockModule(group)}
                          className="px-1.5 py-0.5 text-[11px] rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 font-medium transition-colors whitespace-nowrap"
                          title="حجب الموديول بالكامل"
                        >
                          حجب
                        </button>

                        {anyCustomOverride && (
                          <button
                            type="button"
                            onClick={() => applyResetModule(group)}
                            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            title="إرجاع الموديول لافتراضي الدور"
                          >
                            <RotateCcw size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expandable Drill-Down Sub-Table */}
                  {isExpanded && (
                    <tr className="bg-slate-50/70 border-b border-gray-200">
                      <td colSpan={7} className="p-2 sm:px-3 sm:py-2.5">
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                          <div className="px-3 py-2 bg-gray-50/90 border-b border-gray-200 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-800">
                                شاشات وصلاحيات موديول {group.module.label}
                              </span>
                              <span className="text-gray-400 font-normal">
                                ({group.allPermissions.length} بند)
                              </span>
                            </div>
                            <span className="text-gray-400 text-[11px]">
                              يمكنك تخصيص كل عملية أو شاشة داخلية بشكل مستقل
                            </span>
                          </div>

                          <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                            {group.allPermissions.map((perm) => {
                              const allowed = isAllowed(perm);
                              const draft = drafts[perm.id] ?? EMPTY_DRAFT;
                              const isCustomized = draft.state !== "unset";
                              const cat = classifyPermissionAction(
                                perm,
                                group.module,
                              );
                              const baseline = baselineById[perm.id];

                              return (
                                <div
                                  key={perm.id}
                                  className={`px-3 py-2 flex items-center justify-between gap-3 text-xs transition-colors ${
                                    allowed ? "bg-white" : "bg-gray-50/50"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${
                                        cat === "gate"
                                          ? "bg-purple-50 text-purple-700 border-purple-200"
                                          : cat === "view"
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                          : cat === "create"
                                          ? "bg-blue-50 text-blue-700 border-blue-200"
                                          : cat === "edit"
                                          ? "bg-amber-50 text-amber-700 border-amber-200"
                                          : "bg-red-50 text-red-700 border-red-200"
                                      }`}
                                    >
                                      {cat === "gate"
                                        ? "بوابة الموديول"
                                        : cat === "view"
                                        ? "قراءة"
                                        : cat === "create"
                                        ? "حفظ"
                                        : cat === "edit"
                                        ? "تعديل"
                                        : "حذف"}
                                    </span>

                                    <div className="min-w-0 flex-1">
                                      <p
                                        className="font-medium text-gray-800 truncate"
                                        title={perm.description || perm.name}
                                      >
                                        {getPermissionShortLabel(perm)}
                                      </p>
                                      <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">
                                        {perm.name}
                                        {baseline ? ` · ${baseline.text}` : ""}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {perm.is_project_scoped && allowed && (
                                      <select
                                        value={draft.scope ?? presetScope}
                                        onChange={(e) =>
                                          setDrafts((prev) => ({
                                            ...prev,
                                            [perm.id]: {
                                              ...(prev[perm.id] ?? EMPTY_DRAFT),
                                              state: "allow",
                                              scope: e.target.value as GrantScope,
                                            },
                                          }))
                                        }
                                        className="border border-gray-200 rounded px-1.5 py-0.5 text-[11px] text-gray-600 bg-white focus:outline-none"
                                      >
                                        <option value="team_projects_only">
                                          مشاريع الفريق
                                        </option>
                                        <option value="all_projects">
                                          كل المشاريع
                                        </option>
                                      </select>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleSinglePermission(
                                          perm,
                                          group.gatePermissions,
                                        )
                                      }
                                      className={`inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[11px] font-semibold transition-all ${
                                        allowed
                                          ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                                          : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-800"
                                      }`}
                                    >
                                      {allowed ? (
                                        <>
                                          <Check
                                            size={11}
                                            className="stroke-[3]"
                                          />
                                          <span>مسموح</span>
                                        </>
                                      ) : (
                                        <>
                                          <X size={11} className="stroke-[3]" />
                                          <span>ممنوع</span>
                                        </>
                                      )}
                                    </button>

                                    {isCustomized && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          resetSinglePermission(perm)
                                        }
                                        className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                        title="إرجاع البند لافتراضي الدور"
                                      >
                                        <RotateCcw size={11} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            </tbody>
          </table>
        </div>

      {/* ─── 5) Copy From Another User Modal ───────────────────────────── */}
      {copyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            dir="rtl"
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  نسخ الصلاحيات من مستخدم آخر
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  انسخ تخصيصات أي مستخدم آخر إلى مسودة{" "}
                  <strong>{selectedUser.full_name}</strong> لتراجعها قبل الحفظ.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCopyModalOpen(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 border-b border-gray-100">
              <div className="relative">
                <Search
                  size={15}
                  className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400"
                />
                <input
                  type="text"
                  dir="rtl"
                  value={copySearch}
                  onChange={(e) => setCopySearch(e.target.value)}
                  placeholder="ابحث باسم المستخدم أو الدور..."
                  className="w-full border border-gray-200 rounded-lg py-2 pr-9 pl-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="p-3 overflow-y-auto flex-1">
              {allUsers
                .filter((u) => {
                  if (u.id === userId) return false;
                  const t = copySearch.trim().toLowerCase();
                  if (!t) return true;
                  return (
                    u.full_name.toLowerCase().includes(t) ||
                    (u.role_name ?? "").toLowerCase().includes(t)
                  );
                })
                .map((candidate) => (
                  <div
                    key={candidate.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {candidate.full_name}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        الدور: {candidate.role_name || "بدون دور"} ·{" "}
                        {candidate.total_override_count > 0
                          ? `${candidate.total_override_count} مخصصة`
                          : "افتراضي الدور"}
                      </div>
                    </div>
                    <Button
                      variant="primary-light"
                      size="xs"
                      onClick={() => handleCopyFromUser(candidate)}
                    >
                      نسخ
                    </Button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── 6) Save Confirmation Modal ────────────────────────────────── */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            dir="rtl"
            className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[85vh] overflow-y-auto"
          >
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900">
                تأكيد حفظ الصلاحيات
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                تأكيد التعديلات للمستخدم <strong>{selectedUser.full_name}</strong>
              </p>
            </div>

            <div className="px-5 py-4 space-y-2">
              {summaryLines.map((line, index) => (
                <p
                  key={index}
                  className="text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                >
                  {line}
                </p>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmOpen(false)}
                disabled={saveGrants.isPending}
              >
                إلغاء
              </Button>
              <Button
                variant="success"
                size="sm"
                onClick={handleConfirmSave}
                loading={saveGrants.isPending}
              >
                تأكيد وحفظ
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
