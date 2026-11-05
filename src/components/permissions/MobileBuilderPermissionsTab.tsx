import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  DollarSign,
  Eye,
  FileSignature,
  FileText,
  HardHat,
  Lock,
  PackageOpen,
  Plus,
  Search,
  ShieldAlert,
  ShoppingCart,
  Smartphone,
  Trash2,
  TrendingUp,
  User,
  X,
  AlertTriangle,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../hooks/useAuth";
import type { PermissionUserSummary } from "../../hooks/permissions/useUserPermissionsAdmin";
import { useAllProjectTeams, ProjectWithTeam } from "../../hooks/team/useAllProjectTeams";
import { useProjectRolesAdmin } from "../../hooks/team/useProjectRolesAdmin";
import { useAddTeamMember, useRemoveTeamMember } from "../../hooks/team/useTeamAssignments";
import { usePermissionCatalog } from "../../hooks/permissions/usePermissionCatalog";
import { permissionsDb } from "../../lib/permissionsDb";
import type { GrantScope } from "../../types/permissions.types";

interface Props {
  selectedUser: PermissionUserSummary | null;
  allUsers: PermissionUserSummary[];
  onSelectUser: (user: PermissionUserSummary) => void;
  onSwitchToSystemPermissions?: () => void;
}

// =====================================================================
// Defined 11 Project Rights matching the mobile UX
// =====================================================================
export interface ProjectRightItem {
  id: string;
  permName: string;
  fallbackNames?: string[];
  label: string;
  description: string;
  category: "site" | "procurement" | "finance";
  icon: React.ComponentType<{ size?: number; className?: string }>;
  defaultAllowed: boolean;
  isSensitive?: boolean;
}

export const PROJECT_RIGHTS_CATALOG: ProjectRightItem[] = [
  // 1. الميدان والتنفيذ (5)
  {
    id: "view_drawings",
    permName: "view_project_maps",
    fallbackNames: ["view_drawings"],
    label: "الخرائط والمخططات",
    description: "رفع الرسوم والمخططات من الهاتف",
    category: "site",
    icon: Eye,
    defaultAllowed: true,
  },
  {
    id: "view_tasks",
    permName: "view_project_tasks",
    fallbackNames: ["view_tasks"],
    label: "استعراض مهام المشروع",
    description: "رؤية قوائم المهام الميدانية",
    category: "site",
    icon: HardHat,
    defaultAllowed: true,
  },
  {
    id: "manage_tasks",
    permName: "manage_project_tasks",
    fallbackNames: ["manage_tasks"],
    label: "إدارة وإغلاق المهام",
    description: "تحديث نسب الإنجاز وإغلاق المهام",
    category: "site",
    icon: CheckCircle2,
    defaultAllowed: true,
  },
  {
    id: "manage_execution",
    permName: "manage_execution",
    label: "متابعة مراحل التنفيذ",
    description: "جداول التنفيذ الفعلي بالموقع",
    category: "site",
    icon: Building2,
    defaultAllowed: true,
  },
  {
    id: "site_penalties",
    permName: "create_contractor_penalty",
    label: "المخالفات والغرامات",
    description: "توثيق مخالفات مقاولي الباطن",
    category: "site",
    icon: ShieldAlert,
    defaultAllowed: true,
  },

  // 2. التوريدات وطلبات المواد (2)
  {
    id: "material_requests",
    permName: "view_project_orders",
    fallbackNames: ["view_shop_orders"],
    label: "رفع طلبات شراء المواد",
    description: "إنشاء طلبات المواد من الموقع",
    category: "procurement",
    icon: ShoppingCart,
    defaultAllowed: true,
  },
  {
    id: "review_orders",
    permName: "review_shop_order_prices",
    fallbackNames: ["approve_order"],
    label: "مراجعة وفحص الأسعار",
    description: "فحص العروض واعتماد الاستلام",
    category: "procurement",
    icon: PackageOpen,
    defaultAllowed: false,
  },

  // 3. العقود والمالية (4)
  {
    id: "view_agreements",
    permName: "view_project_agreements",
    fallbackNames: ["view_all_project_agreements"],
    label: "استعراض عقود المقاولين",
    description: "رؤية الاتفاقيات والبنود",
    category: "finance",
    icon: FileText,
    defaultAllowed: true,
    isSensitive: true,
  },
  {
    id: "edit_agreements",
    permName: "edit_project_agreements",
    label: "تعديل اتفاقيات المقاولين",
    description: "تحرير بنود عقود المقاولين",
    category: "finance",
    icon: FileSignature,
    defaultAllowed: false,
    isSensitive: true,
  },
  {
    id: "contractor_payments",
    permName: "view_contractor_payments",
    fallbackNames: ["view_project_finance_income"],
    label: "دفعات ومستخلصات المقاولين",
    description: "مراجعة دفعات مقاولي المشروع",
    category: "finance",
    icon: TrendingUp,
    defaultAllowed: false,
    isSensitive: true,
  },
  {
    id: "view_project_finance",
    permName: "view_project_finance",
    fallbackNames: ["print_project_expense_range"],
    label: "تكاليف ومصروفات المشروع",
    description: "المصروفات والميزانية الكلية للمشروع",
    category: "finance",
    icon: DollarSign,
    defaultAllowed: false,
    isSensitive: true,
  },
];

