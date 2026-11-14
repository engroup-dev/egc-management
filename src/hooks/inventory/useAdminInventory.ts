import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import type {
  ApplyDefaultsResult,
  DefaultProjectMaterial,
  ProjectInventoryItem,
  ProjectInventorySummary,
  ProjectMaterialIssue,
} from "../../types/inventory";

export const INVENTORY_KEYS = {
  all: ["inventory"] as const,
  allSummaries: ["inventory", "summaries"] as const,
  projectItems: (projectId: string) => ["inventory", "project", projectId] as const,
  issues: (projectId?: string) => ["inventory", "issues", projectId ?? "all"] as const,
  defaultMaterials: ["inventory", "defaults"] as const,
};

const ITEM_COLUMNS = `
  id,
  project_id,
  item_type,
  shop_product_size_id,
  custom_name,
  custom_unit,
  custom_specifications,
  planned_quantity,
  current_quantity,
  total_received_quantity,
  total_issued_quantity,
  low_stock_threshold,
  notes,
  created_at,
  updated_at,
  shop_product_sizes (
    id,
    name,
    unit,
    price,
    shop_products (
      id,
      name,
      image_path,
      description
    )
  )
`;

/**
 * Per-project inventory counts for the picker and the KPI row. RLS only
 * returns items from projects the user may view, so a project they can't
 * see simply shows zero items.
 */
export function useProjectsInventorySummary() {
  return useQuery({
    queryKey: INVENTORY_KEYS.allSummaries,
    queryFn: async (): Promise<ProjectInventorySummary[]> => {
      const [projectsRes, itemsRes] = await Promise.all([
        supabase.from("projects").select("id, name").order("name"),
        supabase
          .from("project_inventory_items")
          .select("project_id, current_quantity, low_stock_threshold"),
      ]);

      if (projectsRes.error) throw projectsRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const byProject = new Map<string, { total: number; low: number; out: number }>();
      for (const item of itemsRes.data ?? []) {
        const s = byProject.get(item.project_id) ?? { total: 0, low: 0, out: 0 };
        const current = Number(item.current_quantity);
        s.total += 1;
        if (current <= Number(item.low_stock_threshold)) s.low += 1;
        if (current <= 0) s.out += 1;
        byProject.set(item.project_id, s);
      }

      return (projectsRes.data ?? []).map((p) => {
        const s = byProject.get(p.id);
        return {
          projectId: p.id,
          projectName: p.name,
          totalItems: s?.total ?? 0,
          lowStockItems: s?.low ?? 0,
          outOfStockItems: s?.out ?? 0,
        };
      });
    },
  });
}

/** Items for one project. */
export function useProjectInventoryItems(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: INVENTORY_KEYS.projectItems(projectId ?? ""),
    enabled: !!projectId && enabled,
    queryFn: async (): Promise<ProjectInventoryItem[]> => {
      const { data, error } = await supabase
        .from("project_inventory_items")
        .select(ITEM_COLUMNS)
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as ProjectInventoryItem[];
    },
  });
}

/** Issues to contractors, for one project. */
export function useProjectMaterialIssues(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: INVENTORY_KEYS.issues(projectId),
    enabled: !!projectId && enabled,
    queryFn: async (): Promise<ProjectMaterialIssue[]> => {
      const { data, error } = await supabase
        .from("project_material_issues")
        .select(`
          id,
          project_id,
          inventory_item_id,
          contractor_id,
          quantity,
          issued_by,
          issue_date,
          work_zone,
          notes,
          created_at,
          projects ( id, name ),
          contractors ( id, first_name, last_name, phone_number ),
          project_inventory_items (
            id,
            item_type,
            custom_name,
            custom_unit,
            custom_specifications,
            shop_product_sizes (
              id,
              name,
              unit,
              price,
              shop_products ( id, name, image_path, description )
            )
          )
        `)
        .eq("project_id", projectId!)
        .order("issue_date", { ascending: false });

      if (error) throw error;
      return (data ?? []) as ProjectMaterialIssue[];
    },
  });
}

/** The per-m² template. */
export function useDefaultProjectMaterials() {
  return useQuery({
    queryKey: INVENTORY_KEYS.defaultMaterials,
    queryFn: async (): Promise<DefaultProjectMaterial[]> => {
      const { data, error } = await supabase
        .from("default_project_materials")
        .select("*")
        .eq("is_active", true)
        .order("trade")
        .order("name");

      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Fills in PLANNED quantities from the template (stock stays at 0 until
 * materials are received). Materials the project already has are skipped
 * by the server, so this is safe to run twice.
 */
export function useApplyDefaultMaterialsToProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      squareMeters,
    }: {
      projectId: string;
      squareMeters: number;
    }): Promise<ApplyDefaultsResult> => {
      const { data, error } = await supabase.rpc("inventory_apply_defaults", {
        p_project_id: projectId,
        p_sqm: squareMeters,
      });
      if (error) throw error;
      return data as ApplyDefaultsResult;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: INVENTORY_KEYS.allSummaries });
      queryClient.invalidateQueries({
        queryKey: INVENTORY_KEYS.projectItems(variables.projectId),
      });
    },
  });
}
