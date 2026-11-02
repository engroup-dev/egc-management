import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import {
  HeroSlideAltFormValues,
  HeroSlideFormValues,
} from "../../types/schema/website/heroSlide.schema";

export interface HeroSlide {
  id: string;
  alt_ar: string;
  alt_en: string;
  is_active: boolean;
  sort_order: number;
  storage_path: string;
  created_at: string;
}

const HERO_SLIDES_QUERY_KEY = ["website", "hero-slides"];
const BUCKET = "site-media";
const FOLDER = "hero-slides";

export const getHeroSlideUrl = (storagePath: string) =>
  supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;

const fetchHeroSlides = async (): Promise<HeroSlide[]> => {
  const { data, error } = await supabase
    .schema("website")
    .from("hero_slides")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
};

const createHeroSlide = async (
  values: HeroSlideFormValues,
): Promise<HeroSlide> => {
  const { data: lastSlide, error: fetchError } = await supabase
    .schema("website")
    .from("hero_slides")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);

  const nextSortOrder = lastSlide ? lastSlide.sort_order + 1 : 0;

  const extMatch = values.file.name.match(/\.(\w+)$/);
  const ext = extMatch ? extMatch[1] : "jpg";
  const path = `${FOLDER}/${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, values.file, {
      contentType: values.file.type || "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase
    .schema("website")
    .from("hero_slides")
    .insert({
      alt_ar: values.alt_ar,
      alt_en: values.alt_en,
      storage_path: path,
      sort_order: nextSortOrder,
    })
    .select("*")
    .single();

  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }

  return data;
};

const updateHeroSlideAlt = async ({
  id,
  values,
}: {
  id: string;
  values: HeroSlideAltFormValues;
}): Promise<void> => {
  const { error } = await supabase
    .schema("website")
    .from("hero_slides")
    .update(values)
    .eq("id", id);

  if (error) throw new Error(error.message);
};

const deleteHeroSlide = async (slide: HeroSlide): Promise<void> => {
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([slide.storage_path]);

  if (storageError) throw new Error(storageError.message);

  const { error } = await supabase
    .schema("website")
    .from("hero_slides")
    .delete()
    .eq("id", slide.id);

  if (error) throw new Error(error.message);
};

/** Recomputes sort_order to match each slide's position in the array. */
export const withSortOrder = (slides: HeroSlide[]): HeroSlide[] =>
  slides.map((slide, index) => ({ ...slide, sort_order: index }));

const reorderHeroSlides = async (slides: HeroSlide[]): Promise<void> => {
  const { error } = await supabase
    .schema("website")
    .from("hero_slides")
    .upsert(
      slides.map((slide) => ({
        id: slide.id,
        alt_ar: slide.alt_ar,
        alt_en: slide.alt_en,
        storage_path: slide.storage_path,
        is_active: slide.is_active,
        sort_order: slide.sort_order,
      })),
      { onConflict: "id" },
    );

  if (error) throw new Error(error.message);
};

// Exported for the background prefetcher (src/lib/prefetch).
export const heroSlidesQueryOptions = () =>
  queryOptions({ queryKey: HERO_SLIDES_QUERY_KEY, queryFn: fetchHeroSlides });

export const useHeroSlidesQuery = () => useQuery(heroSlidesQueryOptions());

export const useCreateHeroSlide = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createHeroSlide,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HERO_SLIDES_QUERY_KEY });
    },
  });
};

export const useUpdateHeroSlideAlt = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateHeroSlideAlt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HERO_SLIDES_QUERY_KEY });
    },
  });
};

export const useDeleteHeroSlide = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteHeroSlide,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HERO_SLIDES_QUERY_KEY });
    },
  });
};

export const useReorderHeroSlides = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reorderHeroSlides,
    onMutate: async (nextSlides) => {
      await queryClient.cancelQueries({ queryKey: HERO_SLIDES_QUERY_KEY });
      const previous = queryClient.getQueryData<HeroSlide[]>(
        HERO_SLIDES_QUERY_KEY,
      );
      queryClient.setQueryData(HERO_SLIDES_QUERY_KEY, nextSlides);
      return { previous };
    },
    onError: (_err, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(HERO_SLIDES_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: HERO_SLIDES_QUERY_KEY });
    },
  });
};
