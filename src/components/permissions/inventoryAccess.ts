// Inventory access for one person on one project, as three levels.
//
// The two permissions are not independent: manage_inventory implies
// view everywhere it is checked (RLS inventory_can_view, the mobile
// layout guard, the desktop page). So every level is written as BOTH
// rows — "no access" has to deny manage too, or a manager still gets in.
//
// Pure functions only, no React or Supabase, so they're unit-tested in
// inventoryAccess.test.ts.

export type InventoryLevel = "none" | "view" | "manage";

export const INVENTORY_PERMISSION_NAMES = {
  view: "view_inventory",
  manage: "manage_inventory",
} as const;

/** Display order of the segmented control. */
export const INVENTORY_LEVELS: InventoryLevel[] = ["none", "view", "manage"];

export const INVENTORY_LEVEL_LABELS: Record<InventoryLevel, string> = {
  none: "بدون وصول",
  view: "عرض فقط",
  manage: "إدارة",
};

export interface InventoryPermIds {
  view: string;
  manage: string;
}

type InventoryKey = keyof InventoryPermIds;
const KEYS: InventoryKey[] = ["view", "manage"];

/** Catalog ids for both permissions, or null if either is missing (an older database). */
export function inventoryPermIds(permMap: Map<string, string>): InventoryPermIds | null {
  const view = permMap.get(INVENTORY_PERMISSION_NAMES.view);
  const manage = permMap.get(INVENTORY_PERMISSION_NAMES.manage);
  return view && manage ? { view, manage } : null;
}

/** The level a person has, from the resolver's two answers. */
export function levelFromEffective(view: boolean, manage: boolean): InventoryLevel {
  if (manage) return "manage";
  return view ? "view" : "none";
}

/** The two rows to write for a level. */
export function grantsForLevel(level: InventoryLevel): { view: boolean; manage: boolean } {
  return { view: level !== "none", manage: level === "manage" };
}

/**
 * Whether this person has a per-project inventory setting on this
 * project, i.e. anything other than "follows the role". grantMap is
 * keyed `${projectId}:${permissionId}`, like the tab's teamGrantMap.
 */
export function isInventoryCustomized(
  grantMap: Map<string, boolean>,
  projectId: string,
  ids: InventoryPermIds,
): boolean {
  return KEYS.some((k) => grantMap.has(`${projectId}:${ids[k]}`));
}

/**
 * Copying to another project reproduces the source's rows exactly: rows
 * the source has are upserted, rows it lacks are removed from the target,
 * so a source that follows the role copies as "follows the role".
 */
export function planInventoryCopy(source: { view?: boolean; manage?: boolean }): {
  upsert: { key: InventoryKey; allowed: boolean }[];
  remove: InventoryKey[];
} {
  const upsert: { key: InventoryKey; allowed: boolean }[] = [];
  const remove: InventoryKey[] = [];
  for (const key of KEYS) {
    const allowed = source[key];
    if (allowed === undefined) remove.push(key);
    else upsert.push({ key, allowed });
  }
  return { upsert, remove };
}
