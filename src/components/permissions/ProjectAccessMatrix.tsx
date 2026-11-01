import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Eye,
  FileText,
  HardHat,
  Lock,
  Minus,
  PackageOpen,
  Search,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { permissionsDb } from "../../lib/permissionsDb";
import { usePermissionUsers, PermissionUserSummary } from "../../hooks/permissions/useUserPermissionsAdmin";
import { useAllProjectTeams, ProjectWithTeam } from "../../hooks/team/useAllProjectTeams";
import { usePermissionCatalog } from "../../hooks/permissions/usePermissionCatalog";
import type { GrantScope } from "../../types/permissions.types";
import LoadingPage from "../ui/LoadingPage";

// Permissions specifically suited for project-level access auditing
export const AUDIT_PERMISSIONS = [
  {
    id: "print_project_expense_range",
    name: "كلفة ومصروفات المشروع",
    subtitle: "رؤية تكاليف وتقارير مصروفات المشروع (Cost & Expenses)",
    icon: DollarSign,
    color: "emerald",
  },
  {
    id: "view_project_finance_income",
    name: "إيرادات ومستخلصات المشروع",
    subtitle: "الدفعات المستلمة والمستخلصات المالية للمشروع",
    icon: TrendingUp,
    color: "blue",
  },
  {
    id: "view_operations_boq",
    name: "جداول الكميات والأسعار (BOQ)",
    subtitle: "بنود وجداول الكميات والتسعير",
    icon: PackageOpen,
    color: "indigo",
  },
  {
    id: "view_project_agreements",
    name: "عقود واتفاقيات المشاريع",
    subtitle: "عقود المقاولين وقيم الاتفاقيات المالية",
    icon: FileText,
    color: "amber",
  },
  {
    id: "view_projects",
    name: "عرض ملفات المشاريع",
    subtitle: "الدخول العام لملف المشروع واستعراض بياناته",
    icon: Eye,
    color: "slate",
  },
  {
    id: "manage_execution",
    name: "إدارة مراحل التنفيذ",
    subtitle: "تعديل وإدارة المراحل والجدول الزمني بالمشروع",
    icon: HardHat,
    color: "purple",
  },
] as const;

const PROJECTS_PER_PAGE = 8;

