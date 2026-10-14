import { useEffect, useState } from "react";
import { getJSON } from "@/lib/api-client";
import type { Product } from "@/types/product";

const EMPTY_MAP = new Map<string, Product>();

/** Batch-resolves real product rows for a set of ids (cart items, saved products) in a single request. */
export function useProductsByIds(ids: string[]): Map<string, Product> {
  const [productsById, setProductsById] = useState<Map<string, Product>>(EMPTY_MAP);
  const key = ids.join(",");

  useEffect(() => {
    if (!key) return;
    getJSON<Product[]>(`/api/products?ids=${key}`).then((products) => {
      setProductsById(new Map(products.map((p) => [p.id, p])));
    });
  }, [key]);

  return key ? productsById : EMPTY_MAP;
}
