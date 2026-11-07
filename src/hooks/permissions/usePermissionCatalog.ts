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
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await permissionsDb
        .from("permission_catalog")
        .select("*")
        .eq("is_active", true)
        .order("area")
        .order("name");

      if (error) throw error;
      const rows = (data ?? []) as PermissionCatalogRow[];
      if (!rows.some((r) => r.name === "view_analytics_section")) {
        rows.push({
          id: "view_analytics_section",
          name: "view_analytics_section",
          area: "Admin",
          description: "دخول واستعراض قسم التحليلات ومؤشرات الأداء",
          is_project_scoped: false,
          parent_permission_id: null,
          is_active: true,
        });
      }
      return rows;
    },
  });
}
