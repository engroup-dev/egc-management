import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import { CategoryFormValues } from "../../types/schema/website/category.schema";

export interface Category {
  id: string;
  name_ar: string;
  name_en: string;
  is_active: boolean;
  created_at: string;
}

const CATEGORIES_QUERY_KEY = ["website", "categories"];

const fetchCategories = async (): Promise<Category[]> => {
  const { data, error } = await supabase
    .schema("website")
    .from("categories")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
};

const createCategory = async (
  values: CategoryFormValues,
): Promise<Category> => {
  const { data, error } = await supabase
    .schema("website")
    .from("categories")
    .insert(values)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
};

const updateCategoryActive = async ({
  id,
  is_active,
}: {
  id: string;
  is_active: boolean;
}): Promise<void> => {
  const { error } = await supabase
    .schema("website")
    .from("categories")
    .update({ is_active })
    .eq("id", id);

  if (error) throw new Error(error.message);
};

const deleteCategory = async (id: string): Promise<void> => {
  const { error } = await supabase
    .schema("website")
    .from("categories")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
};

// Exported for the background prefetcher (src/lib/prefetch).
export const websiteCategoriesQueryOptions = () =>
  queryOptions({ queryKey: CATEGORIES_QUERY_KEY, queryFn: fetchCategories });

export const useCategoriesQuery = () => useQuery(websiteCategoriesQueryOptions());

export const useCreateCategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });
};

export const useUpdateCategoryActive = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateCategoryActive,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });
};

export const useDeleteCategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });
};
