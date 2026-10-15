import type { Product } from "@/types/product";

/** Builds the product detail URL: /product/<parentSku>, with ?color=<hex>
 * and/or ?size=<label> identifying which specific variant to show by
 * default (one, both, or neither — a single-variant product has no need
 * for either). `parentSku` is shared across every color/size variant row
 * of the same product line, so the route itself never changes when
 * switching shades/sizes there — see
 * app/[locale]/product/[id]/page.tsx. */
export function productHref(product: Product, opts?: { fromChat?: boolean }): string {
  const params = new URLSearchParams();
  if (product.colorHex) params.set("color", product.colorHex);
  if (product.sizeLabel) params.set("size", product.sizeLabel);
  if (opts?.fromChat) params.set("from", "chat");

  const query = params.toString();
  return `/product/${product.parentSku}${query ? `?${query}` : ""}`;
}
