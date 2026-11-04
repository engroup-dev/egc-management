import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  Building2,
  CheckCircle2,
  CheckSquare,
  DollarSign,
  FileCheck2,
  FileSignature,
  FileText,
  HardHat,
  Lock,
  MapPin,
  PhoneCall,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import type { PermissionUserSummary } from "../../hooks/permissions/useUserPermissionsAdmin";
import { useAllProjectTeams } from "../../hooks/team/useAllProjectTeams";
import { useProjectRolesAdmin } from "../../hooks/team/useProjectRolesAdmin";
import { useAddTeamMember, useRemoveTeamMember } from "../../hooks/team/useTeamAssignments";
import { usePermissionCatalog } from "../../hooks/permissions/usePermissionCatalog";
import { useGrants, useSaveGrants } from "../../hooks/permissions/useGrants";
import type { GrantScope } from "../../types/permissions.types";
import LoadingPage from "../ui/LoadingPage";
import Button from "../ui/Button";

interface Props {
  selectedUser: PermissionUserSummary | null;
  allUsers: PermissionUserSummary[];
  onSelectUser: (user: PermissionUserSummary) => void;
  onSwitchToSystemPermissions?: () => void;
}

export interface MobileConfig {
  mobile_enabled: boolean;
  project_scope: GrantScope;
  // الاتفاقيات والعقود
  view_agreements: boolean;
  edit_agreements: boolean;
  // مقاولي الباطن والغرامات
  site_penalties: boolean;
  contractor_payments: boolean;
  contractor_contacts: boolean;
  // الخرائط والمخططات
  view_drawings: boolean;
  // المهام
  view_tasks: boolean;
  manage_tasks: boolean;
  // الطلبات والمشتريات
  material_requests: boolean;
  review_orders: boolean;
  // السرية المالية والراتب
  view_project_finance: boolean;
  view_own_salary: boolean;
  updated_at?: string;
  updated_by?: string;
}

const DEFAULT_MOBILE_CONFIG: MobileConfig = {
  mobile_enabled: true,
  project_scope: "team_projects_only",
  view_agreements: true,
  edit_agreements: false, // افتراضياً معطلة للحماية
  site_penalties: true,
  contractor_payments: true,
  contractor_contacts: true,
  view_drawings: true,
  view_tasks: true,
  manage_tasks: true,
  material_requests: true,
  review_orders: false, // افتراضياً معطلة
  view_project_finance: false, // افتراضياً معطلة لحماية سرية الأسعار
  view_own_salary: true,
};

const NOTE_PREFIX = "[mobile_builder_cfg]";

