import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectOverview {
  id: string;
  name: string;
  code: string;
  address: string | null;
  status: "active" | "paused" | "completed" | "cancelled";
  description: string | null;
  created_at: string;
  default_company_percentage: number;
  default_bank_percentage: number;
  client_id: string;
  latitude: number | null;
  longitude: number | null;
  client: {
    first_name: string;
    last_name: string | null;
    email: string;
    phone_number: string;
  };
}

export interface UpdateProjectOverviewInput {
  client_id: string;
  name: string;
  address?: string | null;
  description?: string | null;
  status: ProjectOverview["status"];
  latitude?: number | null;
  longitude?: number | null;
}

// ─── Fetchers (Supabase) ──────────────────────────────────────────────────────

export const fetchProjectOverview = async (
  projectId: string,
): Promise<ProjectOverview> => {
  const { data, error } = await supabase
    .from("projects")
    .select(
      `
      id,
      name,
      code,
      address,
      status,
      description,
      created_at,
      default_company_percentage,
      default_bank_percentage,
      client_id,
      latitude,
      longitude,
      clients (
        first_name,
        last_name,
        email,
        phone_number
      )
    `,
    )
    .eq("id", projectId)
    .single();

  if (error) throw new Error(error.message);

  return {
    ...data,
    client: Array.isArray(data.clients) ? data.clients[0] : data.clients,
  } as ProjectOverview;
};

const updateProjectOverview = async (
  projectId: string,
  input: UpdateProjectOverviewInput,
): Promise<void> => {
  const { error } = await supabase
    .from("projects")
    .update({
      client_id: input.client_id,
      name: input.name,
      address: input.address ?? null,
      description: input.description ?? null,
      status: input.status,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    })
    .eq("id", projectId);

  if (error) throw new Error(error.message);
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export const useProjectOverview = (projectId: string) =>
  useQuery({
    queryKey: ["project", projectId, "overview"],
    queryFn: () => fetchProjectOverview(projectId),
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5,
  });

export const useUpdateProjectOverview = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectOverviewInput) =>
      updateProjectOverview(projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project", projectId, "overview"],
      });
    },
  });
};
