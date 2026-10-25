import { supabase } from "../../lib/supabaseClient";

// Maps a URL that ends in a record id to the name the header breadcrumb
// shows for it. `patterns` are full pathnames (react-router syntax) whose
// LAST param is the id being named — matched against the path up to and
// including that id segment, so `/projects/:id` names the project on
// `/projects/<id>/counters` too. First matching entry wins.
export interface BreadcrumbEntity {
  patterns: string[];
  resolve: (id: string) => Promise<string | null>;
}

type Result<T> = { data: T | null; error: unknown };

const fetchRow = async <T>(query: PromiseLike<Result<T>>): Promise<T | null> => {
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

const fullName = (row: { first_name: string | null; last_name: string | null } | null) =>
  row ? [row.first_name, row.last_name].filter(Boolean).join(" ") || null : null;

const contractorName = async (contractorId: string | null) =>
  contractorId
    ? fullName(
        await fetchRow(
          supabase.from("contractors").select("first_name, last_name").eq("id", contractorId).maybeSingle(),
        ),
      )
    : null;

const withPrefix = (prefix: string, name: string | null) => (name ? `${prefix} - ${name}` : prefix);

export const BREADCRUMB_ENTITIES: BreadcrumbEntity[] = [
  // ---- tasks (checked before the generic project rules below) ----
  {
    patterns: [
      "/tasks/task/:id",
      "/tasks/:view/task/:id",
      "/tasks/board/:boardId/task/:id",
      "/tasks/board/:boardId/gantt/task/:id",
      "/tasks/board/:boardId/flow/task/:id",
      "/tasks/board/:boardId/types/task/:id",
      "/tasks/department/:departmentId/task/:id",
      "/tasks/space/:spaceId/task/:id",
    ],
    resolve: async (id) =>
      (await fetchRow(supabase.schema("tasks").from("tasks").select("title").eq("id", id).maybeSingle()))?.title ??
      null,
  },
  {
    patterns: ["/tasks/board/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.schema("tasks").from("boards").select("name").eq("id", id).maybeSingle()))?.name ??
      null,
  },
  {
    patterns: ["/tasks/space/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.schema("tasks").from("spaces").select("name").eq("id", id).maybeSingle()))?.name ??
      null,
  },
  {
    patterns: ["/tasks/department/:id", "/settings/permissions/departments/:id"],
    resolve: async (id) => {
      const row = await fetchRow(supabase.from("departments").select("name, name_ar").eq("id", id).maybeSingle());
      return row ? row.name_ar ?? row.name : null;
    },
  },

  // ---- operations: boq ----
  {
    patterns: ["/operations/boq/project/:projectId/types/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.schema("boq").from("types").select("name").eq("id", id).maybeSingle()))?.name ?? null,
  },
  {
    patterns: ["/operations/settings/boq/templates/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.schema("boq").from("template_types").select("name").eq("id", id).maybeSingle()))
        ?.name ?? null,
  },

  // ---- shops ----
  {
    patterns: ["/shops/orders/project/:projectId/:id"],
    resolve: async (id) => {
      const order = await fetchRow(
        supabase.from("shop_orders").select("vendor:vendors(vendor_name)").eq("id", id).maybeSingle(),
      );
      return order ? withPrefix("طلب", order.vendor?.vendor_name ?? null) : null;
    },
  },
  {
    patterns: ["/shops/divisions/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.from("shop_divisions").select("name").eq("id", id).maybeSingle()))?.name ?? null,
  },
  {
    patterns: ["/shops/categories/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.from("shop_categories").select("name").eq("id", id).maybeSingle()))?.name ?? null,
  },
  {
    patterns: ["/shops/subcategories/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.from("shop_subcategories").select("name").eq("id", id).maybeSingle()))?.name ?? null,
  },
  {
    patterns: ["/shops/products/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.from("shop_products").select("name").eq("id", id).maybeSingle()))?.name ?? null,
  },
  {
    patterns: ["/shops/vendors/:id", "/supply-chain/vendors/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.from("vendors").select("vendor_name").eq("id", id).maybeSingle()))?.vendor_name ??
      null,
  },

  // ---- finance expenses ----
  {
    patterns: ["/finance/bookkeeping/project/:projectId/expense/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.from("project_expenses").select("description").eq("id", id).maybeSingle()))
        ?.description ?? null,
  },
  {
    patterns: ["/finance/company/expense/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.from("company_expense").select("description").eq("id", id).maybeSingle()))
        ?.description ?? null,
  },

  // ---- project drawings: the folder is named after its map type ----
  {
    patterns: ["/operations/maps/project/:projectId/folder/:id"],
    resolve: async (id) => {
      const { data: folder, error } = await supabase
        .schema("drawings")
        .from("folders")
        .select("map_type_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!folder) return null;
      const { data: mapType, error: typeError } = await supabase
        .from("map_types")
        .select("name")
        .eq("id", folder.map_type_id)
        .maybeSingle();
      if (typeError) throw typeError;
      return mapType?.name ?? null;
    },
  },

  // ---- projects ----
  {
    patterns: [
      "/projects/:id",
      "/execution-management/projects/:id",
      "/finance/treasury/project/:id",
      "/finance/bookkeeping/project/:id",
      "/company/distribute/project/:id",
      "/company/shares/:id",
      "/shops/orders/project/:id",
      "/operations/:section/project/:id",
    ],
    resolve: async (id) =>
      (await fetchRow(supabase.from("projects").select("name").eq("id", id).maybeSingle()))?.name ?? null,
  },
  {
    patterns: ["/settings/website/projects/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.schema("website").from("projects").select("title_ar").eq("id", id).maybeSingle()))
        ?.title_ar ?? null,
  },

  // ---- people ----
  {
    patterns: ["/hr/employees/:id", "/company/salaries/:id", "/company/distribute/employee/:id"],
    resolve: async (id) =>
      fullName(await fetchRow(supabase.from("employees").select("first_name, last_name").eq("id", id).maybeSingle())),
  },
  {
    patterns: ["/hr/applicants/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.schema("hr").from("applicants").select("full_name").eq("id", id).maybeSingle()))
        ?.full_name ?? null,
  },
  {
    patterns: ["/hr/job-requests/:id"],
    resolve: async (id) =>
      (
        await fetchRow(
          supabase.schema("hr").from("job_requests").select("position_title").eq("id", id).maybeSingle(),
        )
      )?.position_title ?? null,
  },
  {
    patterns: ["/crm/clients/:id"],
    resolve: async (id) =>
      fullName(await fetchRow(supabase.from("clients").select("first_name, last_name").eq("id", id).maybeSingle())),
  },
  {
    patterns: ["/supply-chain/contractors/:id"],
    resolve: contractorName,
  },

  // ---- settings ----
  {
    patterns: ["/settings/roles/:id", "/settings/permissions/roles/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.from("roles").select("name").eq("id", id).maybeSingle()))?.name ?? null,
  },
  {
    patterns: ["/settings/project-roles/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.from("project_roles").select("name").eq("id", id).maybeSingle()))?.name ?? null,
  },
  {
    patterns: ["/settings/expenses/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.from("expenses").select("name").eq("id", id).maybeSingle()))?.name ?? null,
  },
  {
    patterns: ["/settings/specializations/:id"],
    resolve: async (id) =>
      (await fetchRow(supabase.from("specialities").select("name").eq("id", id).maybeSingle()))?.name ?? null,
  },
];
