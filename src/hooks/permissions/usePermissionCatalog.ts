import { useQuery } from "@tanstack/react-query";
import { permissionsDb } from "../../lib/permissionsDb";
import { TIERS } from "../../lib/queryClient";
import type { PermissionCatalogRow } from "../../types/permissions.types";

export const PERMISSION_CATALOG_KEY = ["permission-catalog"];

/**
 * The 71-row permission catalogue seeded by phase1-schema.sql.
 *
 * NOTE: this is permission_catalog, NOT the old `permissions` table.
 * The two are deliberately separate — phase1-schema.sql deviation (A)
 * explains why: two live screens read `permissions` and filter on its
 * `type` column, so seeding new rows there would have changed what
 * those screens render. Nothing in this phase touches `permissions`.
 *
 * Effectively static, so it is cached hard.
 */
export function usePermissionCatalog() {
  return useQuery<PermissionCatalogRow[]>({
    queryKey: PERMISSION_CATALOG_KEY,
    ...TIERS.A,
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("permission_catalog")
        .select("*")
        .eq("is_active", true)
        .order("area")
        .order("name");

      if (error) throw error;
      return (data ?? []) as PermissionCatalogRow[];
    },
  });
}
