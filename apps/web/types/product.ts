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
  /** Detected via dictionary/regex over name+description+ingredients — the real catalog has no structured ethics flags. */
  tags: ProductTag[];
  /** Present only on products returned from the real-time RAG match (lib/rag/match-routine.ts). */
  matchPercent?: number;
  description: string;
  /** Parsed from the raw INCI text; `flagged` is computed per-viewer against their declared sensitivities, not fixed per product. */
  inci: InciIngredient[];
  compatibility: CompatibilityNote[];
}
