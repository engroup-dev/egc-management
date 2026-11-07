import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building,
  DollarSign,
  FolderCog,
  History,
  LinkIcon,
  ListTodo,
  MapPin,
  PackageOpen,
  Settings,
  ShieldUser,
  Store,
  Users,
} from "lucide-react";
import type { PermissionCatalogRow } from "../../types/permissions.types";

export type ModuleId =
  | "hr"
  | "finance"
  | "projects"
  | "execution-management"
  | "operations"
  | "supply-chain"
  | "shops"
  | "crm"
  | "company"
  | "tasks"
  | "analytics"
  | "settings"
  | "activity-log";

export type ActionCategory = "gate" | "view" | "create" | "edit" | "delete";

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  /** Primary permission(s) that control whether the module card shows in MainMenu. */
  gateNames: string[];
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    id: "hr",
    label: "إدارة الموظفين",
    subtitle: "ملفات الموظفين، التوظيف، المقابلات، وتقييم الأداء",
    icon: Users,
    gateNames: ["view_hr_section"],
  },
  {
    id: "crm",
    label: "إدارة العملاء",
    subtitle: "سجلات العملاء وإضافة وتعديل بياناتهم",
    icon: ShieldUser,
    gateNames: ["view_clients"],
  },
  {
    id: "supply-chain",
    label: "سلسلة التوريد",
    subtitle: "إدارة المقاولين والموردين ودمج السجلات المكررة",
    icon: LinkIcon,
    gateNames: ["view_contractors"],
  },
  {
    id: "projects",
    label: "المشاريع",
    subtitle: "ملفات المشاريع، بيانات العقود، والإحصائيات والعدادات",
    icon: MapPin,
    gateNames: ["view_projects"],
  },
  {
    id: "finance",
    label: "المالية",
    subtitle: "مسك الدفاتر، الخزينة، الدفعات، ومالية الشركة والمشاريع",
    icon: DollarSign,
    gateNames: ["view_finance_section"],
  },
  {
    id: "company",
    label: "الشركة",
    subtitle: "الراتب الشخصي، نسب المشاريع، وتوزيع الأرباح",
    icon: Building,
    gateNames: ["view_company_section"],
  },
  {
    id: "operations",
    label: "التشغيل",
    subtitle: "الاتفاقيات والعقود، جداول الكميات (BOQ)، والخرائط",
    icon: PackageOpen,
    gateNames: ["view_operations_section"],
  },
  {
    id: "shops",
    label: "المتاجر",
    subtitle: "كتالوج المنتجات والتصنيفات وطلبات شراء المشاريع",
    icon: Store,
    gateNames: ["view_shops_section"],
  },
  {
    id: "execution-management",
    label: "اداره التنفيذ",
    subtitle: "مراحل التنفيذ الميداني، فرق عمل المشاريع، وصلاحياتها",
    icon: FolderCog,
    gateNames: ["view_execution_section"],
  },
  {
    id: "tasks",
    label: "المهام",
    subtitle: "لوحات المهام، المهام المجدولة، ومتابعة الأداء",
    icon: ListTodo,
    gateNames: ["view_tasks_section"],
  },
  {
    id: "analytics",
    label: "التحليلات ومؤشرات الأداء",
    subtitle: "المؤشرات التنفيذية، تحليل التكاليف، أداء المشاريع والمهام",
    icon: BarChart3,
    gateNames: ["view_analytics_section"],
  },
  {
    id: "settings",
    label: "الإعدادات",
    subtitle: "المستخدمون، الأدوار، الأقسام، البيانات المرجعية، والنظام",
    icon: Settings,
    gateNames: ["view_settings_section"],
  },
  {
    id: "activity-log",
    label: "سجل النشاط",
    subtitle: "سجلات تدقيق النظام، حركات الحسابات، والعمليات",
    icon: History,
    gateNames: [
      "view_audit_logs",
      "view_finance_logs",
      "view_access_logs",
      "view_operations_logs",
      "view_hr_logs",
    ],
  },
];

export const ACTION_CATEGORY_ORDER: Exclude<ActionCategory, "gate">[] = [
  "view",
  "create",
  "edit",
  "delete",
];

export const ACTION_CATEGORY_META: Record<
  Exclude<ActionCategory, "gate">,
  { label: string; badgeClass: string; actionVerb: string }
