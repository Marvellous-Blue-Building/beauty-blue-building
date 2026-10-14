import type { Product } from "@/types/product";
import { detectEthicalTags } from "@/lib/rag/dictionaries";
import { parseIngredients } from "@/lib/rag/sensitivity-flags";
import { extractImageUrl } from "@/lib/rag/image-url";

/** Raw shape of a row from the `products` table, as returned by node-postgres (numeric/decimal columns arrive as strings). */
export interface ProductRow {
  id: string;
  sku: string | null;
  name: string;
  brand: string | null;
  description: string | null;
  price: string;
  listed_price: string | null;
  category: string | null;
  rating: string | null;
  total_review: number | null;
  ingredients: string | null;
  size_label: string | null;
  image_url: string | null;
  stock_quantity: number;
  /** How many rows share this product's parent_sku (color/size variant count) — see the variant_count subquery wherever ProductRow is selected. */
  variant_count: string;
  parent_sku: string | null;
  color_variant: string | null;
  variant_color_name: string | null;
  /** Distinct in-stock color_variant hexes across the whole parent_sku
   * family — see the color_palette subquery wherever ProductRow is
   * selected for list/search display. Absent (undefined) on queries that
   * don't bother computing it (e.g. the detail endpoint, which fetches
   * full sibling Products instead). */
  color_palette?: string[] | null;
}

function buildCompatibility(category: string | null, ingredients: string | null): Product["compatibility"] {
  const lower = ingredients?.toLowerCase() ?? "";
  const cat = category ?? "";

  if (cat === "cleanser") {
    return [{ label: "Safe as first step in your routine", ok: true }];
  }
  if (cat === "sun-care") {
    return [{ label: "Always apply last in your AM routine", ok: true }];
  }
  if (cat === "moisturizer") {
    return [{ label: "Safe after any serum", ok: true }];
  }
  if (lower.includes("retinol") || lower.includes("retinal")) {
    return [
      { label: "PM use only", ok: true },
      { label: "Avoid combining with BHA/AHA the same night", ok: false },
    ];
  }
  if (lower.includes("salicylic") || lower.includes("glycolic")) {
    return [
      { label: "Wait ~20 minutes after cleansing before applying", ok: true },
      { label: "Avoid combining with Retinol the same night", ok: false },
    ];
  }
  return [{ label: "Follow the product's usage instructions", ok: true }];
}

/** Maps a raw DB row into the frontend-facing Product shape — tags/compatibility are computed here since the real catalog has no structured columns for them. */
export function toProduct(row: ProductRow, matchPercent?: number): Product {
  const description = row.description ?? "";
  const tags = detectEthicalTags(`${row.name} ${description}`, row.ingredients);
  const tagList: Product["tags"] = [
    ...(tags.vegan ? (["Vegan"] as const) : []),
    ...(tags.crueltyFree ? (["Cruelty-Free"] as const) : []),
    ...(tags.fragranceFree ? (["Fragrance-Free"] as const) : []),
  ];

  return {
    id: row.id,
    sku: row.sku ?? "",
    parentSku: row.parent_sku ?? row.sku ?? row.id,
    name: row.name,
    brand: row.brand ?? "Unbranded",
    imageUrl: extractImageUrl(row.image_url),
    sizeLabel: row.size_label,
    price: parseFloat(row.price),
    listedPrice: row.listed_price ? parseFloat(row.listed_price) : null,
    variantCount: parseInt(row.variant_count, 10),
    rating: row.rating ? parseFloat(row.rating) : null,
    totalReview: row.total_review,
    category: row.category ?? "uncategorized",
    stockQuantity: row.stock_quantity,
    tags: tagList,
    matchPercent,
    description,
    inci: parseIngredients(row.ingredients).map((name) => ({ name })),
    compatibility: buildCompatibility(row.category, row.ingredients),
    colorHex: row.color_variant,
    colorName: row.variant_color_name,
    colorPalette: row.color_palette ?? (row.color_variant ? [row.color_variant] : []),
  };
}
