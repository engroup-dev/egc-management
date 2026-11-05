import { Component, ErrorInfo, ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HardHat, LayoutGrid, Search, Smartphone, User, UserCheck, Users } from "lucide-react";
import {
  PermissionUserSummary,
  usePermissionUsers,
} from "../../../hooks/permissions/useUserPermissionsAdmin";
import UserModulePermissionsEditor from "../../../components/permissions/UserModulePermissionsEditor";
import ProjectAccessMatrix from "../../../components/permissions/ProjectAccessMatrix";
import EngineerProjectsAccess from "../../../components/permissions/EngineerProjectsAccess";
import MobileBuilderPermissionsTab from "../../../components/permissions/MobileBuilderPermissionsTab";
import Button from "../../../components/ui/Button";
import LoadingPage from "../../../components/ui/LoadingPage";
import ErrorPage from "../../../components/ui/errorPage";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PermissionsErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("PermissionsErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-800 space-y-3"
        >
          <h3 className="font-bold text-sm">حدث خطأ أثناء عرض صلاحيات المستخدم</h3>
          <p className="text-xs text-red-600 font-mono">
            {this.state.error?.message}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function UserPermissionsPage() {
  const { id: routeUserId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { data: users, isLoading, error } = usePermissionUsers();

  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [onlyCustomized, setOnlyCustomized] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "person" | "engineer-projects" | "mobile-builder" | "matrix"
  >("person");

  const [isDirty, setIsDirty] = useState(false);
  const [pendingUserSwitch, setPendingUserSwitch] =
    useState<PermissionUserSummary | null>(null);

  // Unique role and department options for quick filtering
  const roleOptions = useMemo(() => {
    const names = new Set<string>();
    for (const u of users ?? []) {
      if (u.role_name) names.add(u.role_name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "ar"));
  }, [users]);

  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    for (const u of users ?? []) {
      if (u.department_name) names.add(u.department_name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "ar"));
  }, [users]);

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (onlyCustomized && u.total_override_count === 0) return false;
      if (roleFilter !== "all") {
        if (roleFilter === "__none__" && u.role_name !== null) return false;
        if (roleFilter !== "__none__" && u.role_name !== roleFilter)
          return false;
      }
      if (departmentFilter !== "all") {
        if (departmentFilter === "__none__" && u.department_name !== null)
          return false;
        if (
          departmentFilter !== "__none__" &&
          u.department_name !== departmentFilter
        ) {
          return false;
        }
      }
      if (!term) return true;
      return (
        u.full_name.toLowerCase().includes(term) ||
        (u.email ?? "").toLowerCase().includes(term) ||
        (u.phone ?? "").toLowerCase().includes(term) ||
        (u.role_name ?? "").toLowerCase().includes(term)
      );
    });
  }, [users, userSearch, roleFilter, departmentFilter, onlyCustomized]);

  const selectedUser = useMemo(() => {
    if (!users || users.length === 0) return null;
    if (routeUserId) {
      return users.find((u) => u.id === routeUserId) ?? null;
    }
    return null;
  }, [users, routeUserId]);

  // Auto-select first user when visiting /settings/permissions/users without :id
  useEffect(() => {
    if (!routeUserId && filteredUsers.length > 0) {
      navigate(`/settings/permissions/users/${filteredUsers[0].id}`, {
        replace: true,
      });
    }
  }, [routeUserId, filteredUsers, navigate]);

  const handleSelectUser = (target: PermissionUserSummary) => {
    if (target.id === selectedUser?.id) return;
    if (isDirty) {
      setPendingUserSwitch(target);
      return;
    }
    navigate(`/settings/permissions/users/${target.id}`);
  };

  if (isLoading) return <LoadingPage label="جاري تحميل قائمة المستخدمين..." />;
  if (error) {
    return (
      <ErrorPage
        error={error instanceof Error ? error.message : "خطأ غير معروف"}
        label="خطأ في تحميل المستخدمين"
      />
    );
  }

  const customizedUsersCount = (users ?? []).filter(
    (u) => u.total_override_count > 0,
  ).length;

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 py-6 px-4 sm:px-6"
    >
      <div className="max-w-[1700px] w-full mx-auto space-y-4">
        {/* Page Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              صلاحيات المستخدمين
            </h1>
            <p className="text-xs text-gray-600 mt-1">
              اختر المستخدم وحدد الموديولات والعمليات المتاحة له بشكل فردي.
              التخصيص الفردي يتفوق تلقائياً على صلاحيات الدور والقسم.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-lg px-3 py-1.5">
              <Users size={14} className="text-gray-400" />
              إجمالي المستخدمين: <strong>{(users ?? []).length}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 bg-primary-superLight/40 border border-primary/20 text-primary rounded-lg px-3 py-1.5">
              <UserCheck size={14} />
              لديهم تخصيص فردي: <strong>{customizedUsersCount}</strong>
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("person")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "person"
                ? "bg-primary text-white shadow-2xs"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <User size={15} />
            <span>تخصيص مستخدم (بواسطة الشخص)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("engineer-projects")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "engineer-projects"
                ? "bg-primary text-white shadow-2xs"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <HardHat size={15} />
            <span>مهندس محدد (صلاحيات المشاريع)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("mobile-builder")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "mobile-builder"
                ? "bg-primary text-white shadow-2xs"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <Smartphone size={15} />
            <span>صلاحيات تطبيق الهاتف (EGC Builder)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("matrix")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "matrix"
                ? "bg-primary text-white shadow-2xs"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <LayoutGrid size={15} />
            <span>مصفوفة المشاريع (تدقيق الوصول)</span>
          </button>
        </div>

        {activeTab === "person" ? (
          /* Split-View: Right = Users List, Left = Selected User Module Editor */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Users List Panel */}
          <div className="lg:col-span-3 xl:col-span-3 lg:sticky lg:top-4 bg-white rounded-xl border border-gray-200 p-3 shadow-sm space-y-3">
            <div className="relative">
              <Search
                size={15}
                className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400"
              />
              <input
                type="text"
                dir="rtl"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="ابحث باسم المستخدم أو البريد أو الهاتف..."
                className="w-full border border-gray-200 rounded-lg py-2 pr-9 pl-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">كل الأدوار</option>
                <option value="__none__">بدون دور</option>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">كل الأقسام</option>
                <option value="__none__">بدون قسم</option>
                {departmentOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-gray-500">
                النتائج: {filteredUsers.length}
              </span>
              <button
                type="button"
                onClick={() => setOnlyCustomized((v) => !v)}
                className={`px-2 py-0.5 rounded-md border transition-colors ${
                  onlyCustomized
                    ? "bg-primary text-white border-primary"
                    : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                }`}
              >
                المخصصون فقط
              </button>
            </div>

            {filteredUsers.length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-lg p-6 text-center text-xs text-gray-500">
                لا يوجد مستخدمون مطابقون للبحث.
              </div>
            ) : (
              <ul className="space-y-1 max-h-[calc(100vh-290px)] overflow-y-auto pr-0.5">
                {filteredUsers.map((person) => {
                  const isSelected = person.id === selectedUser?.id;
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectUser(person)}
                        className={`w-full text-right rounded-lg px-3 py-2.5 border transition-colors flex items-start justify-between gap-2 ${
                          isSelected
                            ? "bg-primary-superLight/60 border-primary/40"
                            : "bg-white border-transparent hover:bg-gray-50 hover:border-gray-200"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`h-2 w-2 rounded-full shrink-0 ${
                                person.status === "active"
                                  ? "bg-green-500"
                                  : "bg-gray-300"
                              }`}
                            />
                            <span
                              className={`text-sm truncate ${
                                isSelected
                                  ? "font-semibold text-primary-dark"
                                  : "font-medium text-gray-900"
                              }`}
                            >
                              {person.full_name}
                            </span>
                          </div>

                          <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                            {person.role_name || "بدون دور"}
                            {person.department_name
                              ? ` · ${person.department_name}`
                              : ""}
                          </div>
                        </div>

                        {person.total_override_count > 0 && (
                          <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700">
                            {person.total_override_count} مخصصة
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Selected User Permissions Editor Panel */}
          <div className="lg:col-span-9 xl:col-span-9 min-w-0">
            {selectedUser ? (
              <PermissionsErrorBoundary key={selectedUser.id}>
                <UserModulePermissionsEditor
                  selectedUser={selectedUser}
                  allUsers={users ?? []}
                  onDirtyChange={setIsDirty}
                />
              </PermissionsErrorBoundary>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center shadow-sm">
                <Users size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm font-medium text-gray-700">
                  اختر مستخدماً من القائمة لعرض وتخصيص صلاحياته
                </p>
              </div>
            )}
          </div>
        </div>
        ) : activeTab === "engineer-projects" ? (
          <EngineerProjectsAccess
            selectedUser={selectedUser}
            allUsers={users ?? []}
            onSelectUser={(u) => {
              handleSelectUser(u);
            }}
            onSwitchToSystemPermissions={() => {
              setActiveTab("person");
            }}
          />
        ) : activeTab === "mobile-builder" ? (
          <PermissionsErrorBoundary>
            <MobileBuilderPermissionsTab
              selectedUser={selectedUser}
              allUsers={users ?? []}
              onSelectUser={(u) => {
                handleSelectUser(u);
              }}
              onSwitchToSystemPermissions={() => {
                setActiveTab("person");
              }}
            />
          </PermissionsErrorBoundary>
        ) : (
          <ProjectAccessMatrix
            onSelectUserForEdit={(u) => {
              handleSelectUser(u);
              setActiveTab("engineer-projects");
            }}
          />
        )}
      </div>

      {/* Unsaved Changes Guard Modal when switching user */}
      {pendingUserSwitch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            dir="rtl"
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4"
          >
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                تغييرات غير محفوظة
              </h3>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                لديك تعديلات غير محفوظة على صلاحيات{" "}
                <strong>{selectedUser?.full_name}</strong>. هل تريد تجاهل هذه
                التعديلات والانتقال إلى{" "}
                <strong>{pendingUserSwitch.full_name}</strong>؟
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPendingUserSwitch(null)}
              >
                البقاء لحفظ التعديلات
              </Button>
              <Button
                variant="error"
                size="sm"
                onClick={() => {
                  const target = pendingUserSwitch;
                  setPendingUserSwitch(null);
                  setIsDirty(false);
                  navigate(`/settings/permissions/users/${target.id}`);
                }}
              >
                تجاهل والانتقال
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
