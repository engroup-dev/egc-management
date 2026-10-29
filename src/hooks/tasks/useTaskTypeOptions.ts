import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import type { TaskTypeLite } from "./useTaskBoard";

// Every task type, for the pickers outside a board (the create dialog, the
// task panel). The board loads its own copy with its data.
export function useTaskTypeOptions(enabled = true) {
  const query = useQuery({
    queryKey: ["task-type-options"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TaskTypeLite[]> => {
      const { data, error } = await supabase.schema("tasks").from("task_types").select("id, name, name_ar, color").order("name_ar");
      if (error) throw error;
      return data ?? [];
    },
  });
  return query.data ?? [];
}
