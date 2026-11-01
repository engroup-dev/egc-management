import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  Building2,
  Check,
  CheckCheck,
  CheckCircle2,
  DollarSign,
  Eye,
  FileText,
  HardHat,
  Lightbulb,
  Minus,
  PackageOpen,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  UserCheck,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { permissionsDb } from "../../lib/permissionsDb";
import { useAuth } from "../../hooks/useAuth";
import type { PermissionUserSummary } from "../../hooks/permissions/useUserPermissionsAdmin";
import { useAllProjectTeams, ProjectWithTeam } from "../../hooks/team/useAllProjectTeams";
import { useProjectRolesAdmin } from "../../hooks/team/useProjectRolesAdmin";
import { useAddTeamMember, useRemoveTeamMember } from "../../hooks/team/useTeamAssignments";
import { usePermissionCatalog } from "../../hooks/permissions/usePermissionCatalog";
import type { GrantScope } from "../../types/permissions.types";
import LoadingPage from "../ui/LoadingPage";

// The 6 Primary Rights pillars for project-level access
export const CORE_PROJECT_RIGHTS = [
  {
    id: "view_projects",
    name: "العرض",
    description: "فتح واستعراض ملف المشروع وبياناته",
    icon: Eye,
    activeColor: "bg-blue-600 text-white border-blue-600 shadow-2xs hover:bg-blue-700",
    pillBadge: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    id: "manage_execution",
    name: "التنفيذ",
    description: "إدارة ومتابعة مراحل وجداول التنفيذ بالموقع",
    icon: HardHat,
    activeColor: "bg-purple-600 text-white border-purple-600 shadow-2xs hover:bg-purple-700",
    pillBadge: "bg-purple-50 text-purple-700 border-purple-200",
  },
  {
    id: "print_project_expense_range",
    name: "الكلفة",
    description: "رؤية تكاليف ومصروفات المشروع (Cost & Expenses)",
    icon: DollarSign,
    activeColor: "bg-emerald-600 text-white border-emerald-600 shadow-2xs hover:bg-emerald-700",
    pillBadge: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    id: "view_operations_boq",
    name: "الكميات",
    description: "جداول وبنود الكميات والأسعار (BOQ)",
    icon: PackageOpen,
    activeColor: "bg-indigo-600 text-white border-indigo-600 shadow-2xs hover:bg-indigo-700",
    pillBadge: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  {
    id: "view_project_finance_income",
    name: "الدفعات",
    description: "الدفعات المالية المستلمة والمستخلصات",
    icon: TrendingUp,
    activeColor: "bg-teal-600 text-white border-teal-600 shadow-2xs hover:bg-teal-700",
    pillBadge: "bg-teal-50 text-teal-700 border-teal-200",
  },
  {
    id: "view_project_agreements",
    name: "العقود",
    description: "عقود واتفاقيات المقاولين وقيمها",
    icon: FileText,
    activeColor: "bg-amber-600 text-white border-amber-600 shadow-2xs hover:bg-amber-700",
    pillBadge: "bg-amber-50 text-amber-700 border-amber-200",
  },
] as const;

interface Props {
  selectedUser?: PermissionUserSummary;
  allUsers: PermissionUserSummary[];
  onSelectUser: (user: PermissionUserSummary) => void;
  onSwitchToSystemPermissions?: () => void;
}

export default function EngineerProjectsAccess({
  selectedUser,
  allUsers,
  onSelectUser,
  onSwitchToSystemPermissions,
}: Props) {
  const { user: currentAuthUser } = useAuth();
  const queryClient = useQueryClient();

  // Search & Autocomplete state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Add project to engineer state
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [selectedProjectIdToAdd, setSelectedProjectIdToAdd] = useState("");
  const [selectedRoleIdToAdd, setSelectedRoleIdToAdd] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // Project filter inside engineer's view
  const [projectFilterTerm, setProjectFilterTerm] = useState("");

  // Loading state for granular toggles
  const [mutatingKey, setMutatingKey] = useState<string | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{
    id: string;
    title: string;
    subtitle?: string;
  } | null>(null);

  const showToast = (title: string, subtitle?: string) => {
    const id = Date.now().toString();
    setToast({ id, title, subtitle });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 3200);
  };

  // 1. All Projects with Teams
  const { data: allProjectsWithTeams, isLoading: projectsLoading } = useAllProjectTeams();

  // 2. Project Roles (for adding member)
  const { data: projectRolesAdmin } = useProjectRolesAdmin();

  // 3. Permission Catalog
  const { data: catalog } = usePermissionCatalog();

  // Mutations
  const addTeamMember = useAddTeamMember();
  const removeTeamMember = useRemoveTeamMember();

  // Filter inside the dropdown: "all" or "assigned_only"
  const [dropdownFilter, setDropdownFilter] = useState<"all" | "assigned_only">("all");

  // Map of project counts per user across all company projects
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

  const usersWithProjectsCount = useMemo(() => {
    let count = 0;
    for (const u of allUsers) {
      if ((userProjectCountMap.get(u.id) ?? 0) > 0) count++;
    }
    return count;
  }, [allUsers, userProjectCountMap]);

  // Active Engineer: prefer selectedUser, or the first user who actually has assigned projects
  const defaultUser = useMemo(() => {
    if (selectedUser) return selectedUser;
    const withProj = allUsers.find(
      (u) => (userProjectCountMap.get(u.id) ?? 0) > 0,
    );
    return withProj ?? allUsers[0];
  }, [selectedUser, allUsers, userProjectCountMap]);

  const activeUser = selectedUser ?? defaultUser;

  // Close autocomplete on click outside
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

  // Filtered and sorted users for autocomplete
  const autocompleteSuggestions = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    let list = allUsers;

    if (dropdownFilter === "assigned_only") {
      list = list.filter((u) => (userProjectCountMap.get(u.id) ?? 0) > 0);
    }

    if (term) {
      list = list.filter((u) => {
        return (
          u.full_name.toLowerCase().includes(term) ||
          (u.email ?? "").toLowerCase().includes(term) ||
          (u.role_name ?? "").toLowerCase().includes(term) ||
          (u.department_name ?? "").toLowerCase().includes(term)
        );
      });
    }

    // Sort: users with projects first, descending by count, then alphabetically
    return [...list].sort((a, b) => {
      const aCount = userProjectCountMap.get(a.id) ?? 0;
      const bCount = userProjectCountMap.get(b.id) ?? 0;
      if (aCount !== bCount) return bCount - aCount;
      return a.full_name.localeCompare(b.full_name, "ar");
    });
  }, [allUsers, searchQuery, dropdownFilter, userProjectCountMap]);

  // Map of permissions by name for fast id lookup
  const permIdMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of catalog ?? []) {
      map.set(p.name, p.id);
    }
    return map;
  }, [catalog]);

  const corePermIds = useMemo(() => {
    return CORE_PROJECT_RIGHTS.map((r) => permIdMap.get(r.id)).filter(
      (id): id is string => Boolean(id),
    );
  }, [permIdMap]);

  // Fetch Team Member Grants for this user across all projects
  const { data: userTeamGrants, refetch: refetchUserTeamGrants } = useQuery({
    queryKey: ["user-all-tm-grants", activeUser?.id],
    enabled: Boolean(activeUser?.id && corePermIds.length > 0),
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("team_member_permission_grants")
        .select("project_id, permission_id, allowed")
        .eq("user_id", activeUser.id)
        .in("permission_id", corePermIds);
      if (error) throw error;
      return (data ?? []) as {
        project_id: string;
        permission_id: string;
        allowed: boolean;
      }[];
    },
  });

  // Fetch Role Grants
  const { data: roleGrants } = useQuery({
    queryKey: ["role-grants-core", activeUser?.role_id],
    enabled: Boolean(activeUser?.role_id && corePermIds.length > 0),
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("role_permission_grants")
        .select("permission_id, allowed, scope")
        .eq("role_id", activeUser.role_id as string)
        .in("permission_id", corePermIds);
      if (error) throw error;
      return (data ?? []) as {
        permission_id: string;
        allowed: boolean;
        scope: GrantScope;
      }[];
    },
  });

  // Fetch Dept Grants
  const { data: deptGrants } = useQuery({
    queryKey: ["dept-grants-core", activeUser?.department_id],
    enabled: Boolean(activeUser?.department_id && corePermIds.length > 0),
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("department_permission_grants")
        .select("permission_id, allowed, scope")
        .eq("department_id", activeUser.department_id as string)
        .in("permission_id", corePermIds);
      if (error) throw error;
      return (data ?? []) as {
        permission_id: string;
        allowed: boolean;
        scope: GrantScope;
      }[];
    },
  });

  // Fast maps
  const userTeamGrantMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const g of userTeamGrants ?? []) {
      map.set(`${g.project_id}:${g.permission_id}`, g.allowed);
    }
    return map;
  }, [userTeamGrants]);

  const roleGrantMap = useMemo(() => {
    const map = new Map<string, { allowed: boolean; scope: GrantScope }>();
    for (const g of roleGrants ?? []) {
      map.set(g.permission_id, { allowed: g.allowed, scope: g.scope });
    }
    return map;
  }, [roleGrants]);

  const deptGrantMap = useMemo(() => {
    const map = new Map<string, { allowed: boolean; scope: GrantScope }>();
    for (const g of deptGrants ?? []) {
      map.set(g.permission_id, { allowed: g.allowed, scope: g.scope });
    }
    return map;
  }, [deptGrants]);

  // Projects where this engineer is currently assigned
  const engineerProjects = useMemo(() => {
    if (!activeUser) return [];
    const list: {
      project: ProjectWithTeam;
      assignmentId: string;
      roleName: string;
      assignedAt?: string;
    }[] = [];

    for (const p of allProjectsWithTeams ?? []) {
      const membership = p.members.find(
        (m) => m.userId === activeUser.id || m.personId === activeUser.id,
      );
      if (membership) {
        list.push({
          project: p,
          assignmentId: membership.assignmentId,
          roleName: membership.projectRoleName || "عضو فريق",
          assignedAt: membership.assignedAt,
        });
      }
    }
    return list;
  }, [allProjectsWithTeams, activeUser]);

  // Unassigned projects (available to add)
  const availableProjectsToAdd = useMemo(() => {
    if (!activeUser) return [];
    const assignedIds = new Set(engineerProjects.map((ep) => ep.project.projectId));
    return (allProjectsWithTeams ?? [])
      .filter((p) => !assignedIds.has(p.projectId))
      .sort((a, b) => a.projectName.localeCompare(b.projectName, "ar"));
  }, [allProjectsWithTeams, engineerProjects, activeUser]);

  // Check if active user has all_projects scope from their role (Admin, General Manager, Owner, etc.)
  const isGlobalAdminOrExecutive = useMemo(() => {
    if (!activeUser) return false;
    const roleLower = (activeUser.role_name ?? "").toLowerCase();
    const isNamedAdmin =
      roleLower.includes("admin") ||
      roleLower.includes("مدير") ||
      roleLower.includes("مالك") ||
      roleLower.includes("owner");

    const hasGlobalGrants = Array.from(roleGrantMap.values()).some(
      (g) => g.allowed && g.scope === "all_projects",
    );

    return isNamedAdmin || hasGlobalGrants;
  }, [activeUser, roleGrantMap]);

  // Check access for activeUser on (project, permission)
  const checkRightAccess = (
    projectId: string,
    permId: string,
    isTeamMember: boolean,
  ): { allowed: boolean; reason: string; hasOverride: boolean } => {
    // Layer 1: Team Member Override
    const tmKey = `${projectId}:${permId}`;
    const tmOverride = userTeamGrantMap.get(tmKey);
    if (tmOverride !== undefined) {
      return {
        allowed: tmOverride,
        reason: tmOverride ? "استثناء خاص بالمشروع (مسموح)" : "حجب خاص بالمشروع (ممنوع)",
        hasOverride: true,
      };
    }

    // Layer 3: User Override (individual)
    const userOverride = activeUser.overrides.find((o) => o.permission_id === permId);
    if (userOverride) {
      if (!userOverride.allowed) {
        return { allowed: false, reason: "تخصيص فردي عام (ممنوع)", hasOverride: false };
      }
      if (userOverride.scope === "all_projects" || isTeamMember) {
        return { allowed: true, reason: "تخصيص فردي عام (مسموح)", hasOverride: false };
      }
      return { allowed: false, reason: "خارج نطاق مشاريع فريقه", hasOverride: false };
    }

    // Layer 4: Department Baseline
    if (activeUser.department_id) {
      const dg = deptGrantMap.get(permId);
      if (dg) {
        if (!dg.allowed) {
          return { allowed: false, reason: "صلاحية القسم (ممنوع)", hasOverride: false };
        }
        if (dg.scope === "all_projects" || isTeamMember) {
          return { allowed: true, reason: "صلاحية القسم (مسموح)", hasOverride: false };
        }
        return { allowed: false, reason: "خارج فريق هذا المشروع", hasOverride: false };
      }
    }

    // Layer 5: Role Baseline
    if (activeUser.role_id) {
      const rg = roleGrantMap.get(permId);
      if (rg) {
        if (!rg.allowed) {
          return { allowed: false, reason: "صلاحية الدور (ممنوع)", hasOverride: false };
        }
        if (rg.scope === "all_projects" || isTeamMember) {
          return { allowed: true, reason: "صلاحية الدور (مسموح)", hasOverride: false };
        }
        return { allowed: false, reason: "خارج فريق هذا المشروع", hasOverride: false };
      }
    }

    return { allowed: false, reason: "غير مصرح (افتراضي)", hasOverride: false };
  };

  // Toggle single right pill
  const handleToggleRight = async (
    projectId: string,
    permName: string,
    currentAllowed: boolean,
  ) => {
    const permId = permIdMap.get(permName);
    if (!permId || !activeUser) return;

    const key = `${projectId}:${permId}`;
    setMutatingKey(key);

    try {
      const newAllowed = !currentAllowed;
      const { error } = await permissionsDb
        .from("team_member_permission_grants")
        .upsert(
          {
            project_id: projectId,
            user_id: activeUser.id,
            permission_id: permId,
            allowed: newAllowed,
            granted_by: currentAuthUser?.id ?? null,
            granted_at: new Date().toISOString(),
          } as never,
          { onConflict: "project_id,user_id,permission_id" },
        );

      if (error) throw error;

      await refetchUserTeamGrants();
      queryClient.invalidateQueries({ queryKey: ["matrix-tm-grants"] });
      queryClient.invalidateQueries({ queryKey: ["effective-permissions"] });

      const proj = allProjectsWithTeams?.find((p) => p.projectId === projectId);
      const rightObj = CORE_PROJECT_RIGHTS.find((r) => r.id === permName);
      const stateLabel = newAllowed ? "مسموح ✓" : "حجب ✕";
      showToast(
        `تم تحديث قاعدة البيانات فوراً: [${rightObj?.name || permName}: ${stateLabel}]`,
        `المشروع: #${proj?.serialNumber ?? ""} ${proj?.projectName || projectId} · المهندس: ${activeUser.full_name}`,
      );
    } catch (err) {
      console.error("Error toggling project right:", err);
    } finally {
      setMutatingKey(null);
    }
  };

  // Batch toggle all 6 rights on a project
  const handleBatchToggleProject = async (
    projectId: string,
    targetState: boolean,
  ) => {
    if (!activeUser || corePermIds.length === 0) return;
    const key = `batch:${projectId}`;
    setMutatingKey(key);

    try {
      const rows = corePermIds.map((permId) => ({
        project_id: projectId,
        user_id: activeUser.id,
        permission_id: permId,
        allowed: targetState,
        granted_by: currentAuthUser?.id ?? null,
        granted_at: new Date().toISOString(),
      }));

      const { error } = await permissionsDb
        .from("team_member_permission_grants")
        .upsert(rows as never, { onConflict: "project_id,user_id,permission_id" });

      if (error) throw error;

      await refetchUserTeamGrants();
      queryClient.invalidateQueries({ queryKey: ["matrix-tm-grants"] });
      queryClient.invalidateQueries({ queryKey: ["effective-permissions"] });

      const proj = allProjectsWithTeams?.find((p) => p.projectId === projectId);
      const stateLabel = targetState
        ? "منح جميع الصلاحيات الست ✓"
        : "حجب جميع الصلاحيات الست ✕";
      showToast(
        `تم تحديث قاعدة البيانات: ${stateLabel}`,
        `المشروع: #${proj?.serialNumber ?? ""} ${proj?.projectName || projectId}`,
      );
    } catch (err) {
      console.error("Error batch toggling project rights:", err);
    } finally {
      setMutatingKey(null);
    }
  };

  // Add engineer to project
  const handleAddProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!selectedProjectIdToAdd) {
      setAddError("يرجى اختيار المشروع المراد إضافته");
      return;
    }

    const defaultRoleId =
      selectedRoleIdToAdd ||
      projectRolesAdmin?.[0]?.id ||
      "";

    if (!defaultRoleId) {
      setAddError("يرجى تحديد الدور الوظيفي للمهندس في هذا المشروع");
      return;
    }

    try {
      await addTeamMember.mutateAsync({
        projectId: selectedProjectIdToAdd,
        personId: activeUser.id,
        personType: "employee",
        projectRoleId: defaultRoleId,
        assignedBy: currentAuthUser?.id ?? null,
      });

      const addedProj = allProjectsWithTeams?.find(
        (p) => p.projectId === selectedProjectIdToAdd,
      );
      showToast(
        `تم ربط المهندس بفريق المشروع بنجاح ✓`,
        `المشروع: ${addedProj?.projectName || ""} · المهندس: ${activeUser.full_name}`,
      );

      setSelectedProjectIdToAdd("");
      setSelectedRoleIdToAdd("");
      setIsAddProjectOpen(false);
      queryClient.invalidateQueries({ queryKey: ["project-teams-all"] });
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : "تعذر ربط المهندس بالمشروع",
      );
    }
  };

  // Remove engineer from project
  const handleRemoveFromProject = async (assignmentId: string, projectId: string) => {
    const proj = allProjectsWithTeams?.find((p) => p.projectId === projectId);
    const confirmed = window.confirm(
      `هل أنت متأكد من رغبتك في إزالة المهندس (${activeUser.full_name}) من فريق مشروع (${proj?.projectName || "المشروع"})؟`,
    );
    if (!confirmed) return;

    try {
      await removeTeamMember.mutateAsync({
        assignmentId,
        personType: "employee",
        projectId,
        personId: activeUser.id,
        projectRoleId: "",
      });
      queryClient.invalidateQueries({ queryKey: ["project-teams-all"] });
      showToast(
        `تمت إزالة المهندس من فريق المشروع`,
        `المشروع: ${proj?.projectName || ""} · المهندس: ${activeUser.full_name}`,
      );
    } catch (err) {
      console.error("Error removing engineer from project:", err);
    }
  };

  // Filter projects by term
  const filteredEngineerProjects = useMemo(() => {
    const term = projectFilterTerm.trim().toLowerCase();
    if (!term) return engineerProjects;
    return engineerProjects.filter(
      (ep) =>
        ep.project.projectName.toLowerCase().includes(term) ||
        (ep.project.serialNumber?.toString() ?? "").includes(term) ||
        ep.roleName.toLowerCase().includes(term),
    );
  }, [engineerProjects, projectFilterTerm]);

  if (projectsLoading) {
    return <LoadingPage label="جاري تحميل مشاريع وصلاحيات المهندس..." />;
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* ─── 1) Top Bar: Engineer Smart Autocomplete & Switcher ────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Autocomplete Input */}
          <div className="relative flex-1 max-w-xl" ref={searchContainerRef}>
            <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
              <Search size={14} className="text-primary" />
              <span>اختر أو ابحث عن المهندس / المستخدم:</span>
            </label>

            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setIsSearchOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                placeholder={
                  activeUser
                    ? `المحدد حالياً: ${activeUser.full_name} — ابحث لتغييره...`
                    : "اكتب اسم المهندس أو الدور..."
                }
                className="w-full border border-gray-300 rounded-xl py-2 pr-9 pl-9 text-xs font-medium text-gray-800 bg-gray-50/50 hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-2xs"
              />
              <Search
                size={15}
                className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400 pointer-events-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute top-1/2 -translate-y-1/2 left-3 text-gray-400 hover:text-gray-600 p-0.5 rounded-full"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Suggestions Dropdown */}
            {isSearchOpen && (
              <div className="absolute top-full right-0 left-0 mt-1.5 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden divide-y divide-gray-100 max-h-80 overflow-y-auto">
                <div className="p-2 bg-gray-50 flex items-center justify-between gap-2 border-b border-gray-200">
                  <span className="text-[11px] font-bold text-gray-600">
                    قائمة المستخدمين ({autocompleteSuggestions.length})
                  </span>

                  <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-gray-200">
                    <button
                      type="button"
                      onClick={() => setDropdownFilter("assigned_only")}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                        dropdownFilter === "assigned_only"
                          ? "bg-primary text-white shadow-2xs"
                          : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      المعينون بمشاريع ({usersWithProjectsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDropdownFilter("all")}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                        dropdownFilter === "all"
                          ? "bg-primary text-white shadow-2xs"
                          : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      الكل ({allUsers.length})
                    </button>
                  </div>
                </div>

                {autocompleteSuggestions.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-400">
                    لا يوجد مستخدم مطابق لمعايير البحث
                  </div>
                ) : (
                  autocompleteSuggestions.map((u) => {
                    const isSelected = u.id === activeUser?.id;
                    const pCount = userProjectCountMap.get(u.id) ?? 0;

                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          onSelectUser(u);
                          setIsSearchOpen(false);
                          setSearchQuery("");
                        }}
                        className={`w-full text-right px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs transition-colors hover:bg-slate-50 ${
                          isSelected ? "bg-primary-superLight/40" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                            {u.full_name.slice(0, 1)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate">
                              {u.full_name}
                            </div>
                            <div className="text-[10px] text-gray-400 truncate">
                              {u.role_name || "بدون دور"} · {u.department_name || "بدون قسم"}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {pCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              🎯 {pCount} {pCount === 1 ? "مشروع" : "مشاريع"}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] text-gray-400 bg-gray-100">
                              غير معين بمشروع
                            </span>
                          )}

                          {isSelected && (
                            <span className="text-primary font-bold text-xs flex items-center gap-0.5 shrink-0">
                              <Check size={14} className="stroke-[3]" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Jump to System Permissions button */}
          {onSwitchToSystemPermissions && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onSwitchToSystemPermissions}
                className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors flex items-center gap-1.5 shadow-2xs"
                title="تعديل موديولات النظام العام لهذا المستخدم"
              >
                <UserCheck size={14} className="text-primary" />
                <span>تخصيص صلاحيات النظام العام</span>
              </button>
            </div>
          )}
        </div>

        {/* ─── Engineer Profile Card ──────────────────────────────────── */}
        {activeUser && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white font-bold text-base flex items-center justify-center shadow-sm">
                {activeUser.full_name.slice(0, 1)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-gray-900">
                    {activeUser.full_name}
                  </h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                    {activeUser.role_name || "بدون دور"}
                  </span>
                  {activeUser.total_override_count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                      لديه تخصيص فردي
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-3">
                  <span>{activeUser.email || "بدون بريد"}</span>
                  {activeUser.department_name && (
                    <>
                      <span>·</span>
                      <span>القسم: {activeUser.department_name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* KPI Badges for this Engineer */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs">
                <Building2 size={15} className="text-primary" />
                <span className="text-gray-500">مشاريع المهندس:</span>
                <span className="font-bold text-gray-900 font-mono">
                  {engineerProjects.length}{" "}
                  <span className="text-gray-400 font-normal">
                    من أصل {(allProjectsWithTeams ?? []).length}
                  </span>
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsAddProjectOpen((v) => !v)}
                className="px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <Plus size={14} className="stroke-[3]" />
                <span>ربط بمشروع جديد</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Smart Admin Notice Card (for global admins with 0 site projects) ── */}
      {engineerProjects.length === 0 && isGlobalAdminOrExecutive && (
        <div className="bg-gradient-to-r from-amber-50/90 via-amber-50/40 to-blue-50/50 border border-amber-200/90 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100/90 text-amber-800 border border-amber-200 shrink-0 shadow-2xs">
              <Lightbulb size={20} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="font-bold text-xs text-amber-950 flex items-center gap-1.5">
                <span>بطاقة إيضاح: وصول إداري شامل عبر كل المشاريع</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-200/60 text-amber-900 font-semibold">
                  {activeUser.role_name || "Admin"}
                </span>
              </div>
              <p className="text-xs text-amber-900/90 mt-1 leading-relaxed">
                هذا المستخدم يملك وصولاً شاملاً لكافة مشاريع الشركة (
                <strong>{(allProjectsWithTeams ?? []).length || 69} مشروعاً</strong>
                ) بحكم دوره الإداري ({activeUser.role_name || "Admin"})، ويمكنه
                مراجعة أي مشروع عبر <strong>مصفوفة المشاريع</strong> حتى دون
                تكليفه رسمياً بكادر موقع ميداني محدد.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsAddProjectOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold transition-colors shrink-0 shadow-2xs flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Plus size={14} className="stroke-[3]" />
            <span>تكليفه بمشروع ميداني</span>
          </button>
        </div>
      )}

      {/* ─── 2) Add Engineer to Project Panel (Collapsible) ────────────── */}
      {isAddProjectOpen && (
        <form
          onSubmit={handleAddProjectSubmit}
          className="bg-primary-superLight/30 border border-primary/20 rounded-2xl p-4 shadow-sm space-y-3 animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-primary-dark">
              <Plus size={16} />
              <span>إضافة المهندس ({activeUser.full_name}) إلى فريق مشروع جديد</span>
            </div>
            <button
              type="button"
              onClick={() => setIsAddProjectOpen(false)}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
            >
              <X size={15} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-6">
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                اختر المشروع:
              </label>
              <select
                value={selectedProjectIdToAdd}
                onChange={(e) => setSelectedProjectIdToAdd(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-- حدد المشروع من القائمة ({availableProjectsToAdd.length} مشروع متاح) --</option>
                {availableProjectsToAdd.map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    #{p.serialNumber ?? "—"} {p.projectName} ({p.status || "نشط"})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4">
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                دور المهندس في المشروع:
              </label>
              <select
                value={selectedRoleIdToAdd}
                onChange={(e) => setSelectedRoleIdToAdd(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-- افتراضي (عضو فريق) --</option>
                {(projectRolesAdmin ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={addTeamMember.isPending || !selectedProjectIdToAdd}
                className="w-full py-2 px-3 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark disabled:opacity-50 transition-colors shadow-2xs flex items-center justify-center gap-1.5"
              >
                {addTeamMember.isPending ? "جاري الإضافة..." : "تأكيد الإضافة"}
              </button>
            </div>
          </div>

          {addError && (
            <div className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
              {addError}
            </div>
          )}
        </form>
      )}

      {/* ─── 3) Engineer Projects Table / Cards ────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Sub-header & Filter */}
        <div className="px-4 py-3 bg-gray-50/80 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-800">
              مشاريع المهندس ({engineerProjects.length})
            </span>
            <span className="text-gray-400 text-[11px]">
              انقر على أي شارة صلاحية لتفعيلها أو حجبها فوراً بنقرة واحدة
            </span>
          </div>

          <div className="relative min-w-[200px]">
            <Search
              size={13}
              className="absolute top-1/2 -translate-y-1/2 right-2.5 text-gray-400"
            />
            <input
              type="text"
              value={projectFilterTerm}
              onChange={(e) => setProjectFilterTerm(e.target.value)}
              placeholder="تصفية المشاريع بالاسم..."
              className="w-full border border-gray-200 rounded-lg py-1 pr-7 pl-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white"
            />
          </div>
        </div>

        {/* Projects Content */}
        {engineerProjects.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Building2 size={24} />
            </div>
            <div className="text-sm font-bold text-gray-800">
              المهندس ({activeUser.full_name}) غير مضاف لأي مشروع حالياً
            </div>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              اضغط على زر <strong>[ربط بمشروع جديد]</strong> بالأعلى لإضافته إلى فريق عمل أي مشروع، والبدء في ضبط صلاحياته.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredEngineerProjects.map(({ project, assignmentId, roleName }) => {
              const pId = project.projectId;

              return (
                <div
                  key={pId}
                  className="p-4 hover:bg-slate-50/50 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  {/* Project Info */}
                  <div className="min-w-0 lg:w-[280px] shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-gray-900 truncate">
                        {project.projectName}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        #{project.serialNumber ?? "—"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                      <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-medium text-[10px]">
                        الدور: {roleName}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {project.status || "نشط"}
                      </span>
                    </div>
                  </div>

                  {/* 6 Rights Pills */}
                  <div className="flex-1 flex flex-wrap items-center gap-1.5">
                    {CORE_PROJECT_RIGHTS.map((right) => {
                      const permId = permIdMap.get(right.id);
                      const res = permId
                        ? checkRightAccess(pId, permId, true)
                        : { allowed: false, reason: "جاري التحميل", hasOverride: false };

                      const isMutating = mutatingKey === `${pId}:${permId}`;
                      const Icon = right.icon;

                      return (
                        <button
                          key={right.id}
                          type="button"
                          disabled={isMutating}
                          onClick={() =>
                            handleToggleRight(pId, right.id, res.allowed)
                          }
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                            res.allowed
                              ? right.activeColor
                              : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-700"
                          } ${isMutating ? "opacity-50 cursor-wait" : ""}`}
                          title={`${right.name}: ${res.reason} (انقر للتبديل)`}
                        >
                          <Icon size={13} className={res.allowed ? "text-white" : "text-gray-400"} />
                          <span>{right.name}</span>
                          {res.allowed ? (
                            <Check size={12} className="stroke-[3]" />
                          ) : (
                            <Minus size={11} />
                          )}
                          {res.hasOverride && (
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                res.allowed ? "bg-white" : "bg-amber-500"
                              }`}
                              title="استثناء خاص لهذا المهندس"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Actions: Grant All & Remove */}
                  <div className="flex items-center gap-1.5 shrink-0 justify-end pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100">
                    <button
                      type="button"
                      onClick={() => handleBatchToggleProject(pId, true)}
                      className="px-2.5 py-1 text-[11px] rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors font-medium flex items-center gap-1"
                      title="منح جميع الصلاحيات الست في هذا المشروع"
                    >
                      <CheckCheck size={13} />
                      <span>منح الكل</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemoveFromProject(assignmentId, pId)}
                      className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                      title="إزالة المهندس من هذا المشروع"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── 4) Floating Toast Notification ──────────────────────────── */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-md bg-white border border-emerald-200 shadow-xl rounded-2xl p-3.5 flex items-start gap-3 animate-in slide-in-from-bottom-5 duration-200"
          dir="rtl"
        >
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 shrink-0 shadow-2xs">
            <CheckCircle2 size={18} className="stroke-[2.5]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-xs text-gray-900 leading-tight">
              {toast.title}
            </div>
            {toast.subtitle && (
              <div className="text-[11px] text-gray-500 mt-1 truncate font-mono">
                {toast.subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg shrink-0 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