export default function MobileBuilderPermissionsTab({
  selectedUser,
  allUsers,
  onSelectUser,
  onSwitchToSystemPermissions,
}: Props) {
  const { user: currentAuthUser } = useAuth();

  // Search & engineer selection
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Add project assignment
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [selectedProjectIdToAdd, setSelectedProjectIdToAdd] = useState("");
  const [selectedRoleIdToAdd, setSelectedRoleIdToAdd] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // Toast feedback
  const [toast, setToast] = useState<{
    id: string;
    title: string;
    subtitle?: string;
  } | null>(null);

  const showToast = (title: string, subtitle?: string) => {
    const id = Date.now().toString();
    setToast({ id, title, subtitle });
    setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 3500);
  };

  // Queries
  const { data: allProjectsWithTeams, isLoading: projectsLoading } = useAllProjectTeams();
  const { data: projectRolesAdmin } = useProjectRolesAdmin();
  const { data: catalog } = usePermissionCatalog();

  // Mutations
  const addTeamMember = useAddTeamMember();
  const removeTeamMember = useRemoveTeamMember();
  const saveGrantsMutation = useSaveGrants();

  // Project counts per user
  const userProjectCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of allProjectsWithTeams ?? []) {
      for (const m of p.members) {
        if (m.userId) {
          map.set(m.userId, (map.get(m.userId) ?? 0) + 1);
        }
        if (m.personId && m.personId !== m.userId) {
          map.set(m.personId, (map.get(m.personId) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [allProjectsWithTeams]);

  // Active user selection
  const activeUser = useMemo(() => {
    if (selectedUser) return selectedUser;
    const withProj = allUsers.find(
      (u) => (userProjectCountMap.get(u.id) ?? 0) > 0,
    );
    return withProj ?? allUsers[0] ?? null;
  }, [selectedUser, allUsers, userProjectCountMap]);

  // Read existing grants for active user
  const { data: userGrants, isLoading: grantsLoading } = useGrants(
    "user",
    activeUser?.id,
    { initialData: activeUser?.overrides },
  );

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered engineers for autocomplete
  const filteredUsers = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return allUsers;
    return allUsers.filter(
      (u) =>
        u.full_name.toLowerCase().includes(term) ||
        (u.email ?? "").toLowerCase().includes(term) ||
        (u.role_name ?? "").toLowerCase().includes(term) ||
        (u.department_name ?? "").toLowerCase().includes(term),
    );
  }, [allUsers, searchQuery]);

  // Map permissions from catalog
  const permMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of catalog ?? []) {
      map.set(p.name, p.id);
    }
    return map;
  }, [catalog]);

  // Derive initial MobileConfig from existing grants
  const initialConfig = useMemo<MobileConfig>(() => {
    if (!userGrants || userGrants.length === 0) {
      return { ...DEFAULT_MOBILE_CONFIG };
    }

    // Check if there is an encoded JSON note
    const noteGrant = userGrants.find(
      (g) => g.note && g.note.includes(NOTE_PREFIX),
    );
    if (noteGrant && noteGrant.note) {
      try {
        const jsonStr = noteGrant.note.replace(NOTE_PREFIX, "").trim();
        const parsed = JSON.parse(jsonStr);
        return {
          ...DEFAULT_MOBILE_CONFIG,
          ...parsed,
        };
      } catch (err) {
        console.warn("Could not parse mobile builder config from note", err);
      }
    }

    // Infer from standard permission rows if no json note found
    const findGrant = (name: string) => {
      const pid = permMap.get(name);
      if (!pid) return undefined;
      return userGrants.find((g) => g.permission_id === pid);
    };

    const mobileAccessGate = findGrant("mobile_app_access");
    const agreementsGrant = findGrant("view_project_agreements") || findGrant("view_all_project_agreements");
    const editAgreementsGrant = findGrant("edit_project_agreements");
    const penaltyGrant = findGrant("create_contractor_penalty");
    const paymentsGrant = findGrant("view_contractor_payments");
    const contactsGrant = findGrant("view_contractor_contacts");
    const mapsGrant = findGrant("view_project_maps");
    const viewTasksGrant = findGrant("view_project_tasks");
    const manageTasksGrant = findGrant("manage_project_tasks");
    const ordersGrant = findGrant("view_project_orders") || findGrant("view_shop_orders");
    const reviewOrdersGrant = findGrant("review_shop_order_prices") || findGrant("approve_order");
    const financeGrant = findGrant("view_project_finance");
    const salaryGrant = findGrant("view_own_salary");

    return {
      mobile_enabled: mobileAccessGate ? mobileAccessGate.allowed : true,
      project_scope: (agreementsGrant?.scope as GrantScope) || (mobileAccessGate?.scope as GrantScope) || "team_projects_only",
      view_agreements: agreementsGrant ? agreementsGrant.allowed : true,
      edit_agreements: editAgreementsGrant ? editAgreementsGrant.allowed : false,
      site_penalties: penaltyGrant ? penaltyGrant.allowed : true,
      contractor_payments: paymentsGrant ? paymentsGrant.allowed : true,
      contractor_contacts: contactsGrant ? contactsGrant.allowed : true,
      view_drawings: mapsGrant ? mapsGrant.allowed : true,
      view_tasks: viewTasksGrant ? viewTasksGrant.allowed : true,
      manage_tasks: manageTasksGrant ? manageTasksGrant.allowed : true,
      material_requests: ordersGrant ? ordersGrant.allowed : true,
      review_orders: reviewOrdersGrant ? reviewOrdersGrant.allowed : false,
      view_project_finance: financeGrant ? financeGrant.allowed : false,
      view_own_salary: salaryGrant ? salaryGrant.allowed : true,
    };
  }, [userGrants, permMap]);

  // Local draft state
  const [config, setConfig] = useState<MobileConfig>(DEFAULT_MOBILE_CONFIG);
  const [isDirty, setIsDirty] = useState(false);

  // Sync draft whenever active user or initialConfig changes
  useEffect(() => {
    setConfig(initialConfig);
    setIsDirty(false);
  }, [initialConfig, activeUser?.id]);

  const updateConfig = <K extends keyof MobileConfig>(
    key: K,
    val: MobileConfig[K],
  ) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: val };
      setIsDirty(true);
      return next;
    });
  };

  // Projects assigned to this user
  const userAssignedProjects = useMemo(() => {
    if (!activeUser) return [];
    const list: {
      projectId: string;
      projectName: string;
      serialNumber: number | null;
      status: string | null;
      assignmentId: string;
      projectRoleName: string;
      projectRoleId: string;
    }[] = [];

    for (const p of allProjectsWithTeams ?? []) {
      for (const m of p.members) {
        if (m.userId === activeUser.id || m.personId === activeUser.id) {
          list.push({
            projectId: p.projectId,
            projectName: p.projectName,
            serialNumber: p.serialNumber,
            status: p.status,
            assignmentId: m.assignmentId,
            projectRoleName: m.projectRoleName,
            projectRoleId: m.projectRoleId,
          });
        }
      }
    }
    return list;
  }, [allProjectsWithTeams, activeUser]);

  // Projects not yet assigned to activeUser
  const availableProjectsToAssign = useMemo(() => {
    const assignedIds = new Set(userAssignedProjects.map((p) => p.projectId));
    return (allProjectsWithTeams ?? []).filter(
      (p) => !assignedIds.has(p.projectId),
    );
  }, [allProjectsWithTeams, userAssignedProjects]);

  // Handle assigning project
  const handleAssignProject = async () => {
    if (!activeUser || !selectedProjectIdToAdd || !selectedRoleIdToAdd) {
      setAddError("يرجى اختيار المشروع والدور المطلوب إسناده");
      return;
    }
    setAddError(null);
    try {
      await addTeamMember.mutateAsync({
        projectId: selectedProjectIdToAdd,
        personId: activeUser.id,
        personType: "employee",
        projectRoleId: selectedRoleIdToAdd,
      });
      setSelectedProjectIdToAdd("");
      setSelectedRoleIdToAdd("");
      setIsAddProjectOpen(false);
      showToast(
        "تم إسناد المشروع بنجاح",
        "سيظهر هذا المشروع فوراً للمهندس في تطبيق الهاتف.",
      );
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : "حدث خطأ أثناء إسناد المشروع",
      );
    }
  };

  // Handle removing assigned project
  const handleRemoveProject = async (
    assignmentId: string,
    projectId: string,
    projectName: string,
  ) => {
    if (!activeUser) return;
    if (
      !confirm(
        `هل أنت متأكد من إزالة صلاحية متابعة مشروع "${projectName}" من هاتف ${activeUser.full_name}؟`,
      )
    ) {
      return;
    }
    try {
      await removeTeamMember.mutateAsync({
        assignmentId,
        personType: "employee",
        projectId,
        personId: activeUser.id,
        projectRoleId: "",
      });
      showToast("تمت إزالة المشروع من الهاتف", `المشروع: ${projectName}`);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "حدث خطأ أثناء إزالة المشروع",
      );
    }
  };

  // Save changes to Supabase
  const handleSave = async () => {
    if (!activeUser) return;

    const notePayload = `${NOTE_PREFIX} ${JSON.stringify({
      ...config,
      updated_at: new Date().toISOString(),
      updated_by: currentAuthUser?.id ?? "super-admin",
    })}`;

    // Permissions we govern
    const permTargets: {
      name: string;
      allowed: boolean;
      scope: GrantScope;
    }[] = [
      {
        name: "mobile_app_access",
        allowed: config.mobile_enabled,
        scope: "all_projects",
      },
      // Agreements
      {
        name: "view_project_agreements",
        allowed: config.mobile_enabled && config.view_agreements,
        scope: config.project_scope,
      },
      {
        name: "view_all_project_agreements",
        allowed: config.mobile_enabled && config.view_agreements,
        scope: config.project_scope,
      },
      {
        name: "edit_project_agreements",
        allowed: config.mobile_enabled && config.edit_agreements,
        scope: config.project_scope,
      },
      // Penalties
      {
        name: "create_contractor_penalty",
        allowed: config.mobile_enabled && config.site_penalties,
        scope: config.project_scope,
      },
      // Payments
      {
        name: "view_contractor_payments",
        allowed: config.mobile_enabled && config.contractor_payments,
        scope: config.project_scope,
      },
      {
        name: "view_all_payments",
        allowed: config.mobile_enabled && config.contractor_payments,
        scope: "all_projects",
      },
      {
        name: "view_payments",
        allowed: config.mobile_enabled && config.contractor_payments,
        scope: "all_projects",
      },
      // Contacts
      {
        name: "view_contractor_contacts",
        allowed: config.mobile_enabled && config.contractor_contacts,
        scope: config.project_scope,
      },
      // Maps
      {
        name: "view_project_maps",
        allowed: config.mobile_enabled && config.view_drawings,
        scope: config.project_scope,
      },
      // Tasks
      {
        name: "view_project_tasks",
        allowed: config.mobile_enabled && config.view_tasks,
        scope: config.project_scope,
      },
      {
        name: "manage_project_tasks",
        allowed: config.mobile_enabled && config.manage_tasks,
        scope: config.project_scope,
      },
      // Orders
      {
        name: "view_project_orders",
        allowed: config.mobile_enabled && config.material_requests,
        scope: config.project_scope,
      },
      {
        name: "view_shop_orders",
        allowed: config.mobile_enabled && config.material_requests,
        scope: "all_projects",
      },
      {
        name: "review_shop_order_prices",
        allowed: config.mobile_enabled && config.review_orders,
        scope: "all_projects",
      },
      {
        name: "approve_order",
        allowed: config.mobile_enabled && config.review_orders,
        scope: config.project_scope,
      },
      // Finance & Salary
      {
        name: "view_project_finance",
        allowed: config.mobile_enabled && config.view_project_finance,
        scope: config.project_scope,
      },
      {
        name: "view_own_salary",
        allowed: config.mobile_enabled && config.view_own_salary,
        scope: "all_projects",
      },
    ];

    const upserts: {
      permission_id: string;
      allowed: boolean;
      scope: GrantScope;
      note?: string | null;
    }[] = [];

    for (const item of permTargets) {
      const pid = permMap.get(item.name);
      if (pid) {
        upserts.push({
          permission_id: pid,
          allowed: item.allowed,
          scope: item.scope,
          note: item.name === "mobile_app_access" ? notePayload : null,
        });
      }
    }

    try {
      await saveGrantsMutation.mutateAsync({
        level: "user",
        ownerId: activeUser.id,
        upserts,
        deletes: [],
      });
      setIsDirty(false);
      showToast(
        "تم حفظ وتطبيق صلاحيات الهاتف بنجاح",
        `تمت مزامنة صلاحيات المهندس (${activeUser.full_name}) فورياً مع تطبيق الهاتف.`,
      );
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "فشل في حفظ صلاحيات تطبيق الهاتف",
      );
    }
  };

  // Instant Revoke Mobile Access
  const handleImmediateLockout = () => {
    if (!activeUser) return;
    if (
      confirm(
        `هل تريد حظر وتعطيل دخول المهندس (${activeUser.full_name}) لتطبيق الهاتف فوراً؟`,
      )
    ) {
      updateConfig("mobile_enabled", false);
    }
  };

  // Reset to default
  const handleReset = () => {
    setConfig({ ...DEFAULT_MOBILE_CONFIG });
    setIsDirty(true);
  };

  if (projectsLoading || (grantsLoading && !userGrants)) {
    return <LoadingPage label="جاري تحميل صلاحيات تطبيق الهاتف ومشاريع المهندس..." />;
  }

  if (!activeUser) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
        <Smartphone size={36} className="mx-auto text-gray-300 mb-3" />
        <p className="text-base font-semibold text-gray-700">
          لم يتم العثور على مستخدمين
        </p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-5">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-6 z-50 flex items-start gap-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-xl border border-gray-700 max-w-md animate-fade-in">
          <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold">{toast.title}</h4>
            {toast.subtitle && (
              <p className="text-[11px] text-gray-300">{toast.subtitle}</p>
            )}
          </div>
        </div>
      )}

      {/* Engineer Search / Header Banner */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-primary to-primary-dark text-white flex items-center justify-center font-bold text-lg shadow-sm">
              {activeUser.full_name.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">
                  {activeUser.full_name}
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary-superLight/60 text-primary-dark font-medium border border-primary/20">
                  {activeUser.role_name || "مهندس / موظف"}
                </span>
                {config.mobile_enabled ? (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    مصرّح له بالهاتف
                  </span>
                ) : (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 font-semibold border border-red-200 inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    ممنوع من الهاتف
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                <span>{activeUser.department_name || "القسم العام"}</span>
                <span>•</span>
                <span>{activeUser.email || "بدون بريد إلكتروني"}</span>
                {activeUser.phone && (
                  <>
                    <span>•</span>
                    <span dir="ltr">{activeUser.phone}</span>
                  </>
                )}
              </p>
              {onSwitchToSystemPermissions && (
                <button
                  type="button"
                  onClick={onSwitchToSystemPermissions}
                  className="text-xs text-primary hover:underline font-medium inline-block mt-1"
                >
                  التبديل إلى صلاحيات النظام الشاملة &larr;
                </button>
              )}
            </div>
          </div>

          {/* Autocomplete Engineer Switcher */}
          <div className="relative w-full lg:w-80" ref={searchContainerRef}>
            <div className="relative">
              <Search
                size={16}
                className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400"
              />
              <input
                type="text"
                placeholder="تغيير المهندس / المستخدم..."
                value={searchQuery}
                onFocus={() => setIsSearchOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pr-9 pl-3 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            {isSearchOpen && (
              <div className="absolute top-full right-0 left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto p-1 divide-y divide-gray-100">
                {filteredUsers.length === 0 ? (
                  <div className="p-3 text-center text-xs text-gray-400">
                    لا يوجد مهندس بهذا الاسم
                  </div>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelected = u.id === activeUser.id;
                    const projCount = userProjectCountMap.get(u.id) ?? 0;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          onSelectUser(u);
                          setIsSearchOpen(false);
                          setSearchQuery("");
                        }}
                        className={`w-full text-right p-2.5 rounded-lg flex items-center justify-between text-xs transition-colors ${
                          isSelected
                            ? "bg-primary-superLight/60 text-primary-dark font-semibold"
                            : "hover:bg-gray-50 text-gray-700"
                        }`}
                      >
                        <div>
                          <div className="font-medium text-gray-900">
                            {u.full_name}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {u.role_name || "بدون دور"} • {u.department_name || ""}
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
                          {projCount} مشاريع
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
            <span className="text-[11px] text-gray-500 block">المشاريع على الهاتف</span>
            <span className="text-base font-bold text-gray-900 mt-0.5 block">
              {config.project_scope === "all_projects"
                ? "كافة مشاريع الشركة"
                : `${userAssignedProjects.length} مشاريع مسندة`}
            </span>
          </div>

          <div className="bg-purple-50/60 border border-purple-200/60 rounded-xl p-3">
            <span className="text-[11px] text-purple-700 block">اتفاقيات المقاولين</span>
            <span className="text-base font-bold text-purple-900 mt-0.5 block">
              {config.view_agreements ? (config.edit_agreements ? "عرض وتعديل" : "عرض فقط") : "معطلة"}
            </span>
          </div>

          <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-3">
            <span className="text-[11px] text-amber-800 block">المالية والمصروفات</span>
            <span className="text-base font-bold text-amber-900 mt-0.5 block">
              {config.view_project_finance ? "مكشوفة بالهاتف" : "محجوبة ومؤمنة"}
            </span>
          </div>

          <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-xl p-3">
            <span className="text-[11px] text-emerald-700 block">الخرائط والمهام</span>
            <span className="text-base font-bold text-emerald-900 mt-0.5 block">
              {config.view_drawings && config.view_tasks ? "متاحة بالهاتف" : "مقيدة جزئياً"}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 1: MASTER ACCESS SWITCH */}
      <div
        className={`rounded-2xl border p-5 transition-all shadow-xs ${
          config.mobile_enabled
            ? "bg-white border-emerald-300 ring-2 ring-emerald-500/10"
            : "bg-red-50/30 border-red-200"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`p-3 rounded-2xl shrink-0 ${
                config.mobile_enabled
                  ? "bg-emerald-600 text-white"
                  : "bg-red-600 text-white"
              }`}
            >
              <Smartphone size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">
                  السماح بتسجيل الدخول إلى تطبيق الهاتف (EGC Builder)
                </h3>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    config.mobile_enabled
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {config.mobile_enabled ? "دخول مسموح" : "دخول محظور"}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1 max-w-2xl leading-relaxed">
                مفتاح التحكم الرئيسي للدخول عبر تطبيق الهاتف. عند تعطيل هذا الخيار،
                يتم رفض تسجيل دخول المهندس من تطبيق الموبايل فورياً ويُمنع من
                الوصول لأي بيانات ميدانية تخص الشركة.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => updateConfig("mobile_enabled", !config.mobile_enabled)}
              className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.mobile_enabled ? "bg-emerald-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.mobile_enabled ? "-translate-x-7" : "translate-x-0"
                }`}
              />
            </button>
            {config.mobile_enabled && (
              <button
                type="button"
                onClick={handleImmediateLockout}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-colors inline-flex items-center gap-1"
                title="حظر المهندس فورياً من الهاتف"
              >
                <Lock size={12} />
                حظر فوري
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: PROJECT ACCESS SCOPE */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-primary" />
            <h3 className="text-sm font-bold text-gray-900">
              نطاق ظهور ومتابعة المشاريع على شاشة الهاتف
            </h3>
          </div>
          <span className="text-[11px] text-gray-500">
            يحدد أي المشاريع تظهر في قائمة المهندس داخل التطبيق
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Option A: Assigned Projects Only */}
          <label
            onClick={() => updateConfig("project_scope", "team_projects_only")}
            className={`cursor-pointer rounded-xl border p-4 flex items-start gap-3 transition-all ${
              config.project_scope === "team_projects_only"
                ? "bg-primary-superLight/40 border-primary ring-1 ring-primary"
                : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="project_scope"
              checked={config.project_scope === "team_projects_only"}
              onChange={() =>
                updateConfig("project_scope", "team_projects_only")
              }
              className="mt-1 text-primary focus:ring-primary"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-900">
                  المشاريع المسندة فقط (الموصى به لمهندسي المواقع)
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                  الافتراضي
                </span>
              </div>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                لا يظهر للمهندس على هاتفه إلا المشاريع التي يعمل بها رسمياً ضمن فرق
                العمل، لمنع التشتت والحفاظ على خصوصية باقي المشاريع.
              </p>
            </div>
          </label>

          {/* Option B: All Projects */}
          <label
            onClick={() => updateConfig("project_scope", "all_projects")}
            className={`cursor-pointer rounded-xl border p-4 flex items-start gap-3 transition-all ${
              config.project_scope === "all_projects"
                ? "bg-primary-superLight/40 border-primary ring-1 ring-primary"
                : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="project_scope"
              checked={config.project_scope === "all_projects"}
              onChange={() => updateConfig("project_scope", "all_projects")}
              className="mt-1 text-primary focus:ring-primary"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-900">
                  كافة مشاريع الشركة (للإشراف العام والإدارة)
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                  وصول شامل
                </span>
              </div>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                يسمح للمهندس باستعراض وتفقد كافة مشاريع EGC في قائمته من الهاتف. مخصص لمدراء المشروعات والمشرفين العموميين.
              </p>
            </div>
          </label>
        </div>

        {/* Assigned Projects Sub-panel */}
        <div className="bg-gray-50/80 rounded-xl border border-gray-200/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardHat size={16} className="text-gray-600" />
              <span className="text-xs font-bold text-gray-800">
                المشاريع المسندة حالياً للمهندس ({userAssignedProjects.length})
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsAddProjectOpen((v) => !v)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors inline-flex items-center gap-1.5"
            >
              <Plus size={14} />
              إسناد مشروع جديد لهذا المهندس
            </button>
          </div>

          {/* Quick Add Project Form */}
          {isAddProjectOpen && (
            <div className="bg-white border border-primary/30 rounded-xl p-4 shadow-sm space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-gray-900">
                  إسناد مشروع جديد للمهندس لفتحه على الهاتف
                </h4>
                <button
                  type="button"
                  onClick={() => setIsAddProjectOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={15} />
                </button>
              </div>

              {addError && (
                <div className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
                  {addError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-600 block mb-1">
                    اختر المشروع:
                  </label>
                  <select
                    value={selectedProjectIdToAdd}
                    onChange={(e) => setSelectedProjectIdToAdd(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-lg p-2 focus:ring-1 focus:ring-primary focus:outline-none bg-white"
                  >
                    <option value="">-- حدد المشروع --</option>
                    {availableProjectsToAssign.map((p) => (
                      <option key={p.projectId} value={p.projectId}>
                        {p.serialNumber ? `#${p.serialNumber} - ` : ""}
                        {p.projectName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-gray-600 block mb-1">
                    الدور في المشروع:
                  </label>
                  <select
                    value={selectedRoleIdToAdd}
                    onChange={(e) => setSelectedRoleIdToAdd(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-lg p-2 focus:ring-1 focus:ring-primary focus:outline-none bg-white"
                  >
                    <option value="">-- حدد الدور --</option>
                    {(projectRolesAdmin ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddProjectOpen(false)}
                >
                  إلغاء
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAssignProject}
                  disabled={addTeamMember.isPending}
                >
                  {addTeamMember.isPending ? "جاري الإسناد..." : "تأكيد الإسناد"}
                </Button>
              </div>
            </div>
          )}

          {/* Projects List */}
          {userAssignedProjects.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-xl p-5 text-center text-xs text-gray-500">
              لا توجد مشاريع مسندة لهذا المهندس حالياً. انقر على &quot;إسناد مشروع
              جديد&quot; لتمكينه من متابعة المشاريع من هاتفه.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {userAssignedProjects.map((p) => (
                <div
                  key={p.assignmentId}
                  className="bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-2 shadow-2xs hover:border-gray-300 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                        #{p.serialNumber ?? "—"}
                      </span>
                      <h5 className="text-xs font-bold text-gray-900 truncate">
                        {p.projectName}
                      </h5>
                    </div>
                    <span className="text-[11px] text-primary-dark mt-0.5 block truncate">
                      {p.projectRoleName}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleRemoveProject(
                        p.assignmentId,
                        p.projectId,
                        p.projectName,
                      )
                    }
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                    title="إزالة من هاتف المهندس"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3: CONTRACTORS & AGREEMENTS */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Users size={18} className="text-purple-600" />
            اتفاقيات ومستحقات مقاولي الباطن في الموقع
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            صلاحيات إدارة عقود واتفاقيات المقاولين، تسجيل الغرامات والاطلاع على سجل الدفعات
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Feature: View Agreements */}
          <div className="border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3 bg-white hover:border-gray-300 transition-colors">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-purple-600" />
                <span className="text-xs font-bold text-gray-900">
                  استعراض اتفاقيات مقاولي المشروع
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                السماح بفتح بلاطة الاتفاقيات وتفقد تفاصيل بنود وأسعار العقود المبرمة مع المقاولين في هذا المشروع.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateConfig("view_agreements", !config.view_agreements)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.view_agreements ? "bg-primary" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.view_agreements ? "-translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Feature: Edit / Create Agreements */}
          <div className="border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3 bg-white hover:border-gray-300 transition-colors">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileSignature size={16} className="text-indigo-600" />
                <span className="text-xs font-bold text-gray-900">
                  إنشاء وتعديل الاتفاقيات بالموقع
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                  صلاحية متقدمة
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                تمكين المهندس من إبرام اتفاقية جديدة أو إضافة ملحق وتعديل بنود اتفاقية قائمة من هاتفه.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateConfig("edit_agreements", !config.edit_agreements)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.edit_agreements ? "bg-primary" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.edit_agreements ? "-translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Feature: Site Penalties */}
          <div className="border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3 bg-white hover:border-gray-300 transition-colors">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} className="text-red-600" />
                <span className="text-xs font-bold text-gray-900">
                  تسجيل مخالفات وغرامات المقاولين
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                تحرير غرامات وخصومات مالية فورية بحق المقاول من الموقع وتصل لهاتفه فوراً كإشعار عاجل وبانر أحمر.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateConfig("site_penalties", !config.site_penalties)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.site_penalties ? "bg-primary" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.site_penalties ? "-translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Feature: Contractor Payments */}
          <div className="border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3 bg-white hover:border-gray-300 transition-colors">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <DollarSign size={16} className="text-emerald-600" />
                <span className="text-xs font-bold text-gray-900">
                  الاطلاع على دفعات وسجل سداد المقاولين
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                إظهار تبويب وبلاطة المدفوعات لمتابعة الدفعات المعتمدة والمسددة وتواريخ الصرف للمقاولين.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateConfig("contractor_payments", !config.contractor_payments)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.contractor_payments ? "bg-primary" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.contractor_payments ? "-translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Feature: Contractor Contacts */}
          <div className="border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3 bg-white hover:border-gray-300 transition-colors col-span-1 md:col-span-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <PhoneCall size={16} className="text-amber-600" />
                <span className="text-xs font-bold text-gray-900">
                  دليل أرقام وهواتف مقاولي المشروع
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                إتاحة بلاطة &quot;أرقام المقاولين&quot; بالهاتف للتواصل السريع والمباشر مع المقاولين وفرق العمل الميدانية.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateConfig("contractor_contacts", !config.contractor_contacts)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.contractor_contacts ? "bg-primary" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.contractor_contacts ? "-translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 4: MAPS & TASKS */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare size={18} className="text-primary" />
            المخططات الهندسية والمهام الميدانية
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            استعراض الرسومات واللوحات التنفيذية، وتوزيع ومتابعة المهام الميدانية
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Feature: Drawings / Maps */}
          <div className="border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3 bg-white hover:border-gray-300 transition-colors">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-teal-600" />
                <span className="text-xs font-bold text-gray-900">
                  استعراض الخرائط والمخططات الهندسية
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                فتح واستعراض الرسومات التنفيذية المعمارية والإنشائية ومخططات PDF بمناطق المشروع لمطابقة التنفيذ.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateConfig("view_drawings", !config.view_drawings)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.view_drawings ? "bg-primary" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.view_drawings ? "-translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Feature: View Tasks */}
          <div className="border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3 bg-white hover:border-gray-300 transition-colors">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-blue-600" />
                <span className="text-xs font-bold text-gray-900">
                  متابعة واستعراض مهام المشروع
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                الاطلاع على قائمة مهام المشروع ولوحات التنفيذ وتتبع المهام المكتملة والمتأخرة.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateConfig("view_tasks", !config.view_tasks)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.view_tasks ? "bg-primary" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.view_tasks ? "-translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Feature: Create / Manage Tasks */}
          <div className="border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3 bg-white hover:border-gray-300 transition-colors col-span-1 md:col-span-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckSquare size={16} className="text-indigo-600" />
                <span className="text-xs font-bold text-gray-900">
                  إنشاء وتكليف مهام ميدانية جديدة
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                تمكين المهندس من إنشاء مهام وتكليف أعضاء الفريق أو المقاولين بها وتحديد تاريخ التسليم والأولويات.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateConfig("manage_tasks", !config.manage_tasks)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.manage_tasks ? "bg-primary" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.manage_tasks ? "-translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 5: ORDERS & PROCUREMENT */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart size={18} className="text-primary" />
            طلبات الشراء والمخزن ومراجعة الأسعار
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            صلاحيات طلب وتزويد المواد للمشروع، ومراجعة واعتماد عروض الأسعار
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Feature: Material Requests */}
          <div className="border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3 bg-white hover:border-gray-300 transition-colors">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShoppingCart size={16} className="text-sky-600" />
                <span className="text-xs font-bold text-gray-900">
                  رفع واستعراض طلبات المواد من المخزن
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                إرسال طلب تزويد مواد أو عهدة أصناف ناقصة في الموقع مباشرة إلى إدارة المشتريات ومخازن الشركة.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateConfig("material_requests", !config.material_requests)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.material_requests ? "bg-primary" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.material_requests ? "-translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Feature: Review & Approve Order Prices */}
          <div className="border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3 bg-white hover:border-gray-300 transition-colors">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileCheck2 size={16} className="text-amber-600" />
                <span className="text-xs font-bold text-gray-900">
                  مراجعة واعتماد أسعار وتكلفة الطلبات
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                  للإدارة والمالية
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                إظهار شاشة مراجعة واعتماد عروض الأسعار الواردة من الموردين لطلبات الشراء والموافقة عليها من الهاتف.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateConfig("review_orders", !config.review_orders)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.review_orders ? "bg-primary" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.review_orders ? "-translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 6: FINANCIAL PRIVACY & SALARY */}
      <div className="bg-white rounded-2xl border border-amber-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-amber-600" />
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                السرية المالية وكشف الراتب (Financial Privacy & Salary)
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                التحكم في ظهور أرقام ومصروفات المشروع وإظهار كشف الراتب الشخصي
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
            أمان مالي مشدد
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Privacy Toggle 1: View Project Finance */}
          <div
            className={`border rounded-xl p-4 flex items-start justify-between gap-4 transition-all ${
              config.view_project_finance
                ? "bg-amber-50/50 border-amber-300"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <DollarSign size={16} className={config.view_project_finance ? "text-amber-700" : "text-gray-400"} />
                <span className="text-xs font-bold text-gray-900">
                  الاطلاع على مالية ومصروفات المشروع الشاملة
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    config.view_project_finance
                      ? "bg-amber-200 text-amber-900"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {config.view_project_finance ? "المالية مكشوفة" : "محجوبة (موصى به)"}
                </span>
              </div>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                عند التعطيل، تُحجب بلاطة &quot;المالية&quot; وأرقام الإيرادات ومصاريف المشروع عن المهندس لحماية خصوصية وهوامش أرباح الشركة.
              </p>
            </div>

            <button
              type="button"
              onClick={() => updateConfig("view_project_finance", !config.view_project_finance)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.view_project_finance ? "bg-amber-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.view_project_finance ? "-translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Privacy Toggle 2: View Own Salary */}
          <div className="border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-4 bg-white hover:border-gray-300 transition-colors">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Wallet size={16} className="text-emerald-600" />
                <span className="text-xs font-bold text-gray-900">
                  عرض كشف الراتب الشخصي في الملف
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                تمكين الموظف من فتح خيار كشف الراتب في الملف الشخصي بالتطبيق للاطلاع على تفاصيل مسير راتبه.
              </p>
            </div>

            <button
              type="button"
              onClick={() => updateConfig("view_own_salary", !config.view_own_salary)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.view_own_salary ? "bg-primary" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.view_own_salary ? "-translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Sticky Action Footer */}
      <div className="sticky bottom-4 z-40 bg-white/95 backdrop-blur-md rounded-2xl border border-gray-300/80 p-4 shadow-xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isDirty ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
              لديك تعديلات غير محفوظة على صلاحيات الهاتف
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <CheckCircle2 size={15} className="text-emerald-500" />
              جميع الصلاحيات متطابقة ومحدثة مع السحابة
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={!isDirty || saveGrantsMutation.isPending}
            className="text-xs"
          >
            <RotateCcw size={14} className="ml-1" />
            استعادة الافتراضي
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={saveGrantsMutation.isPending || !isDirty}
            className="text-xs font-semibold px-4 py-2"
          >
            <Save size={14} className="ml-1" />
            {saveGrantsMutation.isPending
              ? "جاري الحفظ والمزامنة..."
              : "حفظ صلاحيات الهاتف"}
          </Button>
        </div>
      </div>
    </div>
  );
}
