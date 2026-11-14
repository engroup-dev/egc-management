import type { Tables } from "../lib/supabase";

// Row shapes for the inventory page, including their joins. item_type is
// narrowed to its check-constraint values (the generated type is plain
// string). The joined shop/contractor/project shapes are picked from the
// generated types, so a wrong column name in them is a compile error rather
// than a 400 at runtime.

export type InventoryItemType = "catalog" | "custom";

type ShopProductRef = Pick<Tables<"shop_products">, "id" | "name" | "image_path" | "description">;
type ShopSizeRef = Pick<Tables<"shop_product_sizes">, "id" | "name" | "unit" | "price"> & {
  shop_products?: ShopProductRef | null;
};
type ContractorRef = Pick<Tables<"contractors">, "id" | "first_name" | "last_name" | "phone_number">;
type ProjectRef = Pick<Tables<"projects">, "id" | "name">;

export interface ProjectInventoryItem {
  id: string;
  project_id: string;
  item_type: InventoryItemType;
  shop_product_size_id: string | null;
  custom_name: string | null;
  custom_unit: string | null;
  custom_specifications: string | null;
  planned_quantity: number;
  current_quantity: number;
  total_received_quantity: number;
  total_issued_quantity: number;
  low_stock_threshold: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  shop_product_sizes?: ShopSizeRef | null;
}

export interface ProjectMaterialIssue {
  id: string;
  project_id: string;
  inventory_item_id: string;
  contractor_id: string;
  quantity: number;
  issued_by: string | null;
  issue_date: string;
  work_zone: string | null;
  notes: string | null;
  created_at: string;
  projects?: ProjectRef | null;
  contractors?: ContractorRef | null;
  project_inventory_items?: Pick<
    ProjectInventoryItem,
    "id" | "item_type" | "custom_name" | "custom_unit" | "custom_specifications" | "shop_product_sizes"
  > | null;
}

export interface DefaultProjectMaterial {
  id: string;
  trade: string;
  name: string;
  unit: string;
  specs: string | null;
  sqm_ratio: number;
  is_active: boolean;
  created_at: string;
}

export interface ProjectInventorySummary {
  projectId: string;
  projectName: string;
  totalItems: number;
  lowStockItems: number;
  outOfStockItems: number;
}

/** Result of the inventory_apply_defaults RPC. */
export interface ApplyDefaultsResult {
  inserted: number;
  skipped: number;
}

/** Display name and unit for an item, catalog or custom. */
export function inventoryItemLabel(
  item: Pick<ProjectInventoryItem, "item_type" | "custom_name" | "custom_unit" | "shop_product_sizes"> | null | undefined,
): { name: string; unit: string } {
  if (!item) return { name: "مادة", unit: "قطعة" };
  if (item.item_type === "catalog") {
    const size = item.shop_product_sizes;
    const product = size?.shop_products?.name ?? "مادة";
    return {
      name: size?.name ? `${product} (${size.name})` : product,
      unit: size?.unit ?? "قطعة",
    };
  }
  return { name: item.custom_name ?? "مادة مخصصة", unit: item.custom_unit ?? "قطعة" };
}

/** Same rounding inventory_apply_defaults uses, for the preview. */
export function plannedQuantityFor(sqmRatio: number, squareMeters: number): number {
  const ratio = Number(sqmRatio) || 0;
  return ratio > 0 ? Math.max(1, Math.ceil(ratio * squareMeters)) : 0;
}

/** Turns a Supabase/Postgres error into something worth showing. The
 * inventory triggers and RPCs already raise in Arabic. */
export function inventoryErrorMessage(err: unknown, fallback: string): string {
  const e = err as { message?: string; code?: string } | null;
  if (!e?.message) return fallback;
  if (/[؀-ۿ]/.test(e.message)) return e.message;
  if (e.code === "42501" || /row-level security|permission denied/i.test(e.message)) {
    return "ليست لديك صلاحية لهذا الإجراء";
  }
  return fallback;
}