export default function ProjectAccessMatrix({
  onSelectUserForEdit,
}: {
  onSelectUserForEdit?: (user: PermissionUserSummary) => void;
}) {
  const [selectedPermName, setSelectedPermName] = useState<string>(
    "print_project_expense_range",
  );
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [onlyAllowed, setOnlyAllowed] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectPage, setProjectPage] = useState(0);
  const [userPage, setUserPage] = useState(0);
  const [userPageSize, setUserPageSize] = useState<number>(12);

  // 1. Fetch Users
  const { data: users, isLoading: usersLoading } = usePermissionUsers();

  // 2. Fetch Projects with Teams
  const { data: projectsWithTeams, isLoading: projectsLoading } =
    useAllProjectTeams();

  // 3. Fetch Catalog
  const { data: catalog, isLoading: catalogLoading } = usePermissionCatalog();

  const activePerm = useMemo(
    () =>
      AUDIT_PERMISSIONS.find((p) => p.id === selectedPermName) ??
      AUDIT_PERMISSIONS[0],
    [selectedPermName],
  );

  const selectedPermCatalogRow = useMemo(
    () => (catalog ?? []).find((p) => p.name === selectedPermName),
    [catalog, selectedPermName],
  );

  const selectedPermId = selectedPermCatalogRow?.id;

  // 4. Fetch Role Grants for this permission
  const { data: roleGrants } = useQuery({
    queryKey: ["matrix-role-grants", selectedPermId],
    enabled: Boolean(selectedPermId),
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("role_permission_grants")
        .select("role_id, allowed, scope")
        .eq("permission_id", selectedPermId as string);
      if (error) throw error;
      return (data ?? []) as { role_id: string; allowed: boolean; scope: GrantScope }[];
    },
  });

  // 5. Fetch Department Grants for this permission
  const { data: deptGrants } = useQuery({
    queryKey: ["matrix-dept-grants", selectedPermId],
    enabled: Boolean(selectedPermId),
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("department_permission_grants")
        .select("department_id, allowed, scope")
        .eq("permission_id", selectedPermId as string);
      if (error) throw error;
      return (data ?? []) as { department_id: string; allowed: boolean; scope: GrantScope }[];
    },
  });

  // 6. Fetch Project Defaults for this permission
  const { data: projectDefaultsRows } = useQuery({
    queryKey: ["matrix-project-defaults", selectedPermId],
    enabled: Boolean(selectedPermId),
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("project_permission_defaults")
        .select("project_id, allowed")
        .eq("permission_id", selectedPermId as string);
      if (error) throw error;
      return (data ?? []) as { project_id: string; allowed: boolean }[];
    },
  });

  // 7. Fetch Team Member Overrides for this permission
  const { data: teamMemberGrantsRows } = useQuery({
    queryKey: ["matrix-tm-grants", selectedPermId],
    enabled: Boolean(selectedPermId),
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("team_member_permission_grants")
        .select("project_id, user_id, allowed")
        .eq("permission_id", selectedPermId as string);
      if (error) throw error;
      return (data ?? []) as { project_id: string; user_id: string; allowed: boolean }[];
    },
  });

  // Maps for O(1) grant lookup
  const roleGrantMap = useMemo(() => {
    const map = new Map<string, { allowed: boolean; scope: GrantScope }>();
    for (const r of roleGrants ?? []) {
      map.set(r.role_id, { allowed: r.allowed, scope: r.scope });
    }
    return map;
  }, [roleGrants]);

  const deptGrantMap = useMemo(() => {
    const map = new Map<string, { allowed: boolean; scope: GrantScope }>();
    for (const d of deptGrants ?? []) {
      map.set(d.department_id, { allowed: d.allowed, scope: d.scope });
    }
    return map;
  }, [deptGrants]);

  const projectDefaultMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of projectDefaultsRows ?? []) {
      map.set(row.project_id, row.allowed);
    }
    return map;
  }, [projectDefaultsRows]);

  const teamMemberGrantMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of teamMemberGrantsRows ?? []) {
      map.set(`${row.project_id}:${row.user_id}`, row.allowed);
    }
    return map;
  }, [teamMemberGrantsRows]);

  // Core Resolver: evaluates access for (user, project)
  const checkAccess = useMemo(() => {
    return (user: PermissionUserSummary, project: ProjectWithTeam) => {
      if (!selectedPermId) return { allowed: false, reason: "جاري التحميل", isTeamMember: false };

      const isTeamMember = project.members.some(
        (m) => m.userId === user.id || m.personId === user.id,
      );

      // Layer 1: Team Member Override (specific person on this project)
      const tmKey = `${project.projectId}:${user.id}`;
      const tmVal = teamMemberGrantMap.get(tmKey);
      if (tmVal !== undefined) {
        return {
          allowed: tmVal,
          reason: tmVal ? "استثناء بالمشروع (مسموح)" : "حجب خاص بالمشروع (ممنوع)",
          isTeamMember,
        };
      }

      // Layer 2: Project Default (everyone on this project)
      const pdVal = projectDefaultMap.get(project.projectId);
      if (pdVal !== undefined && isTeamMember) {
        return {
          allowed: pdVal,
          reason: pdVal ? "افتراضي المشروع (مسموح)" : "افتراضي المشروع (ممنوع)",
          isTeamMember,
        };
      }

      // Layer 3: User Override (individual user level)
      const userOverride = user.overrides.find(
        (o) => o.permission_id === selectedPermId,
      );
      if (userOverride) {
        if (!userOverride.allowed) {
          return { allowed: false, reason: "تخصيص فردي (ممنوع)", isTeamMember };
        }
        if (userOverride.scope === "all_projects") {
          return { allowed: true, reason: "تخصيص فردي (شامل كل المشاريع)", isTeamMember };
        }
        if (isTeamMember) {
          return { allowed: true, reason: "تخصيص فردي (مسموح لمشاريع فريقه)", isTeamMember };
        }
        return { allowed: false, reason: "خارج فريق هذا المشروع", isTeamMember };
      }

      // Layer 4: Department Baseline
      if (user.department_id) {
        const dg = deptGrantMap.get(user.department_id);
        if (dg) {
          if (!dg.allowed) {
            return { allowed: false, reason: "صلاحية القسم (ممنوع)", isTeamMember };
          }
          if (dg.scope === "all_projects") {
            return { allowed: true, reason: "صلاحية القسم (شامل كل المشاريع)", isTeamMember };
          }
          if (isTeamMember) {
            return { allowed: true, reason: "صلاحية القسم (مسموح لمشاريع فريقه)", isTeamMember };
          }
          return { allowed: false, reason: "خارج فريق هذا المشروع", isTeamMember };
        }
      }

      // Layer 5: Role Baseline
      if (user.role_id) {
        const rg = roleGrantMap.get(user.role_id);
        if (rg) {
          if (!rg.allowed) {
            return { allowed: false, reason: "صلاحية الدور (ممنوع)", isTeamMember };
          }
          if (rg.scope === "all_projects") {
            return { allowed: true, reason: "صلاحية الدور (شامل كل المشاريع)", isTeamMember };
          }
          if (isTeamMember) {
            return { allowed: true, reason: "صلاحية الدور (مسموح لمشاريع فريقه)", isTeamMember };
          }
          return { allowed: false, reason: "خارج فريق هذا المشروع", isTeamMember };
        }
      }

      // Default: Deny
      return { allowed: false, reason: "غير مصرح (افتراضي الدور)", isTeamMember };
    };
  }, [
    selectedPermId,
    teamMemberGrantMap,
    projectDefaultMap,
    deptGrantMap,
    roleGrantMap,
  ]);

  // Unique roles for filtering
  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const u of users ?? []) {
      if (u.role_name) set.add(u.role_name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  }, [users]);

  // Filter projects (based on project search)
  const filteredProjects = useMemo(() => {
    const list = projectsWithTeams ?? [];
    const term = projectSearch.trim().toLowerCase();
    if (!term) return list;
    return list.filter((p) =>
      p.projectName.toLowerCase().includes(term) ||
      (p.serialNumber?.toString() ?? "").includes(term),
    );
  }, [projectsWithTeams, projectSearch]);

  // Paginated projects
  const totalProjectPages = Math.max(
    1,
    Math.ceil(filteredProjects.length / PROJECTS_PER_PAGE),
  );
  const currentProjectPage = Math.min(projectPage, totalProjectPages - 1);
  const visibleProjects = useMemo(() => {
    const start = currentProjectPage * PROJECTS_PER_PAGE;
    return filteredProjects.slice(start, start + PROJECTS_PER_PAGE);
  }, [filteredProjects, currentProjectPage]);

  // Pre-calculate user access summary across ALL projects
  const userStats = useMemo(() => {
    const allProjs = projectsWithTeams ?? [];
    const map = new Map<string, { allowedCount: number; totalProjects: number }>();
    for (const u of users ?? []) {
      let allowed = 0;
      for (const p of allProjs) {
        if (checkAccess(u, p).allowed) {
          allowed++;
        }
      }
      map.set(u.id, { allowedCount: allowed, totalProjects: allProjs.length });
    }
    return map;
  }, [users, projectsWithTeams, checkAccess]);

  // Filter and sort users: authorized users ALWAYS float to the top
  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    const result = (users ?? []).filter((u) => {
      const stats = userStats.get(u.id);
      if (onlyAllowed && (stats?.allowedCount ?? 0) === 0) {
        return false;
      }
      if (roleFilter !== "all") {
        if (roleFilter === "__none__" && u.role_name !== null) return false;
        if (u.role_name !== roleFilter) return false;
      }
      if (!term) return true;
      return (
        u.full_name.toLowerCase().includes(term) ||
        (u.email ?? "").toLowerCase().includes(term) ||
        (u.role_name ?? "").toLowerCase().includes(term) ||
        (u.department_name ?? "").toLowerCase().includes(term)
      );
    });

    // Explicit Priority Sort:
    // 1) Users who have access on the CURRENT visible 8 projects float to the very top.
    // 2) Users who have access across ANY company project float next.
    // 3) Ties broken by total allowed count, then alphabetically.
    // 4) Users with 0 access across the company appear last.
    return result.sort((a, b) => {
      let aVisible = 0;
      let bVisible = 0;
      for (const p of visibleProjects) {
        if (checkAccess(a, p).allowed) aVisible++;
        if (checkAccess(b, p).allowed) bVisible++;
      }

      const aHasVisible = aVisible > 0;
      const bHasVisible = bVisible > 0;
      if (aHasVisible !== bHasVisible) {
        return aHasVisible ? -1 : 1;
      }
      if (aVisible !== bVisible) {
        return bVisible - aVisible;
      }

      const aTotal = userStats.get(a.id)?.allowedCount ?? 0;
      const bTotal = userStats.get(b.id)?.allowedCount ?? 0;

      const aHasTotal = aTotal > 0;
      const bHasTotal = bTotal > 0;
      if (aHasTotal !== bHasTotal) {
        return aHasTotal ? -1 : 1;
      }
      if (aTotal !== bTotal) {
        return bTotal - aTotal;
      }

      return a.full_name.localeCompare(b.full_name, "ar");
    });
  }, [users, userSearch, roleFilter, onlyAllowed, userStats, visibleProjects, checkAccess]);

  // Reset user pagination when any filter or project page changes
  useEffect(() => {
    setUserPage(0);
  }, [userSearch, roleFilter, onlyAllowed, selectedPermName, projectPage, userPageSize]);

  // User pagination
  const totalUserPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / userPageSize),
  );
  const currentUserPage = Math.min(userPage, totalUserPages - 1);
  const pagedUsers = useMemo(() => {
    if (userPageSize >= filteredUsers.length) return filteredUsers;
    const start = currentUserPage * userPageSize;
    return filteredUsers.slice(start, start + userPageSize);
  }, [filteredUsers, currentUserPage, userPageSize]);

  // KPI Metrics
  const kpis = useMemo(() => {
    const allUsers = users ?? [];
    const totalUsers = allUsers.length;
    let usersWithAccess = 0;
    for (const u of allUsers) {
      if ((userStats.get(u.id)?.allowedCount ?? 0) > 0) {
        usersWithAccess++;
      }
    }
    const allProjectsCount = (projectsWithTeams ?? []).length;
    return {
      totalUsers,
      usersWithAccess,
      allProjectsCount,
    };
  }, [users, userStats, projectsWithTeams]);

  // Summary counts per visible project (how many users can access this project)
  const projectAccessCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of visibleProjects) {
      let count = 0;
      for (const u of users ?? []) {
        if (checkAccess(u, p).allowed) {
          count++;
        }
      }
      counts.set(p.projectId, count);
    }
    return counts;
  }, [visibleProjects, users, checkAccess]);

  if (usersLoading || projectsLoading || catalogLoading) {
    return <LoadingPage label="جاري تجهيز مصفوفة المشاريع وصلاحيات الوصول..." />;
  }

  const ActiveIcon = activePerm.icon;

  return (
    <div className="space-y-4" dir="rtl">
      {/* ─── 1) KPI Summary Badges ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">
              المصرّح لهم برؤية {activePerm.name}
            </div>
            <div className="text-lg font-bold text-gray-900 mt-0.5">
              {kpis.usersWithAccess}{" "}
              <span className="text-xs text-gray-400 font-normal">
                من أصل {kpis.totalUsers} موظف
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
            <Building2 size={22} />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">إجمالي مشاريع الشركة</div>
            <div className="text-lg font-bold text-gray-900 mt-0.5">
              {kpis.allProjectsCount}{" "}
              <span className="text-xs text-gray-400 font-normal">مشروعاً معتمداً</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
            <Lock size={22} />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">مستوى الحماية والخصوصية</div>
            <div className="text-sm font-bold text-gray-800 mt-0.5">
              {kpis.usersWithAccess <= 5 ? (
                <span className="text-emerald-700 flex items-center gap-1 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  محميّة جداً (محصورة في {kpis.usersWithAccess} فقط)
                </span>
              ) : (
                <span className="text-amber-700 flex items-center gap-1 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  وصول واسع ({kpis.usersWithAccess} شخص)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── 2) Filter Toolbar ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Permission selector dropdown */}
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs font-semibold text-gray-700 shrink-0 flex items-center gap-1.5">
              <ActiveIcon size={16} className="text-primary" />
              صلاحية التدقيق:
            </span>
            <select
              value={selectedPermName}
              onChange={(e) => {
                setSelectedPermName(e.target.value);
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-xs font-semibold text-gray-800 bg-gray-50/50 hover:bg-white focus:outline-none focus:ring-1 focus:ring-primary w-full max-w-2xl lg:max-w-3xl shadow-2xs"
            >
              {AUDIT_PERMISSIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.subtitle}
                </option>
              ))}
            </select>
          </div>

          {/* Quick toggle: show only allowed */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setOnlyAllowed((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                onlyAllowed
                  ? "bg-primary text-white border-primary shadow-2xs"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              <UserCheck size={14} />
              <span>المصرّح لهم فقط</span>
            </button>
          </div>
        </div>

        {/* Secondary filters: Users search + role filter + project quick search */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 border-t border-gray-100 items-center">
          <div className="sm:col-span-5 relative">
            <Search
              size={14}
              className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400"
            />
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="ابحث باسم المهندس أو المستخدم أو البريد..."
              className="w-full border border-gray-200 rounded-lg py-1.5 pr-8 pl-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="sm:col-span-4">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">كل الأدوار الوظيفية</option>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3 relative">
            <Search
              size={14}
              className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400"
            />
            <input
              type="text"
              value={projectSearch}
              onChange={(e) => {
                setProjectSearch(e.target.value);
                setProjectPage(0);
              }}
              placeholder="ابحث باسم المشروع..."
              className="w-full border border-gray-200 rounded-lg py-1.5 pr-8 pl-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* ─── 3) Project Pagination Bar (Fixed No-Scroll Controller) ─────── */}
      <div className="bg-slate-50 border border-gray-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-700">مشاريع الصفحة:</span>
          <span className="text-gray-500 font-mono">
            {filteredProjects.length === 0
              ? "لا توجد مشاريع مطابقة"
              : `المشاريع ${currentProjectPage * PROJECTS_PER_PAGE + 1} - ${Math.min(
                  (currentProjectPage + 1) * PROJECTS_PER_PAGE,
                  filteredProjects.length,
                )} من أصل ${filteredProjects.length}`}
          </span>
          {projectSearch && (
            <span className="text-primary text-[11px] bg-primary-superLight/60 px-1.5 py-0.5 rounded">
              تصفية: "{projectSearch}"
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-[11px]">
            صفحة {currentProjectPage + 1} من {totalProjectPages}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentProjectPage === 0}
              onClick={() => setProjectPage((p) => Math.max(0, p - 1))}
              className="p-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white transition-colors"
              title="المشاريع السابقة"
            >
              <ChevronRight size={16} />
            </button>

            <button
              type="button"
              disabled={currentProjectPage >= totalProjectPages - 1}
              onClick={() => setProjectPage((p) => Math.min(totalProjectPages - 1, p + 1))}
              className="p-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white transition-colors"
              title="المشاريع التالية"
            >
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ─── 4) The Zero-Scroll Matrix Table ───────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden w-full">
        <table className="w-full text-right border-collapse table-fixed">
          <thead>
            <tr className="bg-gray-50/90 border-b border-gray-200 text-xs font-semibold text-gray-700">
              {/* User Identity Column */}
              <th className="py-3 px-3 w-[220px] text-right">
                <div className="flex items-center gap-1.5">
                  <Users size={14} className="text-gray-400" />
                  <span>المهندس / المستخدم</span>
                  <span className="text-[10px] text-gray-400 font-normal">
                    ({filteredUsers.length})
                  </span>
                </div>
              </th>

              {/* Dynamic 8 Project Columns */}
              {visibleProjects.map((p) => (
                <th
                  key={p.projectId}
                  className="py-2.5 px-1.5 text-center border-r border-gray-100 font-medium"
                >
                  <div
                    className="truncate text-[11px] font-semibold text-gray-800 hover:text-primary transition-colors cursor-default"
                    title={`#${p.serialNumber ?? "—"} ${p.projectName} (${p.status || "نشط"})`}
                  >
                    {p.projectName}
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                    #{p.serialNumber ?? "—"}
                  </div>
                </th>
              ))}

              {/* Fill empty cells if last page has < 8 projects to preserve fixed layout */}
              {Array.from({
                length: Math.max(0, PROJECTS_PER_PAGE - visibleProjects.length),
              }).map((_, i) => (
                <th
                  key={`empty-${i}`}
                  className="py-2.5 px-1.5 text-center border-r border-gray-100 bg-gray-50/30"
                >
                  <span className="text-gray-300 text-[10px]">—</span>
                </th>
              ))}

              {/* Total Projects Column */}
              <th className="py-3 px-2 w-[100px] text-center border-r border-gray-200 bg-gray-50/80">
                <div className="text-[11px] font-bold text-gray-700">
                  إجمالي المشاريع
                </div>
                <div className="text-[9px] text-gray-400 font-normal">
                  عبر كل الشركة
                </div>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 text-xs">
            {filteredUsers.length === 0 ? (
              <tr>
                <td
                  colSpan={PROJECT_PER_PAGE_COLSPAN}
                  className="p-8 text-center text-gray-500 text-xs"
                >
                  لا يوجد مستخدمون مطابقون لمعايير البحث والتصفية.
                </td>
              </tr>
            ) : (
              pagedUsers.map((user) => {
                const stats = userStats.get(user.id);
                const allowedCount = stats?.allowedCount ?? 0;
                const totalCount = stats?.totalProjects ?? 0;
                const hasAnyAccess = allowedCount > 0;

                return (
                  <tr
                    key={user.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      hasAnyAccess ? "bg-white" : "bg-gray-50/30 opacity-75"
                    }`}
                  >
                    {/* User Identity Cell */}
                    <td className="py-2.5 px-3 align-middle">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="font-semibold text-gray-900 truncate block text-xs"
                              title={user.full_name}
                            >
                              {user.full_name}
                            </span>
                            {user.total_override_count > 0 && (
                              <span
                                className="text-[9px] px-1 py-0.2 rounded bg-primary-superLight/60 text-primary border border-primary/20 shrink-0"
                                title="لديه تخصيص فردي في الصلاحيات"
                              >
                                مخصص
                              </span>
                            )}
                          </div>
                          <div
                            className="text-[10px] text-gray-400 truncate mt-0.5"
                            title={`${user.role_name || "بدون دور"} · ${user.department_name || "بدون قسم"}`}
                          >
                            {user.role_name || "بدون دور"}
                            {user.department_name ? ` · ${user.department_name}` : ""}
                          </div>
                        </div>

                        {onSelectUserForEdit && (
                          <button
                            type="button"
                            onClick={() => onSelectUserForEdit(user)}
                            className="p-1 rounded text-gray-400 hover:text-primary hover:bg-primary-superLight/40 transition-colors shrink-0"
                            title="الانتقال لتعديل صلاحيات هذا المستخدم"
                          >
                            <Eye size={13} />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* 8 Project Access Status Cells */}
                    {visibleProjects.map((proj) => {
                      const res = checkAccess(user, proj);

                      return (
                        <td
                          key={proj.projectId}
                          className={`py-2 px-1 text-center align-middle border-r border-gray-100 ${
                            res.allowed ? "bg-primary-superLight/20" : ""
                          }`}
                        >
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            {res.allowed ? (
                              <span
                                className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-primary text-white shadow-2xs cursor-help transition-transform hover:scale-110"
                                title={`مسموح: ${res.reason}`}
                              >
                                <Check size={13} className="stroke-[3]" />
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-gray-100 text-gray-300 border border-gray-200/60 cursor-help"
                                title={`ممنوع: ${res.reason}`}
                              >
                                <Minus size={11} className="stroke-[2]" />
                              </span>
                            )}

                            {res.isTeamMember && (
                              <span
                                className="text-[8px] text-primary bg-primary-superLight/70 px-1 py-0 rounded font-semibold border border-primary/20 leading-none"
                                title="عضو في فريق هذا المشروع"
                              >
                                عضو
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Empty placeholder cells if last page has < 8 projects */}
                    {Array.from({
                      length: Math.max(0, PROJECTS_PER_PAGE - visibleProjects.length),
                    }).map((_, i) => (
                      <td
                        key={`empty-td-${i}`}
                        className="py-2 px-1 text-center border-r border-gray-100 bg-gray-50/10 text-gray-200"
                      >
                        —
                      </td>
                    ))}

                    {/* Total Accessible Projects across the entire company */}
                    <td className="py-2 px-2 text-center align-middle border-r border-gray-200 bg-gray-50/40">
                      <span
                        className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                          allowedCount > 0
                            ? allowedCount === totalCount
                              ? "bg-purple-100 text-purple-800 border border-purple-200"
                              : "bg-primary-superLight text-primary-dark border border-primary/20"
                            : "bg-gray-100 text-gray-400 border border-gray-200"
                        }`}
                        title={`مسموح له في ${allowedCount} من أصل ${totalCount} مشروع في الشركة`}
                      >
                        {allowedCount} / {totalCount}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* ─── 5) Footer: Total Users with access per project ───────── */}
          <tfoot>
            <tr className="bg-gray-50/90 border-t-2 border-gray-200 text-xs font-semibold text-gray-700">
              <td className="py-2.5 px-3 text-right">
                <span className="text-gray-600 font-bold">
                  إجمالي المصرّح لهم بالمشروع:
                </span>
              </td>

              {visibleProjects.map((p) => {
                const count = projectAccessCounts.get(p.projectId) ?? 0;
                return (
                  <td
                    key={p.projectId}
                    className="py-2.5 px-1.5 text-center border-r border-gray-200"
                  >
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${
                        count > 0
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : "bg-gray-100 text-gray-400"
                      }`}
                      title={`${count} موظف يملكون صلاحية (${activePerm.name}) في هذا المشروع`}
                    >
                      {count}
                    </span>
                  </td>
                );
              })}

              {Array.from({
                length: Math.max(0, PROJECTS_PER_PAGE - visibleProjects.length),
              }).map((_, i) => (
                <td
                  key={`empty-foot-${i}`}
                  className="py-2.5 px-1.5 text-center border-r border-gray-200 text-gray-300"
                >
                  —
                </td>
              ))}

              <td className="py-2.5 px-2 text-center border-r border-gray-200 bg-gray-100/60 font-bold text-gray-800 font-mono text-[11px]">
                {kpis.usersWithAccess} نشط
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ─── 5) User Pagination Bar (Page-by-Page Controls) ──────────── */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
        {/* Right side (RTL): Showing info */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-700">المستخدمين:</span>
          <span className="text-gray-500 font-mono">
            {filteredUsers.length === 0
              ? "0 مستخدم"
              : `عرض ${currentUserPage * userPageSize + 1} - ${Math.min(
                  (currentUserPage + 1) * userPageSize,
                  filteredUsers.length,
                )} من أصل ${filteredUsers.length} مستخدم`}
          </span>
          {onlyAllowed && (
            <span className="text-primary bg-primary-superLight/60 border border-primary/20 px-2 py-0.5 rounded-full text-[11px] font-medium">
              المصرّح لهم فقط
            </span>
          )}
        </div>

        {/* Center: Previous / Page numbers / Next */}
        {totalUserPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentUserPage === 0}
              onClick={() => setUserPage((p) => Math.max(0, p - 1))}
              className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-1 shadow-2xs"
            >
              <ChevronRight size={14} />
              <span>السابق</span>
            </button>

            {/* Direct Page Numbers */}
            <div className="flex items-center gap-1">
              {Array.from({ length: totalUserPages }).map((_, idx) => {
                if (
                  idx === 0 ||
                  idx === totalUserPages - 1 ||
                  Math.abs(idx - currentUserPage) <= 1
                ) {
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setUserPage(idx)}
                      className={`min-w-7 h-7 px-2 rounded-md font-mono text-xs font-semibold transition-colors ${
                        idx === currentUserPage
                          ? "bg-primary text-white shadow-2xs"
                          : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                }
                if (
                  (idx === 1 && currentUserPage > 2) ||
                  (idx === totalUserPages - 2 &&
                    currentUserPage < totalUserPages - 3)
                ) {
                  return (
                    <span key={idx} className="text-gray-400 px-1 font-mono">
                      …
                    </span>
                  );
                }
                return null;
              })}
            </div>

            <button
              type="button"
              disabled={currentUserPage >= totalUserPages - 1}
              onClick={() => setUserPage((p) => Math.min(totalUserPages - 1, p + 1))}
              className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-1 shadow-2xs"
            >
              <span>التالي</span>
              <ChevronLeft size={14} />
            </button>
          </div>
        )}

        {/* Left side: Page size switcher */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-[11px]">عرض لكل صفحة:</span>
          <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg border border-gray-200">
            {[10, 15, 25, 50].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  setUserPageSize(size);
                  setUserPage(0);
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  userPageSize === size
                    ? "bg-white text-gray-900 font-bold shadow-2xs"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {size}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setUserPageSize(9999);
                setUserPage(0);
              }}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                userPageSize >= 9999
                  ? "bg-white text-gray-900 font-bold shadow-2xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              الكل
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const PROJECT_PER_PAGE_COLSPAN = 2 + PROJECTS_PER_PAGE;
