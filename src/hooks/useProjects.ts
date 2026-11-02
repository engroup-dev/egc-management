import { useCallback, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { Database } from "../lib/supabase";
import { Projects } from "../types/global.type";
import { ProjectFormValues } from "../types/schema/projects.schema";
import { FullProject } from "../types/extended.type";

const PROJECTS_LIST_KEY = ["projects-list"] as const;
const projectDetailKey = (id: string) => ["projects-detail", id] as const;

export async function fetchProjectsList(): Promise<FullProject[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*, project_balances(*), project_percentage(*), accounts(*)")
    .order("serial_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FullProject[];
}

// Exported for the background prefetcher (src/lib/prefetch).
export const projectsListQueryOptions = () =>
  queryOptions({ queryKey: PROJECTS_LIST_KEY, queryFn: fetchProjectsList });

export function useProjects() {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<Error | null>(null);
  const [mutating, setMutating] = useState(false);

  const {
    data: projects = [],
    isPending: fetchLoading,
    error: fetchError,
    refetch,
  } = useQuery(projectsListQueryOptions());

  const loading = fetchLoading || mutating;
  const error = mutationError ?? (fetchError as Error | null) ?? null;

  const addProject = async (newProject: ProjectFormValues) => {
    setMutating(true);
    setMutationError(null);
    try {
      const { data: companyData, error: companyError } = await supabase
        .from("company")
        .select("*")
        .single();

      if (companyError) {
        setMutationError(companyError);
        return null;
      }

      const CODE = Math.random().toString(36).substring(2, 8).toUpperCase();
      const payload: Database["public"]["Tables"]["projects"]["Insert"] = {
        name: newProject.name,
        description: (newProject.description ?? null) as string | null,
        client_id: newProject.client_id,
        address: (newProject.address ?? null) as string | null,
        status: "active",
        serial_number: companyData?.projects_counter ?? null,
        code: CODE,
        created_at: new Date().toISOString(),
        start_date: newProject.start_date?.toISOString() ?? null,
        latitude: newProject.latitude ?? null,
        longitude: newProject.longitude ?? null,
      };

      const { data, error } = await supabase
        .from("projects")
        .insert(payload)
        .select()
        .single();

      if (error) {
        setMutationError(error);
        return null;
      }

      const balancesToInsert: Database["public"]["Tables"]["project_balances"]["Insert"][] =
        (["USD", "EUR", "LYD"] as const).map((currency) => ({
          project_id: data.id,
          balance: 0,
          currency,
        }));

      const { error: projectBalancesError } = await supabase
        .from("project_balances")
        .insert(balancesToInsert);
      if (projectBalancesError) setMutationError(projectBalancesError);

      const accountsToInsertAll: Database["public"]["Tables"]["accounts"]["Insert"][] =
        (["USD", "EUR", "LYD"] as const).map((currency) => ({
          currency,
          owner_id: data.id,
          owner_type: "project",
          type: "cash",
          balance: 0,
        }));

      accountsToInsertAll.push({
        currency: "LYD",
        owner_id: data.id,
        owner_type: "project",
        type: "bank",
        balance: 0,
      });

      const { error: accountsError } = await supabase
        .from("accounts")
        .insert(accountsToInsertAll);
      if (accountsError) setMutationError(accountsError);

      const percentageData: Database["public"]["Tables"]["project_percentage"]["Insert"][] =
        (["USD", "EUR", "LYD"] as const).map((currency) => ({
          period_start: new Date().toISOString(),
          project_id: data.id,
          percentage: newProject.percentage ?? 0,
          currency: currency,
          period_percentage: 0,
          total_percentage: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          type: "cash",
        }));

      percentageData.push({
        period_start: new Date().toISOString(),
        project_id: data.id,
        percentage: newProject.percentage ?? 0,
        currency: "LYD",
        period_percentage: 0,
        total_percentage: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        type: "bank",
      });

      const { error: percentageError } = await supabase
        .from("project_percentage")
        .insert(percentageData);
      if (percentageError) setMutationError(percentageError);

      const { error: counterError } = await supabase
        .from("company")
        .update({
          projects_counter: (companyData?.projects_counter || 0) + 1,
        })
        .eq("id", companyData?.id);
      if (counterError) setMutationError(counterError);

      await queryClient.invalidateQueries({ queryKey: PROJECTS_LIST_KEY });
      return data;
    } finally {
      setMutating(false);
    }
  };

  const refresh = useCallback(async () => {
    const result = await refetch();
    return result.data ?? null;
  }, [refetch]);

  return { projects, loading, error, addProject, refresh };
}

export function useProject(id: string) {
  const {
    data: project = null,
    isPending: loading,
    error,
  } = useQuery({
    queryKey: projectDetailKey(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Projects;
    },
    enabled: !!id,
  });

  return { project, loading, error: (error as Error | null) ?? null };
}
