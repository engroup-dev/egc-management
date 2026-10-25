import { useQueries } from "@tanstack/react-query";
import { matchPath } from "react-router-dom";
import { BREADCRUMB_ENTITIES } from "../config/navigation/breadcrumbEntities";

export interface Crumb {
  path: string;
  label: string;
  loading: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Segments that only exist as a prefix for the id after them (there is no
// `/tasks/board` page) — folded into that id's crumb instead of rendered as
// a dead link of their own.
const PREFIX_ONLY = new Set(["board", "space", "task", "department", "project", "expense", "employee", "folder"]);

// Simple human-friendly labels for common route segments
export const SEGMENT_NAMES: Record<string, string> = {
  "": "اللوحة الرئيسية",
  accounting: "المحاسبة",
  activity: "سجل المهام",
  "activity-log": "سجل النشاط",
  add: "إضافة",
  admin: "الإدارة",
  announcements: "الإعلانات",
  applicant: "المتقدم",
  applicants: "المتقدمين للوظائف",
  attendance: "الحضور والإجازات",
  banks: "البنوك",
  batch: "دفعة",
  batches: "دفعات",
  bids: "العروض",
  board: "لوحة",
  bookkeeping: "مسك الدفاتر",
  boq: "جدول الكميات",
  boqreview: "مراجعة جدول الكميات",
  boqtype: "نوع جدول الكميات",
  boqtypes: "أنواع جدول الكميات",
  "bulk-expenses": "مصروفات مجمعة",
  "by-assignee": "حسب الموظف",
  "by-project": "حسب المشروع",
  "by-type": "حسب نوع المهمة",
  categories: "التصنيفات",
  "change-password": "تغيير كلمة المرور",
  clients: "العملاء",
  company: "الشركة",
  "contractor-payments": "مدفوعات المقاولين",
  contractors: "المقاولون",
  contracts: "العقود",
  counter: "العرض المضاد",
  counters: "العدادات",
  crm: "إدارة علاقات العملاء",
  dashboard: "لوحة التحكم",
  department: "قسم",
  departments: "الأقسام",
  distribute: "توزيع نسبة",
  distribution: "التوزيع",
  divisions: "الأقسام",
  edit: "تعديل",
  employee: "الموظف",
  employees: "الموظفين",
  "evaluation-settings": "إعدادات التقييم",
  "execution-management": "إدارة التنفيذ",
  expense: "المصروف",
  expenses: "المصروفات",
  fields: "الحقول",
  finance: "المالية",
  flow: "مخطط الروابط",
  gantt: "مخطط جانت",
  "hero-slides": "الصور الرئيسية",
  history: "سجل",
  hr: "الموارد البشرية",
  income: "الدخل",
  invoices: "الفواتير",
  "job-requests": "طلبات التوظيف",
  "loans-advances": "القروض والسلف",
  logs: "السجلات",
  maps: "الخرائط",
  milestones: "مرحلة",
  monthly: "الرواتب الشهرية",
  "my-work": "أعمالي",
  new: "جديد",
  operations: "العمليات",
  orders: "الطلبات",
  "password-reset": "إعادة تعيين كلمة مرور مستخدم",
  payments: "المدفوعات",
  payroll: "الرواتب",
  "pending-distribution": "مدفوعات قيد التوزيع",
  percentages: "النسب",
  performance: "أداء المهام",
  permissions: "الصلاحيات",
  products: "المنتجات",
  profile: "الملف الشخصي",
  project: "المشروع",
  "project-distributions": "توزيع المشاريع",
  "project-roles": "أدوار المشاريع",
  "project-shares": "حصص المشاريع",
  projects: "المشاريع",
  "question-bank": "بنك الأسئلة",
  reports: "تقارير",
  requests: "طلبات العمل",
  "rest-password": "إعادة تعيين كلمة المرور",
  role: "الدور",
  roles: "الأدوار",
  salaries: "الرواتب",
  "scoring-settings": "درجات المتقدمين",
  sessions: "جلسات المستخدمين",
  settings: "الإعدادات",
  shares: "حصص المشاريع",
  shops: "متاجر",
  space: "مساحة",
  specializations: "التخصصات",
  subcategories: "التصنيفات الفرعية",
  "supply-chain": "سلسلة التوريد",
  task: "مهمة",
  tasks: "المهام",
  team: "الفريق",
  teams: "فرق المشاريع",
  templates: "القوالب",
  tracking: "مدفوعات المقاولين والطلبات والعقود",
  treasury: "الخزانة",
  type: "النوع",
  types: "الأنواع",
  vendors: "الموردين",
  view: "عرض",
  website: "إدارة الموقع",
  zones: "المناطق",
  notifications: "الإشعارات",
  log: "السجل",
};

const findEntity = (path: string) =>
  BREADCRUMB_ENTITIES.findIndex((e) => e.patterns.some((pattern) => matchPath({ path: pattern, end: true }, path)));

// Turns the current pathname into header breadcrumbs, naming id segments
// after the record they point at (project name, task title, ...).
export function useBreadcrumbs(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  const pathAt = (i: number) => "/" + parts.slice(0, i + 1).join("/");

  // every id segment, with the index of the BREADCRUMB_ENTITIES rule that
  // names it (-1 when none does)
  const ids = parts.flatMap((value, i) =>
    UUID_RE.test(value) ? [{ index: i, value, entity: findEntity(pathAt(i)) }] : [],
  );

  const results = useQueries({
    queries: ids.map((s) => ({
      queryKey: ["breadcrumb-label", s.entity, s.value],
      queryFn: () => BREADCRUMB_ENTITIES[s.entity].resolve(s.value),
      enabled: s.entity >= 0,
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });

  return parts.flatMap((value, i): Crumb[] => {
    const idPos = ids.findIndex((s) => s.index === i);
    if (idPos >= 0) {
      const { entity } = ids[idPos];
      const result = results[idPos];
      return [
        {
          path: pathAt(i),
          label: result.data || `#${value.slice(0, 8)}`,
          loading: entity >= 0 && result.isLoading,
        },
      ];
    }
    if (PREFIX_ONLY.has(value) && UUID_RE.test(parts[i + 1] ?? "")) return [];
    return [{ path: pathAt(i), label: SEGMENT_NAMES[value] ?? value.replace(/-/g, " "), loading: false }];
  });
}