> = {
  view: {
    label: "قراءة ومشاهدة",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    actionVerb: "القراءة والمشاهدة",
  },
  create: {
    label: "إضافة وحفظ جديد",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    actionVerb: "الإضافة والحفظ",
  },
  edit: {
    label: "تعديل وإدارة",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
    actionVerb: "التعديل والإدارة",
  },
  delete: {
    label: "حذف وإلغاء",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    actionVerb: "الحذف والإلغاء",
  },
};

const EXPLICIT_MODULE_BY_PERMISSION: Record<string, ModuleId> = {
  // CRM
  view_clients: "crm",
  manage_clients: "crm",

  // Supply Chain
  view_contractors: "supply-chain",
  manage_contractors: "supply-chain",
  merge_contractors: "supply-chain",
  view_vendors: "supply-chain",
  manage_vendors: "supply-chain",
  merge_vendors: "supply-chain",

  // Shops
  view_shops_section: "shops",
  view_shop_catalog: "shops",
  manage_shop_catalog: "shops",
  view_shop_orders: "shops",

  // Company
  view_company_section: "company",
  view_own_salary: "company",
  view_distribution: "company",
  manage_distribution: "company",

  // Tasks
  view_tasks_section: "tasks",
  create_task: "tasks",
  create_scheduled_task: "tasks",
  view_task_dashboard: "tasks",
  view_task_performance: "tasks",
  view_task_logs: "tasks",

  // Analytics
  view_analytics_section: "analytics",

  // Projects
  view_projects: "projects",
  create_project: "projects",
  view_project_counters: "projects",
  view_all_project_counters: "projects",

  // Execution Management
  view_execution_section: "execution-management",
  manage_execution: "execution-management",
  view_all_project_teams: "execution-management",
  manage_project_team: "execution-management",
  manage_permissions_project: "execution-management",

  // Operations (Contracts, BOQ, Maps)
  view_operations_section: "operations",
  view_project_agreements: "operations",
  view_all_project_agreements: "operations",
  create_agreement: "operations",
  edit_agreement: "operations",
  edit_project_agreements: "operations",
  create_contractor_penalty: "operations",
  view_operations_boq: "operations",
  create_type_from_template: "operations",
  view_operations_maps: "operations",
  view_operations_settings: "operations",

  // Finance
  view_finance_section: "finance",
  view_bookkeeping: "finance",
  view_treasury: "finance",
  view_company_finance: "finance",
  view_payments: "finance",
  view_contractor_payments: "finance",
  view_pending_distribution: "finance",
  view_project_finance_income: "finance",
  print_project_expense_range: "finance",
  create_agreement_payment: "finance",
  create_penalty: "finance",

  // HR
  view_hr_section: "hr",
  view_employees: "hr",
  create_employee: "hr",
  view_employee_personal_data: "hr",
  view_employee_compensation: "hr",
  view_employee_performance: "hr",
  evaluate_employee_performance: "hr",
  view_applicants: "hr",
  create_applicant: "hr",
  evaluate_applicants: "hr",
  manage_interview_rounds: "hr",
  view_job_requests: "hr",
  manage_job_requests: "hr",

  // Settings & System Admin
  view_settings_section: "settings",
  manage_roles: "settings",
  manage_project_roles: "settings",
  manage_departments: "settings",
  manage_permissions_company: "settings",
  manage_reference_data: "settings",
  manage_specialities: "settings",
  manage_notifications: "settings",
  view_user_sessions: "settings",
  reset_user_password: "settings",
  manage_website: "settings",
  manage_evaluation_settings: "settings",

  // Activity Log
  view_audit_logs: "activity-log",
  view_finance_logs: "activity-log",
  view_access_logs: "activity-log",
  view_operations_logs: "activity-log",
  view_hr_logs: "activity-log",
  view_notification_log: "activity-log",
};

export function resolveModuleForPermission(
  permission: PermissionCatalogRow,
): ModuleId {
  const explicit = EXPLICIT_MODULE_BY_PERMISSION[permission.name];
  if (explicit) return explicit;

  const n = permission.name.toLowerCase();
  if (n.includes("log") || n.includes("audit")) return "activity-log";
  if (n.includes("execution")) return "execution-management";
  if (n.includes("analytic")) return "analytics";
  if (n.includes("shop")) return "shops";
  if (n.includes("client")) return "crm";
  if (n.includes("task")) return "tasks";
  if (
    (n.includes("contractor") || n.includes("vendor")) &&
    !n.includes("payment") &&
    !n.includes("penalty") &&
    !n.includes("agreement")
  ) {
    return "supply-chain";
  }

  switch (permission.area) {
    case "HR":
      return "hr";
    case "Finance":
      return "finance";
    case "Project":
      return "projects";
    case "Operations":
      return "operations";
    case "Admin":
    default:
      return "settings";
  }
}

