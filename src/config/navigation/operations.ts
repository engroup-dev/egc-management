import { Boxes, FileSignature, PackageOpen, Paperclip, Settings } from "lucide-react";
import type { NavItem } from "./types";

// One permission per destination (issue 19 gap 4 pattern), each with
// view_operations_section as its parent_permission_id in the catalogue.
// Replaces the single shared view_operations, now retired
// (is_active = false) rather than deleted, so past grants stay in history.
//
// maps/contracts/boq are project-scoped (view_operations_*, checked once a
// project is picked — see MapsRoutes.tsx and friends), and these three
// cards lead to a project PICKER, not a project. A project-scoped
// permission always denies when asked with no project in context
// (useMenuPermissions's own doc comment says so explicitly), so putting
// the project-scoped name here would hide all three cards from everyone.
// They're public within Operations instead; view_operations_section (the
// outer App.tsx guard) already covers whether you reach this page at all.
// view_operations_settings stays company-wide, so it keeps its gate here.
export const OPERATIONS_ITEMS: NavItem[] = [
  {
    label: "الخرائط",
    icon: PackageOpen,
    path: "/operations/maps",
    description: "عرض وإدارة الخرائط",
  },
  {
    label: "حصر الكميات",
    icon: Paperclip,
    path: "/operations/boq",
    description: "إدارة حصر الكميات",
  },
  {
    // Same as maps/boq: leads to a project picker, so no project-scoped
    // permission here — view_project_agreements guards the project page.
    label: "الاتفاقيات",
    icon: FileSignature,
    path: "/operations/agreements",
    description: "اتفاقيات المقاولين ودفعاتها والغرامات",
  },
  {
    // Same as maps/boq: a project picker. view_inventory / manage_inventory
    // are project-scoped and checked on the page once a project is picked
    // (and enforced by RLS on the inventory tables).
    label: "المخزون والمواد",
    icon: Boxes,
    path: "/operations/inventory",
    description: "إدارة ومتابعة مخزون المشاريع وصرف المواد للمقاولين",
  },
  {
    label: "الإعدادات",
    icon: Settings,
    path: "/operations/settings",
    description: "إعدادات وحدة التشغيل",
    permission: "view_operations_settings",
  },
];
