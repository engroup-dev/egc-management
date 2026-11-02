import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import {
  NewProjectFormValues,
  PROJECT_STATUS_OPTIONS,
} from "../../types/schema/website/newProject.schema";
import { yearToDate } from "../../utils/date";

export interface Project {
  id: string;
  title_ar: string;
  title_en: string;
  slug: string;
  client_ar: string | null;
  client_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  location_ar: string | null;
  location_en: string | null;
  status_ar: string | null;
  status_en: string | null;
  year: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  category_id: string;
  created_at: string;
  updated_at: string;
  categories: { name_ar: string; name_en: string } | null;
}

const BUCKET = "site-media";
const PROJECTS_QUERY_KEY = ["website", "projects"];

const fetchProjects = async (): Promise<Project[]> => {
  const { data, error } = await supabase
    .schema("website")
    .from("projects")
    .select("*, categories(name_ar, name_en)")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Project[];
};

const fetchProject = async (id: string): Promise<Project> => {
  const { data, error } = await supabase
    .schema("website")
    .from("projects")
    .select("*, categories(name_ar, name_en)")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as Project;
};

const createProject = async (
  values: NewProjectFormValues,
): Promise<Project> => {
  const { data: lastProject, error: fetchError } = await supabase
    .schema("website")
    .from("projects")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);

  const nextSortOrder = lastProject ? lastProject.sort_order + 1 : 0;

  const { status, year, ...rest } = values;
  const statusOption = PROJECT_STATUS_OPTIONS.find((o) => o.value === status);

  const { data, error } = await supabase
    .schema("website")
    .from("projects")
    .insert({
      ...rest,
      year: yearToDate(year),
      status_ar: statusOption?.ar ?? null,
      status_en: statusOption?.en ?? null,
      sort_order: nextSortOrder,
    })
    .select("*, categories(name_ar, name_en)")
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as Project;
};

const updateProject = async ({
  id,
  values,
}: {
  id: string;
  values: NewProjectFormValues;
}): Promise<Project> => {
  const { status, year, ...rest } = values;
  const statusOption = PROJECT_STATUS_OPTIONS.find((o) => o.value === status);

  const { data, error } = await supabase
    .schema("website")
    .from("projects")
    .update({
      ...rest,
      year: yearToDate(year),
      status_ar: statusOption?.ar ?? null,
      status_en: statusOption?.en ?? null,
    })
    .eq("id", id)
    .select("*, categories(name_ar, name_en)")
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as Project;
};

const deleteProject = async (project: Project): Promise<void> => {
  const { data: images, error: imagesFetchError } = await supabase
    .schema("website")
    .from("project_images")
    .select("storage_path")
    .eq("project_id", project.id);

  if (imagesFetchError) throw new Error(imagesFetchError.message);

  const paths = (images ?? []).map((image) => image.storage_path);
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove(paths);
    if (removeError) throw new Error(removeError.message);
  }

  const { error: imagesDeleteError } = await supabase
    .schema("website")
    .from("project_images")
    .delete()
    .eq("project_id", project.id);

  if (imagesDeleteError) throw new Error(imagesDeleteError.message);

  const { error } = await supabase
    .schema("website")
    .from("projects")
    .delete()
    .eq("id", project.id);

  if (error) throw new Error(error.message);
};

/** Recomputes sort_order to match each project's position in the array. */
export const withSortOrder = (projects: Project[]): Project[] =>
  projects.map((project, index) => ({ ...project, sort_order: index }));

const reorderProjects = async (projects: Project[]): Promise<void> => {
  const { error } = await supabase
    .schema("website")
    .from("projects")
    .upsert(
      projects.map((project) => ({
        id: project.id,
        category_id: project.category_id,
        slug: project.slug,
        title_ar: project.title_ar,
        title_en: project.title_en,
        sort_order: project.sort_order,
      })),
      { onConflict: "id" },
    );

  if (error) throw new Error(error.message);
};

// Exported for the background prefetcher (src/lib/prefetch).
export const websiteProjectsQueryOptions = () =>
  queryOptions({ queryKey: PROJECTS_QUERY_KEY, queryFn: fetchProjects });

export const useProjectsQuery = () => useQuery(websiteProjectsQueryOptions());

export const useProjectQuery = (id: string) =>
  useQuery({
    queryKey: [...PROJECTS_QUERY_KEY, id],
    queryFn: () => fetchProject(id),
    enabled: !!id,
  });

export const useCreateProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
};

export const useUpdateProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
};

export const useDeleteProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
};

export const useReorderProjects = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reorderProjects,
    onMutate: async (nextProjects) => {
      await queryClient.cancelQueries({ queryKey: PROJECTS_QUERY_KEY });
      const previous = queryClient.getQueryData<Project[]>(
        PROJECTS_QUERY_KEY,
      );
      queryClient.setQueryData(PROJECTS_QUERY_KEY, nextProjects);
      return { previous };
    },
    onError: (_err, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PROJECTS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
};
