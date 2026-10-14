export type ProductTag = "Vegan" | "Cruelty-Free" | "Fragrance-Free";

export interface InciIngredient {
  name: string;
  flagged?: boolean;
}

export interface CompatibilityNote {
  label: string;
  ok: boolean;
}

/**
 * Product as served to the frontend — backed by the real `products` table
 * (24,941 rows imported from data/beauty_product.csv), not mock JSON.
 * `category` is free text (the real catalog has 46 categories spanning far
 * more than skincare), not a fixed enum.
 */
export interface Product {
  id: string;
  sku: string;
  /** Shared across every color/size variant row of this same product line
   * (e.g. one lipstick scraped as 72 separate shade rows all share one
   * parent_sku) — used as the product detail route's identifier so
   * switching shade/size there never navigates/reloads, see
   * app/[locale]/product/[id]/page.tsx. */
  parentSku: string;
  name: string;
  brand: string;
  /** Extracted from the DB's image_url (see lib/rag/image-url.ts) — null falls back to a placeholder in the UI. */
  imageUrl: string | null;
  sizeLabel: string | null;
  price: number;
  listedPrice: number | null;
  /** How many color/size variants share this product's parent_sku — a discount badge only shows when this is a real multi-variant line (>1). */
  variantCount: number;
  rating: number | null;
  totalReview: number | null;
  category: string;
  /** Real stock count — used by the product detail screen to disable (not
   * hide) a specific shade/size option within a multi-variant family. */
  stockQuantity: number;
  /** Detected via dictionary/regex over name+description+ingredients — the real catalog has no structured ethics flags. */
  tags: ProductTag[];
  /** Present only on products returned from the real-time RAG match (lib/rag/match-routine.ts). */
  matchPercent?: number;
  description: string;
  /** Parsed from the raw INCI text; `flagged` is computed per-viewer against their declared sensitivities, not fixed per product. */
  inci: InciIngredient[];
  compatibility: CompatibilityNote[];
  /** This exact row's own shade, if the real catalog scraped one (common —
   * most of the catalog is color/size variant rows of a shared parent_sku). */
  colorHex: string | null;
  colorName: string | null;
  /** Distinct in-stock shade hexes across this product's whole parent_sku
   * family (deduped, no names) — cheap enough to compute in every list/
   * search query (see the color_palette subquery), unlike the full sibling
   * Product objects the detail endpoint fetches. Used for the list-view
   * hex-only swatch row when a product has more than one variant. */
  colorPalette: string[];
}
