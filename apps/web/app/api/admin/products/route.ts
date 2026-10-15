import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth/admin-session";

/** Minimal tenant catalog CRUD — reuses the real `products` table directly
 * (no new schema). List is intentionally narrow (name/brand/price/stock/
 * category) since this is a merchandising tool, not the full shopper PDP
 * data model. */
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const search = req.nextUrl.searchParams.get("search")?.trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 40) || 40, 200);

  const { rows } = search
    ? await pool.query(
        `SELECT id, name, brand, price, stock_quantity, category, sku
         FROM products WHERE name ILIKE $1 OR brand ILIKE $1 OR sku ILIKE $1
         ORDER BY updated_at DESC NULLS LAST LIMIT $2`,
        [`%${search}%`, limit]
      )
    : await pool.query(
        `SELECT id, name, brand, price, stock_quantity, category, sku
         FROM products ORDER BY updated_at DESC NULLS LAST LIMIT $1`,
        [limit]
      );

  return NextResponse.json({ products: rows });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    price?: number;
    stockQuantity?: number;
    category?: string;
  } | null;
  if (!body?.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  await pool.query(
    `UPDATE products SET
       price = COALESCE($2, price),
       stock_quantity = COALESCE($3, stock_quantity),
       category = COALESCE($4, category),
       updated_at = now()
     WHERE id = $1`,
    [body.id, body.price ?? null, body.stockQuantity ?? null, body.category ?? null]
  );
  return NextResponse.json({ ok: true });
}
