import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { toProduct, type ProductRow } from "@/lib/rag/product-row";

const SLOT_CATEGORY_MAP: Record<string, { categories: string[]; namePattern?: string }> = {
  cleanser: { categories: ["cleanser"] },
  serum: { categories: ["treatment", "skin-care"], namePattern: "%serum%" },
  moisturizer: { categories: ["moisturizer"] },
  spf: { categories: ["sun-care"] },
  mask: { categories: ["mask"] },
};

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");
  const search = request.nextUrl.searchParams.get("search");
  const ids = request.nextUrl.searchParams.get("ids");
  const limit = Math.min(60, Number(request.nextUrl.searchParams.get("limit")) || 24);
  const wantVegan = request.nextUrl.searchParams.get("vegan") === "true";
  const wantCrueltyFree = request.nextUrl.searchParams.get("crueltyFree") === "true";
  const wantFragranceFree = request.nextUrl.searchParams.get("fragranceFree") === "true";
  const maxPriceParam = request.nextUrl.searchParams.get("maxPrice");
  const maxPrice = maxPriceParam ? Number(maxPriceParam) : null;

  // Batch lookup by id — used to resolve cart/saved-product previews for
  // the EXACT variant rows referenced (cart/saved reference a specific
  // product id, so this path intentionally does NOT dedupe by parent_sku).
  if (ids) {
    const idList = ids.split(",").filter(Boolean);
    const result = await pool.query<ProductRow>(
      `SELECT *,
         (SELECT count(*) FROM products p2 WHERE p2.parent_sku = products.parent_sku) AS variant_count,
         (SELECT array_agg(DISTINCT p3.color_variant) FROM products p3
           WHERE p3.parent_sku = products.parent_sku AND p3.color_variant IS NOT NULL AND p3.stock_quantity > 0) AS color_palette
       FROM products WHERE id = ANY($1)`,
      [idList]
    );
    return NextResponse.json(result.rows.map((row) => toProduct(row)));
  }

  const params: unknown[] = [];
  let where = "stock_quantity > 0";

  if (category && category !== "all") {
    const slot = SLOT_CATEGORY_MAP[category] ?? { categories: [category] };
    params.push(slot.categories);
    where += ` AND category = ANY($${params.length})`;
    if (slot.namePattern) {
      params.push(slot.namePattern);
      where += ` AND name ILIKE $${params.length}`;
    }
  }
  if (search) {
    params.push(`%${search}%`);
    where += ` AND name ILIKE $${params.length}`;
  }
  if (maxPrice !== null && !Number.isNaN(maxPrice)) {
    params.push(maxPrice);
    where += ` AND price <= $${params.length}`;
  }

  // Account-level ethical preferences from the Profile screen — same claim
  // detection heuristics as detectEthicalTags() in lib/rag/dictionaries.ts,
  // applied as real SQL filters so toggling a preference actually changes
  // what the Shop catalog returns, independent of the category chip above.
  if (wantVegan) {
    where += ` AND (name ILIKE '%vegan%' OR description ILIKE '%vegan%')`;
  }
  if (wantCrueltyFree) {
    where += ` AND (name ILIKE '%cruelty-free%' OR name ILIKE '%cruelty free%' OR name ILIKE '%not tested on animals%' OR name ILIKE '%leaping bunny%'
                     OR description ILIKE '%cruelty-free%' OR description ILIKE '%cruelty free%' OR description ILIKE '%not tested on animals%' OR description ILIKE '%leaping bunny%')`;
  }
  if (wantFragranceFree) {
    where += ` AND (name ILIKE '%fragrance-free%' OR name ILIKE '%fragrance free%' OR description ILIKE '%fragrance-free%' OR description ILIKE '%fragrance free%' OR description ILIKE '%unscented%' OR (ingredients IS NOT NULL AND ingredients NOT ILIKE '%fragrance%' AND ingredients NOT ILIKE '%parfum%'))`;
  }

  params.push(limit);

  // Most rows in the real catalog are color/size variants of the same base
  // product sharing one parent_sku (verified: 24,940 of 24,941 rows share
  // a parent_sku with at least one sibling row — e.g. one lipstick scraped
  // as 72 separate shade rows). DISTINCT ON (parent_sku) collapses each
  // variant family down to a single representative row (its best-rated
  // variant) so product LISTINGS show one tile per real product, not one
  // per color/size variant. Cart/saved lookups above intentionally skip
  // this since those reference an exact purchased variant.
  const sql = `
    SELECT * FROM (
      SELECT DISTINCT ON (parent_sku) *,
        (SELECT count(*) FROM products p2 WHERE p2.parent_sku = products.parent_sku) AS variant_count,
        (SELECT array_agg(DISTINCT p3.color_variant) FROM products p3
          WHERE p3.parent_sku = products.parent_sku AND p3.color_variant IS NOT NULL AND p3.stock_quantity > 0) AS color_palette
      FROM products
      WHERE ${where}
      ORDER BY parent_sku, rating DESC NULLS LAST, total_review DESC NULLS LAST
    ) AS deduped
    ORDER BY rating DESC NULLS LAST, total_review DESC NULLS LAST
    LIMIT $${params.length}
  `;

  const result = await pool.query<ProductRow>(sql, params);
  return NextResponse.json(result.rows.map((row) => toProduct(row)));
}
