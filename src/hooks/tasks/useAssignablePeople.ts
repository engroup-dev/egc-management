import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import { TIERS } from "../../lib/queryClient";

// Backs every assignee picker in the tasks module (AssigneeCell and its
// call sites). Reads public.assignable_people, a view unioning
// public.employees with public.contractors (linked-user only) — see
// permissions/phase11-assignable-people-view.sql — so contractors can be
// assigned to tasks the same way employees are, without duplicating the
// employees+contractors merge into every hook that needs the roster.
export interface AssignablePerson {
  id: string;
  first_name: string;
  last_name: string | null;
  person_type: "employee" | "contractor";
}

export function useAssignablePeople() {
  const query = useQuery({
    queryKey: ["assignable-people"],
    queryFn: async (): Promise<AssignablePerson[]> => {
      const { data, error } = await supabase
        .from("assignable_people")
        .select("id, first_name, last_name, person_type");
      if (error) throw error;
      return data ?? [];
    },
    ...TIERS.A,
  });
  return query.data ?? [];
}
