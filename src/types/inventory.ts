export type InventoryItemType = "catalog" | "custom";

export interface ProjectInventoryItem {
  id: string;
  project_id: string;
  item_type: InventoryItemType;
  shop_product_size_id: string | null;
  custom_name: string | null;
  custom_unit: string | null;
  custom_specifications: string | null;
  current_quantity: number;
  total_received_quantity: number;
  total_issued_quantity: number;
  low_stock_threshold: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined relation
  shop_product_sizes?: {
    id: string;
    size: string;
    unit: string;
    price: number;
    shop_products?: {
      id: string;
      name: string;
      image_path: string | null;
      specifications: string | null;
    } | null;
  } | null;
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
  contractors?: {
    id: string;
    first_name: string;
    last_name: string | null;
    phone_number: string | null;
  } | null;
  projects?: {
    id: string;
    name: string;
  } | null;
  project_inventory_items?: ProjectInventoryItem | null;
}

export interface ProjectMaterialReceipt {
  id: string;
  project_id: string;
  inventory_item_id: string;
  vendor_id: string | null;
  vendor_order_id: string | null;
  quantity: number;
  unit_price: number | null;
  received_by: string | null;
  receipt_date: string;
  delivery_note_ref: string | null;
  notes: string | null;
  created_at: string;
  vendors?: {
    id: string;
    vendor_name: string;
    phone: string | null;
  } | null;
  projects?: {
    id: string;
    name: string;
  } | null;
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
  totalReceived: number;
  totalIssued: number;
}
