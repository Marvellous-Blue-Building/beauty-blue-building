import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import type { CartItem } from "@/types/cart";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const result = await pool.query<{ product_id: string; quantity: number }>(
    "SELECT product_id, quantity FROM cart_items WHERE user_id = $1 ORDER BY added_at",
    [user.id]
  );
  const items: CartItem[] = result.rows.map((r) => ({ productId: r.product_id, quantity: r.quantity }));
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { productId, quantity = 1 } = (await request.json()) as {
    productId: string;
    quantity?: number;
  };

  await pool.query(
    `INSERT INTO cart_items (user_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
    [user.id, productId, quantity]
  );

  const result = await pool.query<{ product_id: string; quantity: number }>(
    "SELECT product_id, quantity FROM cart_items WHERE user_id = $1 ORDER BY added_at",
    [user.id]
  );
  const items: CartItem[] = result.rows.map((r) => ({ productId: r.product_id, quantity: r.quantity }));
  return NextResponse.json(items);
}
