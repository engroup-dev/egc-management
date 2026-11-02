// hooks/shop/products/useProduct.ts
import { useState, useCallback, SetStateAction } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { Products, ProductSizes } from "../../../types/global.type";
import { supabase } from "../../../lib/supabaseClient";
import { shopProductsKey } from "./useProducts";

export type ProductWithRelations = Products & {
  shop_subcategories?: {
    id: string;
    name: string;
    category_id: string;
    shop_categories?: {
      id: string;
      name: string;
      division_id: string;
      shop_divisions?: {
        id: string;
        name: string;
      } | null;
    } | null;
  } | null;
  shop_product_sizes?: ProductSizes[];
};

const PRODUCT_SELECT = `
  *,
  shop_subcategories (
    id,
    name,
    category_id,
    shop_categories (
      id,
      name,
      division_id,
      shop_divisions (
        id,
        name
      )
    )
  ),
  shop_product_sizes (
    id,
    name,
    unit,
    sku,
    is_active,
    price,
    image_path,
    created_at
  )
`;

export const shopProductKey = (id: string | undefined) =>
  ["shop", "product", id ?? ""] as const;

async function fetchShopProduct(id: string): Promise<ProductWithRelations> {
  const { data, error } = await supabase
    .from("shop_products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching product:", error);
    throw error;
  }
  return data as ProductWithRelations;
}

export const shopProductQueryOptions = (id: string | undefined) =>
  queryOptions({
    queryKey: shopProductKey(id),
    queryFn: () => fetchShopProduct(id as string),
    enabled: !!id,
  });