export function classifyPermissionAction(
  permission: PermissionCatalogRow,
  moduleDef: ModuleDefinition,
): ActionCategory {
  if (moduleDef.gateNames.includes(permission.name)) {
    return "gate";
  }

  const n = permission.name.toLowerCase();
  if (
    n.startsWith("delete_") ||
    n.startsWith("merge_") ||
    n.startsWith("approve_")
  ) {
    return "delete";
  }
  if (n.startsWith("create_") || n.startsWith("add_")) {
    return "create";
  }
  if (
    n.startsWith("view_") ||
    n.startsWith("print_") ||
    n.startsWith("export_")
  ) {
    return "view";
  }
  return "edit";
}

const SHORT_PERMISSION_LABELS: Record<string, string> = {
  // HR
  view_hr_section: "دخول قسم الموارد البشرية",
  view_employees: "دليل الموظفين والأقسام",
  create_employee: "إضافة موظف جديد",
  view_employee_personal_data: "البيانات الشخصية والبنكية",
  view_employee_compensation: "تفاصيل المرتبات والبدلات",
  view_employee_performance: "سجل تقييم أداء الموظف",
  evaluate_employee_performance: "إجراء تقييم أداء الموظفين",
  view_applicants: "سجلات المتقدمين للوظائف",
  create_applicant: "إضافة متقدم لوظيفة",
  evaluate_applicants: "تقييم مقابلات التوظيف",
  manage_interview_rounds: "إدارة جولات المقابلات",
  view_job_requests: "سجل طلبات التوظيف",
  manage_job_requests: "إدارة واعتماد طلبات التوظيف",
  view_hr_logs: "سجلات حركات قسم الموظفين",

  // Finance
  view_finance_section: "دخول قسم المالية",
  view_bookkeeping: "مسك الدفاتر اليومية",
  view_treasury: "الخزينة وحركات النقدية",
  view_company_finance: "المالية العامة للشركة",
  view_payments: "سندات والدفعات المالية",
  view_contractor_payments: "دفعات المقاولين والموردين",
  view_pending_distribution: "الدفعات المعلقة وتوزيعها",
  view_project_finance_income: "إيرادات ومستخلصات المشاريع",
  print_project_expense_range: "طباعة تقارير المصروفات",
  create_agreement_payment: "تسجيل دفعة اتفاقية",
  create_penalty: "تسجيل غرامة مالية",
  view_finance_logs: "سجلات الحركات المالية",

  // Projects
  view_projects: "عرض ملفات المشاريع",
  create_project: "إنشاء مشروع جديد",
  view_project_counters: "إحصائيات وعدادات المشاريع",
  view_all_project_counters: "إحصائيات كل المشاريع",
  view_execution_section: "دخول إدارة التنفيذ",
  manage_execution: "إدارة مراحل التنفيذ",
  view_all_project_teams: "استعراض فرق العمل بالمشاريع",
  manage_project_team: "تعيين وإدارة فرق المشاريع",
  manage_permissions_project: "إدارة صلاحيات المشاريع",

  // Operations
  view_operations_section: "دخول قسم التشغيل",
  view_project_agreements: "استعراض الاتفاقيات والعقود",
  view_all_project_agreements: "عقود كل المشاريع",
  create_agreement: "إنشاء اتفاقية جديدة",
  edit_agreement: "تعديل بنود الاتفاقيات",
  edit_project_agreements: "إدارة اتفاقيات المشاريع",
  create_contractor_penalty: "فرض غرامة على مقاول",
  view_operations_boq: "جداول الكميات (BOQ)",
  create_type_from_template: "نماذج بنود الأعمال",
  view_operations_maps: "الخرائط والمخططات",
  view_operations_settings: "إعدادات التشغيل",
  view_operations_logs: "سجلات قسم التشغيل",

  // Supply Chain
  view_contractors: "دليل المقاولين",
  manage_contractors: "إضافة وتعديل المقاولين",
  merge_contractors: "دمج سجلات المقاولين",
  view_vendors: "دليل الموردين",
  manage_vendors: "إضافة وتعديل الموردين",
  merge_vendors: "دمج سجلات الموردين",

  // Shops
  view_shops_section: "دخول قسم المتاجر",
  view_shop_catalog: "كتالوج المنتجات",
  manage_shop_catalog: "إدارة منتجات وتصنيفات المتجر",
  view_shop_orders: "طلبات شراء المشاريع",

  // CRM
  view_clients: "دليل سجلات العملاء",
  manage_clients: "إضافة وتعديل بيانات العملاء",

  // Company
  view_company_section: "دخول قسم الشركة",
  view_own_salary: "عرض الراتب الشخصي",
  view_distribution: "نسب وتوزيع الأرباح",
  manage_distribution: "إدارة نسب وتوزيع الأرباح",

  // Tasks
  view_tasks_section: "دخول قسم المهام",
  create_task: "إنشاء مهمة جديدة",
  create_scheduled_task: "جدولة المهام المتكررة",
  view_task_dashboard: "لوحة متابعة المهام",
  view_task_performance: "تقارير إنجاز المهام",
  view_task_logs: "سجلات حركات المهام",

  // Analytics
  view_analytics_section: "دخول قسم التحليلات ومؤشرات الأداء",

  // Settings
  view_settings_section: "دخول الإعدادات",
  manage_roles: "إدارة الأدوار الوظيفية",
  manage_project_roles: "إدارة أدوار فرق المشاريع",
  manage_departments: "إدارة أقسام الشركة",
  manage_permissions_company: "إدارة صلاحيات النظام",
  manage_reference_data: "البيانات المرجعية (بنوك، وحدات...)",
  manage_specialities: "التخصصات المهنية",
  manage_notifications: "إدارة وضبط الإشعارات",
  view_audit_logs: "سجلات تدقيق النظام (Audit Logs)",
  view_user_sessions: "جلسات تسجيل الدخول",
  reset_user_password: "إعادة ضبط كلمات المرور",
  manage_website: "إدارة محتوى الموقع الإلكتروني",
  manage_evaluation_settings: "إعدادات نماذج التقييم",
};

