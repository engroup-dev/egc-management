import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import type {
  DefaultProjectMaterial,
  ProjectInventoryItem,
  ProjectInventorySummary,
  ProjectMaterialIssue,
} from "../../types/inventory";

export const INVENTORY_KEYS = {
  allSummaries: ["inventory", "summaries"] as const,
  projectItems: (projectId: string) => ["inventory", "project", projectId] as const,
  issues: (projectId?: string) => ["inventory", "issues", projectId ?? "all"] as const,
  defaultMaterials: ["inventory", "defaults"] as const,
};

/** Fetches inventory metrics aggregated across all active projects */
export function useProjectsInventorySummary() {
  return useQuery({
    queryKey: INVENTORY_KEYS.allSummaries,
    queryFn: async (): Promise<ProjectInventorySummary[]> => {
      // Fetch projects
      const { data: projects, error: pError } = await supabase
        .from("projects" as any)
        .select("id, name")
        .order("name");

      if (pError) throw pError;

      // Fetch all inventory items
      const { data: items, error: iError } = await supabase
        .from("project_inventory_items" as any)
        .select("id, project_id, current_quantity, low_stock_threshold, total_received_quantity, total_issued_quantity");

      if (iError) {
        // Table may be empty or not yet seeded
        return (projects as any[]).map((p) => ({
          projectId: p.id,
          projectName: p.name,
          totalItems: 0,
          lowStockItems: 0,
          totalReceived: 0,
          totalIssued: 0,
        }));
      }

      const itemsList = (items as any[]) || [];

      return (projects as any[]).map((p) => {
        const projectItems = itemsList.filter((item) => item.project_id === p.id);
        const lowStock = projectItems.filter(
          (item) => Number(item.current_quantity) <= Number(item.low_stock_threshold),
        );
        const totalReceived = projectItems.reduce(
          (sum, item) => sum + Number(item.total_received_quantity || 0),
          0,
        );
        const totalIssued = projectItems.reduce(
          (sum, item) => sum + Number(item.total_issued_quantity || 0),
          0,
        );

        return {
          projectId: p.id,
          projectName: p.name,
          totalItems: projectItems.length,
          lowStockItems: lowStock.length,
          totalReceived,
          totalIssued,
        };
      });
    },
  });
}

/** Fetches items for a specific project */
export function useProjectInventoryItems(projectId: string | undefined) {
  return useQuery({
    queryKey: INVENTORY_KEYS.projectItems(projectId ?? ""),
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectInventoryItem[]> => {
      if (!projectId) return [];

      const { data, error } = await supabase
        .from("project_inventory_items" as any)
        .select(`
          id,
          project_id,
          item_type,
          shop_product_size_id,
          custom_name,
          custom_unit,
          custom_specifications,
          current_quantity,
          total_received_quantity,
          total_issued_quantity,
          low_stock_threshold,
          notes,
          created_at,
          updated_at,
          shop_product_sizes (
            id,
            size,
            unit,
            price,
            shop_products (
              id,
              name,
              image_path,
              specifications
            )
          )
        `)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as any) || [];
    },
  });
}

/** Fetches contractor consumption history across projects or for one project */
export function useProjectMaterialIssues(projectId?: string) {
  return useQuery({
    queryKey: INVENTORY_KEYS.issues(projectId),
    queryFn: async (): Promise<ProjectMaterialIssue[]> => {
      let builder = supabase
        .from("project_material_issues" as any)
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
          projects (
            id,
            name
          ),
          contractors (
            id,
            first_name,
            last_name,
            phone_number
          ),
          project_inventory_items (
            id,
            item_type,
            custom_name,
            custom_unit,
            custom_specifications,
            shop_product_sizes (
              id,
              size,
              unit,
              shop_products (
                id,
                name
              )
            )
          )
        `);

      if (projectId) {
        builder = builder.eq("project_id", projectId);
      }

      const { data, error } = await builder.order("issue_date", { ascending: false });
      if (error) throw error;
      return (data as any) || [];
    },
  });
}

/** Fetches template electrical materials */
export function useDefaultProjectMaterials() {
  return useQuery({
    queryKey: INVENTORY_KEYS.defaultMaterials,
    queryFn: async (): Promise<DefaultProjectMaterial[]> => {
      const { data, error } = await supabase
        .from("default_project_materials" as any)
        .select("*")
        .order("trade")
        .order("name");

      if (error) throw error;
      return (data as any) || [];
    },
  });
}

/** Applies electrical template materials to a project using sqm ratio */
export function useApplyDefaultMaterialsToProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      squareMeters,
    }: {
      projectId: string;
      squareMeters: number;
    }) => {
      // 1. Fetch default materials
      const { data: defaults, error: dError } = await supabase
        .from("default_project_materials" as any)
        .select("*")
        .eq("is_active", true);

      if (dError) throw dError;
      if (!defaults || defaults.length === 0) {
        throw new Error("لا توجد مواد افتراضية مسجلة بالنظام");
      }

      // 2. Prepare items to insert
      const insertRows = (defaults as any[]).map((d) => {
        const calculatedQty = Math.max(1, Math.round(Number(d.sqm_ratio || 0) * squareMeters));
        return {
          project_id: projectId,
          item_type: "custom",
          custom_name: d.name,
          custom_unit: d.unit,
          custom_specifications: d.specs,
          current_quantity: calculatedQty,
          total_received_quantity: calculatedQty,
          total_issued_quantity: 0,
          low_stock_threshold: Math.max(1, Math.round(calculatedQty * 0.15)),
          notes: `تم الإدراج تلقائياً بناءً على مساحة تقديرية ${squareMeters} م² بنسبة (${d.sqm_ratio})`,
        };
      });

      const { data, error } = await supabase
        .from("project_inventory_items" as any)
        .insert(insertRows)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: INVENTORY_KEYS.allSummaries });
      queryClient.invalidateQueries({
        queryKey: INVENTORY_KEYS.projectItems(variables.projectId),
      });
    },
  });
}