export default function MobileBuilderPermissionsTab({
  selectedUser,
  allUsers,
  onSelectUser,
  onSwitchToSystemPermissions,
}: Props) {
  const { user: currentAuthUser } = useAuth();
  const queryClient = useQueryClient();

  // Active Engineer (fallback to first user so screen is never blank)
  const activeUser = useMemo(() => {
    return selectedUser ?? allUsers[0] ?? null;
  }, [selectedUser, allUsers]);

  // User search/picker dropdown
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Selected project state
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // Project search in right sidebar
  const [projectSearchQuery, setProjectSearchQuery] = useState("");

  // Copy permissions modal/dropdown
  const [isCopyDropdownOpen, setIsCopyDropdownOpen] = useState(false);
  const copyDropdownRef = useRef<HTMLDivElement>(null);

  // Add project assignment modal
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [selectedProjectIdToAdd, setSelectedProjectIdToAdd] = useState("");
  const [selectedRoleIdToAdd, setSelectedRoleIdToAdd] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // Toast feedback
  const [toast, setToast] = useState<{ id: string; title: string; subtitle?: string } | null>(null);
  const showToast = (title: string, subtitle?: string) => {
    const id = Date.now().toString();
    setToast({ id, title, subtitle });
    setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 3200);
  };

  // Queries
  const { data: allProjectsWithTeams } = useAllProjectTeams();
  const { data: projectRolesAdmin } = useProjectRolesAdmin();
  const { data: catalog } = usePermissionCatalog();

  // Mutations
  const addTeamMember = useAddTeamMember();
  const removeTeamMember = useRemoveTeamMember();

  // Map permissions from catalog (name -> id)
  const permMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of catalog ?? []) {
      map.set(p.name, p.id);
    }
    return map;
  }, [catalog]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setIsUserDropdownOpen(false);
      }
      if (copyDropdownRef.current && !copyDropdownRef.current.contains(e.target as Node)) {
        setIsCopyDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered users for autocomplete
  const filteredUsers = useMemo(() => {
    const term = userSearchQuery.trim().toLowerCase();
    if (!term) return allUsers;
    return allUsers.filter(
      (u) =>
        (u.full_name || "").toLowerCase().includes(term) ||
        (u.email ?? "").toLowerCase().includes(term) ||
        (u.phone ?? "").toLowerCase().includes(term) ||
        (u.role_name ?? "").toLowerCase().includes(term) ||
        (u.department_name ?? "").toLowerCase().includes(term),
    );
  }, [allUsers, userSearchQuery]);

  // Master Switch: Query user_permission_grants for mobile_app_access
  const { data: userGlobalGrants, refetch: refetchGlobalGrants } = useQuery({
    queryKey: ["user-global-grants-mobile", activeUser?.id],
    enabled: Boolean(activeUser?.id),
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("user_permission_grants")
        .select("permission_id, allowed, scope")
        .eq("user_id", activeUser!.id);
      if (error) throw error;
      return (data ?? []) as { permission_id: string; allowed: boolean; scope: GrantScope }[];
    },
  });

  const isMobileAccessAllowed = useMemo(() => {
    const mobilePermId = permMap.get("mobile_app_access");
    if (!mobilePermId || !userGlobalGrants) return true; // Default allowed
    const grant = userGlobalGrants.find((g) => g.permission_id === mobilePermId);
    return grant ? grant.allowed : true;
  }, [userGlobalGrants, permMap]);

  // Toggle master phone access
  const handleToggleMasterAccess = async () => {
    if (!activeUser) return;
    const mobilePermId = permMap.get("mobile_app_access");
    if (!mobilePermId) {
      console.warn("mobile_app_access permission not found in catalog");
      return;
    }

    const newVal = !isMobileAccessAllowed;
    try {
      const { error } = await permissionsDb
        .from("user_permission_grants")
        .upsert(
          {
            user_id: activeUser.id,
            permission_id: mobilePermId,
            allowed: newVal,
            scope: "all_projects",
            granted_by: currentAuthUser?.id ?? null,
            granted_at: new Date().toISOString(),
            note: newVal ? "تفعيل الدخول لتطبيق الهاتف" : "حظر الدخول لتطبيق الهاتف",
          } as never,
          { onConflict: "user_id,permission_id" },
        );

      if (error) throw error;
      await refetchGlobalGrants();
      queryClient.invalidateQueries({ queryKey: ["effective-permissions"] });
      showToast(
        newVal ? "تم تفعيل دخول تطبيق الهاتف" : "تم حظر دخول تطبيق الهاتف",
        activeUser.full_name,
      );
    } catch (err) {
      console.error("Error toggling mobile access:", err);
      showToast("فشل تحديث حالة دخول الهاتف");
    }
  };

  // Query team_member_permission_grants for active user across projects
  const { data: teamMemberGrants, refetch: refetchTeamGrants } = useQuery({
    queryKey: ["user-tm-grants", activeUser?.id],
    enabled: Boolean(activeUser?.id),
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("team_member_permission_grants")
        .select("project_id, permission_id, allowed, note")
        .eq("user_id", activeUser!.id);
      if (error) throw error;
      return (data ?? []) as {
        project_id: string;
        permission_id: string;
        allowed: boolean;
        note: string | null;
      }[];
    },
  });

  // Fast map: `${projectId}:${permissionId}` -> allowed
  const teamGrantMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const g of teamMemberGrants ?? []) {
      map.set(`${g.project_id}:${g.permission_id}`, g.allowed);
    }
    return map;
  }, [teamMemberGrants]);

  // Assigned projects for this engineer
  const assignedProjects = useMemo(() => {
    if (!allProjectsWithTeams || !activeUser) return [];

    const list: {
      project: ProjectWithTeam;
      assignmentRoleName: string;
      projectSerialNumber: string;
    }[] = [];

    for (const p of allProjectsWithTeams) {
      const member = (p.members ?? []).find((m) => m.userId === activeUser.id);
      if (member) {
        list.push({
          project: p,
          assignmentRoleName: member.projectRoleName || "عضو فريق",
          projectSerialNumber:
            p.serialNumber !== null && p.serialNumber !== undefined
              ? `#${p.serialNumber}`
              : `#${p.projectId.slice(0, 4)}`,
        });
      }
    }

    return list.sort((a, b) =>
      (a.project.projectName || "").localeCompare(b.project.projectName || "", "ar"),
    );
  }, [allProjectsWithTeams, activeUser]);

  // Set active project if not set or invalid
  useEffect(() => {
    if (assignedProjects.length > 0) {
      if (!activeProjectId || !assignedProjects.some((p) => p.project.projectId === activeProjectId)) {
        setActiveProjectId(assignedProjects[0].project.projectId);
      }
    } else {
      setActiveProjectId(null);
    }
  }, [assignedProjects, activeProjectId]);

  const activeProjectObj = useMemo(() => {
    return assignedProjects.find((p) => p.project.projectId === activeProjectId) ?? null;
  }, [assignedProjects, activeProjectId]);

  // Available projects to add to this engineer
  const availableProjectsToAdd = useMemo(() => {
    if (!allProjectsWithTeams) return [];
    const assignedIds = new Set(assignedProjects.map((p) => p.project.projectId));
    return allProjectsWithTeams
      .filter((p) => !assignedIds.has(p.projectId))
      .sort((a, b) => (a.projectName || "").localeCompare(b.projectName || "", "ar"));
  }, [allProjectsWithTeams, assignedProjects]);

  // Check if a right is allowed on a specific project
  const checkRight = (projectId: string, right: ProjectRightItem): boolean => {
    const permId = permMap.get(right.permName);
    if (permId) {
      const val = teamGrantMap.get(`${projectId}:${permId}`);
      if (val !== undefined) return val;
    }

    if (right.fallbackNames) {
      for (const fallback of right.fallbackNames) {
        const fallbackId = permMap.get(fallback);
        if (fallbackId) {
          const val = teamGrantMap.get(`${projectId}:${fallbackId}`);
          if (val !== undefined) return val;
        }
      }
    }

    return right.defaultAllowed;
  };

  // Calculate active permission count for any project
  const getActiveCountForProject = (projectId: string) => {
    let count = 0;
    for (const r of PROJECT_RIGHTS_CATALOG) {
      if (checkRight(projectId, r)) count++;
    }
    return count;
  };

  // Toggle single right on active project
  const handleToggleRight = async (right: ProjectRightItem) => {
    if (!activeUser || !activeProjectId) return;
    const permId = permMap.get(right.permName) ?? (right.fallbackNames ? permMap.get(right.fallbackNames[0]) : null);
    if (!permId) {
      console.warn("Permission not found in catalog:", right.permName);
      return;
    }

    const currentVal = checkRight(activeProjectId, right);
    const newVal = !currentVal;

    try {
      const { error } = await permissionsDb
        .from("team_member_permission_grants")
        .upsert(
          {
            project_id: activeProjectId,
            user_id: activeUser.id,
            permission_id: permId,
            allowed: newVal,
            granted_by: currentAuthUser?.id ?? null,
            granted_at: new Date().toISOString(),
          } as never,
          { onConflict: "project_id,user_id,permission_id" },
        );

      if (error) throw error;

      await refetchTeamGrants();
      queryClient.invalidateQueries({ queryKey: ["matrix-tm-grants"] });
      queryClient.invalidateQueries({ queryKey: ["effective-permissions"] });

      showToast(
        `${right.label}: ${newVal ? "تم التفعيل ✓" : "تم التعطيل ✕"}`,
        activeProjectObj?.project.projectName || activeProjectId,
      );
    } catch (err) {
      console.error("Error toggling project permission:", err);
      showToast("حدث خطأ أثناء حفظ الصلاحية");
    }
  };

  // Toggle category batch
  const handleToggleCategory = async (category: "site" | "procurement" | "finance", targetAllowed: boolean) => {
    if (!activeUser || !activeProjectId) return;

    const catRights = PROJECT_RIGHTS_CATALOG.filter((r) => r.category === category);
    try {
      const rows = catRights.map((right) => {
        const permId = permMap.get(right.permName) ?? (right.fallbackNames ? permMap.get(right.fallbackNames[0]) : null);
        return {
          project_id: activeProjectId,
          user_id: activeUser.id,
          permission_id: permId || right.permName,
          allowed: targetAllowed,
          granted_by: currentAuthUser?.id ?? null,
          granted_at: new Date().toISOString(),
        };
      }).filter((r) => Boolean(r.permission_id));

      const { error } = await permissionsDb
        .from("team_member_permission_grants")
        .upsert(rows as never, { onConflict: "project_id,user_id,permission_id" });

      if (error) throw error;

      await refetchTeamGrants();
      queryClient.invalidateQueries({ queryKey: ["matrix-tm-grants"] });
      queryClient.invalidateQueries({ queryKey: ["effective-permissions"] });

      showToast(
        targetAllowed ? "تم تفعيل صلاحيات القسم" : "تم إلغاء صلاحيات القسم",
        activeProjectObj?.project.projectName,
      );
    } catch (err) {
      console.error("Error batch updating category permissions:", err);
      showToast("فشل تحديث الصلاحيات");
    }
  };

  // Copy permissions from another project
  const handleCopyPermissionsFrom = async (sourceProjectId: string) => {
    if (!activeUser || !activeProjectId || sourceProjectId === activeProjectId) return;

    const sourceProject = assignedProjects.find((p) => p.project.projectId === sourceProjectId);
    if (!sourceProject) return;

    try {
      const rowsToCopy = PROJECT_RIGHTS_CATALOG.map((right) => {
        const sourceAllowed = checkRight(sourceProjectId, right);
        const permId = permMap.get(right.permName) ?? (right.fallbackNames ? permMap.get(right.fallbackNames[0]) : null);
        return {
          project_id: activeProjectId,
          user_id: activeUser.id,
          permission_id: permId || right.permName,
          allowed: sourceAllowed,
          granted_by: currentAuthUser?.id ?? null,
          granted_at: new Date().toISOString(),
        };
      }).filter((r) => Boolean(r.permission_id));

      const { error } = await permissionsDb
        .from("team_member_permission_grants")
        .upsert(rowsToCopy as never, { onConflict: "project_id,user_id,permission_id" });

      if (error) throw error;

      await refetchTeamGrants();
      queryClient.invalidateQueries({ queryKey: ["matrix-tm-grants"] });
      queryClient.invalidateQueries({ queryKey: ["effective-permissions"] });
      setIsCopyDropdownOpen(false);

      showToast(
        `تم نسخ الصلاحيات من ${sourceProject.project.projectName} بنجاح ✓`,
        activeProjectObj?.project.projectName,
      );
    } catch (err) {
      console.error("Error copying project permissions:", err);
      showToast("فشل نسخ الصلاحيات");
    }
  };

  // Remove project assignment
  const handleRemoveProject = async () => {
    if (!activeUser || !activeProjectId || !activeProjectObj) return;

    const confirmed = window.confirm(
      `هل أنت متأكد من إلغاء إسناد مشروع "${activeProjectObj.project.projectName}" عن ${activeUser.full_name}؟`,
    );
    if (!confirmed) return;

    try {
      await removeTeamMember.mutateAsync({
        projectId: activeProjectId,
        userId: activeUser.id,
      });

      // Clean up grants
      await permissionsDb
        .from("team_member_permission_grants")
        .delete()
        .eq("project_id", activeProjectId)
        .eq("user_id", activeUser.id);

      await refetchTeamGrants();
      queryClient.invalidateQueries({ queryKey: ["all-project-teams"] });

      showToast("تم إلغاء إسناد المشروع بنجاح", activeProjectObj.project.projectName);
    } catch (err) {
      console.error("Error removing team member:", err);
      showToast("فشل إلغاء إسناد المشروع");
    }
  };

  // Add project assignment
  const handleAssignProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser || !selectedProjectIdToAdd || !selectedRoleIdToAdd) {
      setAddError("يرجى اختيار المشروع والدور أولاً");
      return;
    }

    setAddError(null);
    try {
      await addTeamMember.mutateAsync({
        projectId: selectedProjectIdToAdd,
        userId: activeUser.id,
        projectRoleId: selectedRoleIdToAdd,
      });

      await queryClient.invalidateQueries({ queryKey: ["all-project-teams"] });
      setActiveProjectId(selectedProjectIdToAdd);
      setIsAddProjectOpen(false);
      setSelectedProjectIdToAdd("");
      setSelectedRoleIdToAdd("");

      showToast("تم إسناد المشروع للمهندس بنجاح ✓");
    } catch (err) {
      console.error("Error assigning project:", err);
      setAddError(err instanceof Error ? err.message : "فشل إسناد المشروع");
    }
  };

  // Filter projects by search query in right sidebar
  const filteredAssignedProjects = useMemo(() => {
    const q = projectSearchQuery.trim().toLowerCase();
    if (!q) return assignedProjects;
    return assignedProjects.filter(
      (p) =>
        (p.project.projectName || "").toLowerCase().includes(q) ||
        p.projectSerialNumber.toLowerCase().includes(q) ||
        p.assignmentRoleName.toLowerCase().includes(q),
    );
  }, [assignedProjects, projectSearchQuery]);

  // Counts for active project
  const activeProjectCounts = useMemo(() => {
    if (!activeProjectId) return { total: 11, allowed: 0, percent: 0, site: 0, proc: 0, fin: 0 };
    const allowed = getActiveCountForProject(activeProjectId);
    const site = PROJECT_RIGHTS_CATALOG.filter((r) => r.category === "site" && checkRight(activeProjectId, r)).length;
    const proc = PROJECT_RIGHTS_CATALOG.filter((r) => r.category === "procurement" && checkRight(activeProjectId, r)).length;
    const fin = PROJECT_RIGHTS_CATALOG.filter((r) => r.category === "finance" && checkRight(activeProjectId, r)).length;
    return {
      total: 11,
      allowed,
      percent: Math.min(100, Math.max(0, Math.round((allowed / 11) * 100))) || 0,
      site,
      proc,
      fin,
    };
  }, [activeProjectId, teamGrantMap]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <div className="text-xs">
            <div className="font-semibold">{toast.title}</div>
            {toast.subtitle && <div className="text-slate-400 text-[11px] mt-0.5">{toast.subtitle}</div>}
          </div>
        </div>
      )}

      {/* =====================================================================
          TOP HEADER BAR
          - Right: Prominent, Clearly Clickable Engineer Selector
          - Left: Master Switch "دخول تطبيق الهاتف"
         ===================================================================== */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        {/* Right side: Prominent Engineer Picker */}
        <div className="relative" ref={userDropdownRef}>
          <div className="text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1.5">
            <User size={13} className="text-blue-600" />
            <span>المهندس أو الموظف المحدد:</span>
            <span className="text-blue-700 font-semibold text-[10px] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              اضغط هنا لاختيار مهندس آخر ▾
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsUserDropdownOpen((prev) => !prev)}
            className="flex items-center gap-3 text-right bg-white hover:bg-blue-50/40 border-2 border-slate-200 hover:border-blue-500 px-3.5 py-2 rounded-xl transition-all shadow-xs group cursor-pointer"
          >
            {/* Avatar Circle */}
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
              {activeUser?.full_name ? activeUser.full_name.charAt(0).toUpperCase() : "U"}
            </div>

            <div className="min-w-0 pr-1">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 text-sm group-hover:text-blue-700 transition-colors">
                  {activeUser?.full_name || "اختر مستخدماً"}
                </span>
                <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-xs">
                  <span>تغيير</span>
                  <ChevronDown size={12} className="transition-transform group-hover:translate-y-0.5" />
                </span>
              </div>
              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                <span>{activeUser?.role_name || "بدون دور"}</span>
                <span className="mx-1.5 text-slate-300">·</span>
                <span>{activeUser?.department_name || "بدون قسم"}</span>
                <span className="mx-1.5 text-slate-300">·</span>
                <span className="font-bold text-slate-700">{assignedProjects.length} مشروع مسند</span>
              </div>
            </div>
          </button>

          {/* User Autocomplete Dropdown */}
          {isUserDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-40 animate-in fade-in-50 zoom-in-95 duration-150">
              <div className="relative mb-2">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="ابحث بالاسم أو الدور..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full pl-3 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  autoFocus
                />
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const isSelected = activeUser?.id === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        onSelectUser(u);
                        setIsUserDropdownOpen(false);
                        setUserSearchQuery("");
                      }}
                      className={`w-full flex items-center justify-between p-2 text-right rounded-lg transition-colors text-xs ${
                        isSelected ? "bg-blue-50 text-blue-900 font-semibold" : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {(u.full_name || "U").charAt(0).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <div className="truncate font-medium">{u.full_name || "مستخدم"}</div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {u.role_name || "بدون دور"} · {u.department_name || "بدون قسم"}
                          </div>
                        </div>
                      </div>
                      {isSelected && <Check size={14} className="text-blue-600 shrink-0 mr-2" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Left side: Master Switch "دخول تطبيق الهاتف" */}
        <div className="flex items-center gap-3">
          <div className="text-left">
            <div className="flex items-center gap-1.5 justify-end">
              <span className="text-xs font-bold text-slate-800">دخول تطبيق الهاتف</span>
              <Smartphone size={15} className="text-slate-500" />
            </div>
            <div className="text-[10px] text-left font-medium">
              {isMobileAccessAllowed ? (
                <span className="text-emerald-600 font-bold">مسموح له بالدخول</span>
              ) : (
                <span className="text-red-600 font-bold">محظور من الهاتف</span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleMasterAccess}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isMobileAccessAllowed ? "bg-blue-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                isMobileAccessAllowed ? "-translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* =====================================================================
          MAIN 2-COLUMN CONTENT:
          - FIRST CHILD (RTL) = RIGHT SIDEBAR: Projects List (cols 4/12)
          - SECOND CHILD (RTL) = LEFT MAIN PANEL: Permissions (cols 8/12)
         ===================================================================== */}
      <div
        className={`grid grid-cols-1 lg:grid-cols-12 gap-4 transition-opacity duration-200 ${
          !isMobileAccessAllowed ? "opacity-40 pointer-events-none select-none grayscale-[40%]" : ""
        }`}
      >
        {/* =====================================================================
            1. RIGHT SIDEBAR: Projects List Column (cols 4/12) -> SITS ON RIGHT
           ===================================================================== */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
            {/* Header: Title + "+ إسناد" Button */}
            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddProjectOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Plus size={14} />
                <span>إسناد</span>
              </button>

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs text-slate-900">المشاريع</span>
                <span className="bg-slate-100 text-slate-600 font-mono text-[11px] px-1.5 py-0.5 rounded-full font-semibold">
                  {assignedProjects.length}
                </span>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative mb-2.5">
              <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="ابحث بالاسم أو الرقم..."
                value={projectSearchQuery}
                onChange={(e) => setProjectSearchQuery(e.target.value)}
                className="w-full pl-3 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Scrollable Project Cards List */}
            <div className="space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-0.5">
              {filteredAssignedProjects.length > 0 ? (
                filteredAssignedProjects.map((p) => {
                  const isActive = activeProjectId === p.project.projectId;
                  const count = getActiveCountForProject(p.project.projectId);

                  return (
                    <button
                      key={p.project.projectId}
                      type="button"
                      onClick={() => setActiveProjectId(p.project.projectId)}
                      className={`w-full text-right p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 ${
                        isActive
                          ? "bg-blue-50/60 border-blue-500 shadow-sm ring-1 ring-blue-500/20"
                          : "bg-white border-slate-200/80 hover:bg-slate-50/80 hover:border-slate-300"
                      }`}
                    >
                      {/* Left side: Count Ratio Badge (7/11) */}
                      <span
                        className={`text-xs font-mono font-medium shrink-0 ${
                          isActive ? "text-blue-700 font-bold" : "text-slate-400"
                        }`}
                      >
                        {count}/11
                      </span>

                      {/* Right side: Serial Badge, Project Name, Role */}
                      <div className="min-w-0 flex items-center gap-2 justify-end">
                        <div className="truncate text-right">
                          <div
                            className={`text-xs font-semibold truncate ${
                              isActive ? "text-blue-950" : "text-slate-800"
                            }`}
                          >
                            {p.project.projectName}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {p.assignmentRoleName}
                          </div>
                        </div>

                        {/* Serial Pill */}
                        <span
                          className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                            isActive
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {p.projectSerialNumber}
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-6 text-center text-slate-400 text-xs">
                  {projectSearchQuery ? "لا توجد نتائج بحث" : "لا توجد مشاريع مسندة"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* =====================================================================
            2. LEFT MAIN PANEL: Active Project Details & Permissions (cols 8/12) -> SITS ON LEFT
           ===================================================================== */}
        <div className="lg:col-span-8 space-y-3">
          {activeProjectObj ? (
            <>
              {/* Project Top Card with Progress & Actions */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-3">
                  {/* Left Actions: "نسخ من مشروع" + Remove Team Member */}
                  <div className="flex items-center gap-2">
                    {/* Copy Permissions Dropdown */}
                    <div className="relative" ref={copyDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsCopyDropdownOpen((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <Copy size={13} className="text-slate-500" />
                        <span>نسخ من مشروع</span>
                      </button>

                      {isCopyDropdownOpen && (
                        <div className="absolute left-0 top-full mt-1.5 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-30 animate-in fade-in zoom-in-95 duration-100">
                          <div className="text-[11px] font-semibold text-slate-600 px-2 py-1 mb-1 border-b border-slate-100">
                            اختر مشروعاً لنسخ صلاحياته إلى هذا المشروع:
                          </div>
                          <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                            {assignedProjects
                              .filter((p) => p.project.projectId !== activeProjectId)
                              .map((p) => (
                                <button
                                  key={p.project.projectId}
                                  type="button"
                                  onClick={() => handleCopyPermissionsFrom(p.project.projectId)}
                                  className="w-full flex items-center justify-between p-2 text-right hover:bg-blue-50 rounded-lg text-xs transition-colors"
                                >
                                  <span className="font-medium text-slate-800 truncate">
                                    {p.project.projectName}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono shrink-0 mr-2">
                                    {getActiveCountForProject(p.project.projectId)}/11
                                  </span>
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Remove Member Button */}
                    <button
                      type="button"
                      onClick={handleRemoveProject}
                      title="إلغاء إسناد هذا المشروع عن المهندس"
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-colors cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {/* Right side: Project Name, Serial Badge, Subtitle */}
                  <div className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <h2 className="font-bold text-slate-900 text-base">
                        {activeProjectObj.project.projectName}
                      </h2>
                      <span className="bg-blue-600 text-white font-mono text-xs px-2 py-0.5 rounded font-bold">
                        {activeProjectObj.projectSerialNumber}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      <span>{activeProjectObj.assignmentRoleName}</span>
                      <span className="mx-1 text-slate-300">·</span>
                      <span className="font-medium text-slate-700">
                        {activeProjectCounts.allowed} من {activeProjectCounts.total} صلاحية مفعلة
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress Bar (ratio of allowed permissions) */}
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${activeProjectCounts.percent}%` }}
                  />
                </div>
              </div>

              {/* =====================================================================
                  PERMISSIONS SECTION 1: الميدان والتنفيذ (5 rights)
                 ===================================================================== */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      handleToggleCategory(
                        "site",
                        activeProjectCounts.site !== 5,
                      )
                    }
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                  >
                    {activeProjectCounts.site === 5 ? "إلغاء الكل" : "تفعيل الكل"}
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500 font-medium">
                      {activeProjectCounts.site}/5
                    </span>
                    <span className="font-bold text-xs text-slate-900">الميدان والتنفيذ</span>
                    <Building2 size={15} className="text-slate-600" />
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {PROJECT_RIGHTS_CATALOG.filter((r) => r.category === "site").map((right) => {
                    const isAllowed = checkRight(activeProjectId, right);
                    const Icon = right.icon;
                    return (
                      <div
                        key={right.id}
                        className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                      >
                        {/* Left: Switch */}
                        <button
                          type="button"
                          onClick={() => handleToggleRight(right)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isAllowed ? "bg-blue-600" : "bg-slate-200"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              isAllowed ? "-translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>

                        {/* Right: Title & Description */}
                        <div className="text-right flex items-center gap-3">
                          <div>
                            <div className="font-semibold text-xs text-slate-800">{right.label}</div>
                            <div className="text-[11px] text-slate-400">{right.description}</div>
                          </div>
                          <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-600 flex items-center justify-center shrink-0 border border-slate-100">
                            <Icon size={16} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* =====================================================================
                  PERMISSIONS SECTION 2: التوريدات وطلبات المواد (2 rights)
                 ===================================================================== */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      handleToggleCategory(
                        "procurement",
                        activeProjectCounts.proc !== 2,
                      )
                    }
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                  >
                    {activeProjectCounts.proc === 2 ? "إلغاء الكل" : "تفعيل الكل"}
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500 font-medium">
                      {activeProjectCounts.proc}/2
                    </span>
                    <span className="font-bold text-xs text-slate-900">التوريدات وطلبات المواد</span>
                    <ShoppingCart size={15} className="text-slate-600" />
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {PROJECT_RIGHTS_CATALOG.filter((r) => r.category === "procurement").map((right) => {
                    const isAllowed = checkRight(activeProjectId, right);
                    const Icon = right.icon;
                    return (
                      <div
                        key={right.id}
                        className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                      >
                        {/* Left: Switch */}
                        <button
                          type="button"
                          onClick={() => handleToggleRight(right)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isAllowed ? "bg-blue-600" : "bg-slate-200"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              isAllowed ? "-translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>

                        {/* Right: Title & Description */}
                        <div className="text-right flex items-center gap-3">
                          <div>
                            <div className="font-semibold text-xs text-slate-800">{right.label}</div>
                            <div className="text-[11px] text-slate-400">{right.description}</div>
                          </div>
                          <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-600 flex items-center justify-center shrink-0 border border-slate-100">
                            <Icon size={16} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* =====================================================================
                  PERMISSIONS SECTION 3: العقود والمالية (4 rights - الحساسة)
                 ===================================================================== */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      handleToggleCategory(
                        "finance",
                        activeProjectCounts.fin !== 4,
                      )
                    }
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                  >
                    {activeProjectCounts.fin === 4 ? "إلغاء الكل" : "تفعيل الكل"}
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500 font-medium">
                      {activeProjectCounts.fin}/4
                    </span>
                    <span className="font-bold text-xs text-slate-900">العقود والمالية</span>
                    <DollarSign size={15} className="text-slate-600" />
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {PROJECT_RIGHTS_CATALOG.filter((r) => r.category === "finance").map((right) => {
                    const isAllowed = checkRight(activeProjectId, right);
                    const Icon = right.icon;
                    return (
                      <div
                        key={right.id}
                        className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                      >
                        {/* Left: Switch */}
                        <button
                          type="button"
                          onClick={() => handleToggleRight(right)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isAllowed ? "bg-blue-600" : "bg-slate-200"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              isAllowed ? "-translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>

                        {/* Right: Title, Sensitive Badge & Description */}
                        <div className="text-right flex items-center gap-3">
                          <div>
                            <div className="flex items-center gap-1.5 justify-end">
                              <span className="font-semibold text-xs text-slate-800">{right.label}</span>
                              {right.isSensitive && (
                                <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-1.5 py-0.5 rounded font-medium">
                                  <Lock size={9} />
                                  <span>حساسة</span>
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">{right.description}</div>
                          </div>
                          <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-600 flex items-center justify-center shrink-0 border border-slate-100">
                            <Icon size={16} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* Empty State: No active project */
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
              <Building2 size={40} className="mx-auto text-slate-300 mb-3" />
              <h3 className="font-bold text-slate-800 text-sm mb-1">
                لا توجد مشاريع مسندة لهذا المهندس حالياً
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-5">
                قم بإسناد أول مشروع له لتتمكن من تحديد صلاحياته الميدانية والمالية على تطبيق الهاتف.
              </p>
              <button
                type="button"
                onClick={() => setIsAddProjectOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow transition-colors cursor-pointer"
              >
                <Plus size={15} />
                <span>إسناد أول مشروع الآن</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          ASSIGN PROJECT MODAL
         ===================================================================== */}
      {isAddProjectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4 border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddProjectOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
              <h3 className="font-bold text-slate-900 text-sm">
                إسناد مشروع جديد إلى {activeUser?.full_name}
              </h3>
            </div>

            <form onSubmit={handleAssignProject} className="space-y-4">
              {addError && (
                <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg flex items-center gap-2 border border-red-200">
                  <AlertTriangle size={15} className="shrink-0" />
                  <span>{addError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  المشروع المراد إسناده
                </label>
                <select
                  value={selectedProjectIdToAdd}
                  onChange={(e) => setSelectedProjectIdToAdd(e.target.value)}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- اختر المشروع --</option>
                  {availableProjectsToAdd.map((p) => (
                    <option key={p.projectId} value={p.projectId}>
                      {p.projectName} {p.serialNumber ? `(${p.serialNumber})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  الدور في فريق المشروع
                </label>
                <select
                  value={selectedRoleIdToAdd}
                  onChange={(e) => setSelectedRoleIdToAdd(e.target.value)}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- اختر الدور في المشروع --</option>
                  {projectRolesAdmin?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddProjectOpen(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={addTeamMember.isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {addTeamMember.isPending ? "جاري الإسناد..." : "إسناد المشروع"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
