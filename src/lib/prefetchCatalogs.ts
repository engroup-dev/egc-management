import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "./supabaseClient";
import { permissionsDb } from "./permissionsDb";
import { TIERS } from "./queryClient";
import { PERMISSION_CATALOG_KEY } from "../hooks/permissions/usePermissionCatalog";
import { drawingKeys } from "../hooks/operations/drawings/useProjectDrawings";

// Pre-warms the tier-A catalogs every logged-in session hits early.
// Each query is small (kilobytes), cached for an hour, and read by many
// screens, so starting them in parallel at app boot turns the first
// screen render that needs any of them into a cache hit.
//
// queryFns are duplicated with their hook definitions on purpose: a
// pre-warm needs to work without mounting a component tree, and the
// cost of keeping two copies in sync is one grep when any of these
// change. Keys import from the hooks so a key rename at least fails to
// compile here.
export async function prefetchAppCatalogs(qc: QueryClient): Promise<void> {
  await Promise.allSettled([
    qc.prefetchQuery({
      queryKey: PERMISSION_CATALOG_KEY,
      queryFn: async () => {
        const { data, error } = await permissionsDb
          .from("permission_catalog")
          .select("*")
          .eq("is_active", true)
          .order("area")
          .order("name");
        if (error) throw error;
        return data ?? [];
      },
      staleTime: TIERS.A.staleTime,
    }),
    qc.prefetchQuery({
      queryKey: drawingKeys.mapTypes,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("map_types")
          .select("*")
          .order("name");
        if (error) throw error;
        return data ?? [];
      },
      staleTime: TIERS.A.staleTime,
    }),
    qc.prefetchQuery({
      queryKey: ["assignable-people"],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("assignable_people")
          .select("id, first_name, last_name, person_type");
        if (error) throw error;
        return data ?? [];
      },
      staleTime: TIERS.A.staleTime,
    }),
    qc.prefetchQuery({
      queryKey: ["task-type-options"],
      queryFn: async () => {
        const { data, error } = await supabase
          .schema("tasks")
          .from("task_types")
          .select("id, name, name_ar, color")
          .order("name_ar");
        if (error) throw error;
        return data ?? [];
      },
      staleTime: TIERS.A.staleTime,
    }),
  ]);
}
