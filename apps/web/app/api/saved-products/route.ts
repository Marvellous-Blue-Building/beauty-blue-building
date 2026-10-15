import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const result = await pool.query<{ product_id: string }>(
    "SELECT product_id FROM saved_products WHERE user_id = $1 ORDER BY saved_at DESC",
    [user.id]
  );
  return NextResponse.json(result.rows.map((r) => r.product_id));
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { productId } = (await request.json()) as { productId: string };
  await pool.query(
    "INSERT INTO saved_products (user_id, product_id) VALUES ($1, $2) ON CONFLICT (user_id, product_id) DO NOTHING",
    [user.id, productId]
  );

  const result = await pool.query<{ product_id: string }>(
    "SELECT product_id FROM saved_products WHERE user_id = $1 ORDER BY saved_at DESC",
    [user.id]
  );
  return NextResponse.json(result.rows.map((r) => r.product_id));
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  await pool.query("DELETE FROM saved_products WHERE user_id = $1", [user.id]);

  return NextResponse.json([]);
}
