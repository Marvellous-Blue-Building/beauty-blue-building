import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { toProduct, type ProductRow } from "@/lib/rag/product-row";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await pool.query<ProductRow>(
    `SELECT *, (SELECT count(*) FROM products p2 WHERE p2.parent_sku = products.parent_sku) AS variant_count
     FROM products WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toProduct(row));
}
