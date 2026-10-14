import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { toProduct, type ProductRow } from "@/lib/rag/product-row";

/**
 * `id` here is a `parent_sku`, not a row UUID — every color/size variant
 * row sharing that parent_sku is returned as a full Product (see
 * types/product.ts's `parentSku` field), so the product detail screen can
 * switch between them with zero network round-trip / zero reload (see
 * app/[locale]/product/[id]/page.tsx).
 *
 * Out-of-stock siblings are included (not filtered out) so the UI can
 * render them disabled rather than silently hiding a real option — the
 * one exception: a true single-SKU product (no variant family at all)
 * that's itself out of stock is fully invisible (404), matching every
 * other stock_quantity > 0 filter in this app (Shop/chat/matched listings).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: parentSku } = await params;

  const result = await pool.query<ProductRow>(
    `SELECT *, (SELECT count(*) FROM products p2 WHERE p2.parent_sku = products.parent_sku) AS variant_count
     FROM products
     WHERE parent_sku = $1
     ORDER BY rating DESC NULLS LAST, total_review DESC NULLS LAST, sku`,
    [parentSku]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (result.rows.length === 1 && result.rows[0].stock_quantity === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const variants = result.rows.map((row) => toProduct(row));
  return NextResponse.json({ variants });
}