export function getPermissionShortLabel(
  permission: PermissionCatalogRow,
): string {
  const short = SHORT_PERMISSION_LABELS[permission.name];
  if (short) return short;

  const raw = permission.description || permission.name;
  const clean = raw.split(/[.\n—–-]/)[0].trim();
  return clean.length > 40 ? clean.slice(0, 38) + "..." : clean;
}

export interface GroupedModulePermissions {
  module: ModuleDefinition;
  gatePermissions: PermissionCatalogRow[];
  byCategory: Record<Exclude<ActionCategory, "gate">, PermissionCatalogRow[]>;
  allPermissions: PermissionCatalogRow[];
}

export function groupCatalogByModule(
  catalog: PermissionCatalogRow[],
): GroupedModulePermissions[] {
  const buckets = new Map<ModuleId, PermissionCatalogRow[]>();
  for (const def of MODULE_DEFINITIONS) {
    buckets.set(def.id, []);
  }

  for (const perm of catalog) {
    const modId = resolveModuleForPermission(perm);
    buckets.get(modId)?.push(perm);
  }

  return MODULE_DEFINITIONS.map((def) => {
    const perms = buckets.get(def.id) ?? [];
    const gatePermissions: PermissionCatalogRow[] = [];
    const byCategory: Record<
      Exclude<ActionCategory, "gate">,
      PermissionCatalogRow[]
    > = {
      view: [],
      create: [],
      edit: [],
      delete: [],
    };

    for (const perm of perms) {
      const cat = classifyPermissionAction(perm, def);
      if (cat === "gate") {
        gatePermissions.push(perm);
      } else {
        byCategory[cat].push(perm);
      }
    }

    // Keep stable, readable order within each category
    gatePermissions.sort(
      (a, b) => def.gateNames.indexOf(a.name) - def.gateNames.indexOf(b.name),
    );
    for (const cat of ACTION_CATEGORY_ORDER) {
      byCategory[cat].sort((a, b) =>
        (a.description || a.name).localeCompare(b.description || b.name, "ar"),
      );
    }

    return {
      module: def,
      gatePermissions,
      byCategory,
      allPermissions: [
        ...gatePermissions,
        ...byCategory.view,
        ...byCategory.create,
        ...byCategory.edit,
        ...byCategory.delete,
      ],
    };
  }).filter((group) => group.allPermissions.length > 0);
}