export function useProduct(id: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery(shopProductQueryOptions(id));
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<PostgrestError | null>(
    null,
  );

  const setProduct = useCallback(
    (value: SetStateAction<ProductWithRelations | null>) =>
      queryClient.setQueryData<ProductWithRelations | null>(
        shopProductKey(id),
        (prev) => (typeof value === "function" ? value(prev ?? null) : value),
      ),
    [queryClient, id],
  );

  const { refetch: refetchQuery } = query;
  const refetch = useCallback(async () => {
    if (!id) return;
    await refetchQuery();
  }, [id, refetchQuery]);

  const updateProduct = useCallback(
    async (values: {
      name: string;
      description?: string | null;
      image_path?: string | null;
      subcategory_id: string;
      is_active?: boolean;
    }) => {
      if (!id) return null;
      setMutating(true);
      setMutationError(null);

      try {
        const { data, error: updateError } = await supabase
          .from("shop_products")
          .update(values)
          .eq("id", id)
          .select(PRODUCT_SELECT)
          .single();

        if (updateError) {
          console.error("Error updating product:", updateError);
          setMutationError(updateError);
          return null;
        }

        setProduct(data as ProductWithRelations);
        queryClient.invalidateQueries({ queryKey: ["shop"] });
        return data;
      } catch (err) {
        console.error("Unexpected error updating product:", err);
        setMutationError(err as PostgrestError);
        return null;
      } finally {
        setMutating(false);
      }
    },
    [id, queryClient, setProduct, setMutationError],
  );

  const toggleProductActive = useCallback(
    async (isActive: boolean) => {
      if (!id) return null;
      setMutationError(null);

      setProduct((prev) => (prev ? { ...prev, is_active: isActive } : prev));

      try {
        const { data, error: updateError } = await supabase
          .from("shop_products")
          .update({ is_active: isActive })
          .eq("id", id)
          .select(PRODUCT_SELECT)
          .single();

        if (updateError) {
          console.error("Error toggling product status:", updateError);
          setMutationError(updateError);
          setProduct((prev) =>
            prev ? { ...prev, is_active: !isActive } : prev,
          );
          return null;
        }

        setProduct(data as ProductWithRelations);
        queryClient.invalidateQueries({ queryKey: ["shop"] });
        return data;
      } catch (err) {
        console.error("Unexpected error toggling product status:", err);
        setMutationError(err as PostgrestError);
        setProduct((prev) => (prev ? { ...prev, is_active: !isActive } : prev));
        return null;
      }
    },
    [id, queryClient, setProduct, setMutationError],
  );

  const addSize = useCallback(
    async (size: Omit<ProductSizes, "id" | "created_at" | "product_id">) => {
      if (!id) return null;
      setMutationError(null);

      try {
        const { data, error: insertError } = await supabase
          .from("shop_product_sizes")
          .insert([{ ...size, product_id: id }])
          .select()
          .single();

        if (insertError) {
          console.error("Error adding size:", insertError);
          setMutationError(insertError);
          return null;
        }

        setProduct((prev) =>
          prev
            ? {
                ...prev,
                shop_product_sizes: [
                  ...(prev.shop_product_sizes || []),
                  data as ProductSizes,
                ],
              }
            : prev,
        );
        return data;
      } catch (err) {
        console.error("Unexpected error adding size:", err);
        setMutationError(err as PostgrestError);
        return null;
      }
    },
    [id, setProduct, setMutationError],
  );

  const updateSize = useCallback(
    async (
      sizeId: string,
      values: Partial<Omit<ProductSizes, "id" | "created_at" | "product_id">>,
    ) => {
      setMutationError(null);

      try {
        const { data, error: updateError } = await supabase
          .from("shop_product_sizes")
          .update(values)
          .eq("id", sizeId)
          .select()
          .single();

        if (updateError) {
          console.error("Error updating size:", updateError);
          setMutationError(updateError);
          return null;
        }

        setProduct((prev) =>
          prev
            ? {
                ...prev,
                shop_product_sizes: prev.shop_product_sizes?.map((s) =>
                  s.id === sizeId ? (data as ProductSizes) : s,
                ),
              }
            : prev,
        );
        return data;
      } catch (err) {
        console.error("Unexpected error updating size:", err);
        setMutationError(err as PostgrestError);
        return null;
      }
    },
    [setProduct, setMutationError],
  );

  const deleteSize = useCallback(
    async (sizeId: string) => {
      setMutationError(null);

      const prevProduct =
        queryClient.getQueryData<ProductWithRelations | null>(
          shopProductKey(id),
        ) ?? null;

      setProduct((prev) =>
        prev
          ? {
              ...prev,
              shop_product_sizes: prev.shop_product_sizes?.filter(
                (s) => s.id !== sizeId,
              ),
            }
          : prev,
      );

      try {
        const { error: deleteError } = await supabase
          .from("shop_product_sizes")
          .delete()
          .eq("id", sizeId);

        if (deleteError) {
          console.error("Error deleting size:", deleteError);
          setMutationError(deleteError);
          setProduct(prevProduct);
          return false;
        }

        return true;
      } catch (err) {
        console.error("Unexpected error deleting size:", err);
        setMutationError(err as PostgrestError);
        setProduct(prevProduct);
        return false;
      }
    },
    [queryClient, id, setProduct, setMutationError],
  );

  const toggleSizeActive = useCallback(
    async (sizeId: string, isActive: boolean) => {
      setMutationError(null);

      setProduct((prev) =>
        prev
          ? {
              ...prev,
              shop_product_sizes: prev.shop_product_sizes?.map((s) =>
                s.id === sizeId ? { ...s, is_active: isActive } : s,
              ),
            }
          : prev,
      );

      try {
        const { error: updateError } = await supabase
          .from("shop_product_sizes")
          .update({ is_active: isActive })
          .eq("id", sizeId);

        if (updateError) {
          console.error("Error toggling size status:", updateError);
          setMutationError(updateError);
          setProduct((prev) =>
            prev
              ? {
                  ...prev,
                  shop_product_sizes: prev.shop_product_sizes?.map((s) =>
                    s.id === sizeId ? { ...s, is_active: !isActive } : s,
                  ),
                }
              : prev,
          );
        }
      } catch (err) {
        console.error("Unexpected error toggling size status:", err);
        setMutationError(err as PostgrestError);
      }
    },
    [setProduct, setMutationError],
  );

  const deleteProduct = useCallback(async () => {
    if (!id) return false;
    setMutationError(null);

    try {
      const { error: deleteError } = await supabase
        .from("shop_products")
        .delete()
        .eq("id", id);

      if (deleteError) {
        console.error("Error deleting product:", deleteError);
        setMutationError(deleteError);
        return false;
      }

      queryClient.setQueryData<ProductWithRelations[]>(shopProductsKey, (prev) =>
        prev?.filter((p) => p.id !== id),
      );
      // Mark only: refetching the deleted row now would just error.
      queryClient.invalidateQueries({
        queryKey: ["shop"],
        refetchType: "none",
      });
      return true;
    } catch (err) {
      console.error("Unexpected error deleting product:", err);
      setMutationError(err as PostgrestError);
      return false;
    }
  }, [id, queryClient, setMutationError]);

  return {
    product: query.data ?? null,
    loading: (query.isPending && !!id) || mutating,
    error: mutationError ?? (query.error as PostgrestError | null),
    refetch,
    updateProduct,
    toggleProductActive,
    addSize,
    updateSize,
    deleteSize,
    toggleSizeActive,
    deleteProduct,
  };
}
