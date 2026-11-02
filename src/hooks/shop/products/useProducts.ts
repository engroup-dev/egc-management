// hooks/shop/products/useProducts.ts
import { useState, useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { PostgrestError } from "@supabase/supabase-js";
import { Products, ProductSizes } from "../../../types/global.type";
import { supabase } from "../../../lib/supabaseClient";
import { ShopProductFormValues } from "../../../types/schema/shop/product.schema";

const PRODUCTS_SELECT = `
  *,
  shop_subcategories (
    id,
    name,
    category_id,
    shop_categories (
      id,
      name
    )
  )
`;

export const shopProductsKey = ["shop", "products"] as const;

async function fetchShopProducts(): Promise<Products[]> {
  const { data, error } = await supabase
    .from("shop_products")
    .select(PRODUCTS_SELECT);
  if (error) {
    console.error("Error fetching shop products:", error);
    throw error;
  }
  return (data as Products[]) ?? [];
}

// Exported so the background prefetcher can warm this screen.
export const shopProductsQueryOptions = () =>
  queryOptions({ queryKey: shopProductsKey, queryFn: fetchShopProducts });

export function useProducts() {
  const queryClient = useQueryClient();
  const query = useQuery(shopProductsQueryOptions());
  // Forms read `loading` / `error` for their own submit.
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<PostgrestError | null>(
    null,
  );

  const setActive = useCallback(
    (id: string, isActive: boolean) =>
      queryClient.setQueryData<Products[]>(shopProductsKey, (prev) =>
        prev?.map((p) => (p.id === id ? { ...p, is_active: isActive } : p)),
      ),
    [queryClient],
  );

  const addProduct = async (formValues: ShopProductFormValues) => {
    setMutating(true);
    setMutationError(null);

    const { sizes, ...productFields } = formValues;

    try {
      const { data: product, error: insertError } = await supabase
        .from("shop_products")
        .insert([productFields])
        .select(PRODUCTS_SELECT)
        .single();

      if (insertError || !product) {
        console.error("Error adding shop product:", insertError);
        setMutationError(insertError);
        return null;
      }

      const sizesPayload = sizes.map((s) => ({
        ...s,
        product_id: product.id,
      }));

      const { data: insertedSizes, error: sizesError } = await supabase
        .from("shop_product_sizes")
        .insert(sizesPayload)
        .select();

      if (sizesError) {
        console.error("Error adding product sizes:", sizesError);
        setMutationError(sizesError);
        return null;
      }

      queryClient.setQueryData<Products[]>(shopProductsKey, (prev) =>
        prev ? [...prev, product as Products] : prev,
      );
      queryClient.invalidateQueries({ queryKey: ["shop"] });
      return { product, sizes: insertedSizes as ProductSizes[] };
    } catch (err) {
      console.error("Unexpected error adding shop product:", err);
      setMutationError(err as PostgrestError);
      return null;
    } finally {
      setMutating(false);
    }
  };

  const toggleProductActive = useCallback(
    async (id: string, isActive: boolean) => {
      setMutationError(null);
      setActive(id, isActive);

      try {
        const { data, error: updateError } = await supabase
          .from("shop_products")
          .update({ is_active: isActive })
          .eq("id", id)
          .select(PRODUCTS_SELECT)
          .single();

        if (updateError) {
          console.error("Error toggling product status:", updateError);
          setMutationError(updateError);
          setActive(id, !isActive);
          return null;
        }

        queryClient.invalidateQueries({ queryKey: ["shop"] });
        return data;
      } catch (err) {
        console.error("Unexpected error toggling product status:", err);
        setMutationError(err as PostgrestError);
        setActive(id, !isActive);
        return null;
      }
    },
    [queryClient, setActive],
  );

  return {
    products: query.data ?? [],
    loading: query.isPending || mutating,
    error: mutationError ?? (query.error as PostgrestError | null),
    addProduct,
    toggleProductActive,
  };
}
