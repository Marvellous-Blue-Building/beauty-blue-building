import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import type { CartItem } from "@/types/cart";

async function listCart(userId: string): Promise<CartItem[]> {
  const result = await pool.query<{ product_id: string; quantity: number }>(
    "SELECT product_id, quantity FROM cart_items WHERE user_id = $1 ORDER BY added_at",
    [userId]
  );
  return result.rows.map((r) => ({ productId: r.product_id, quantity: r.quantity }));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { productId } = await params;
  const { quantity } = (await request.json()) as { quantity: number };

  await pool.query(
    "UPDATE cart_items SET quantity = $1 WHERE user_id = $2 AND product_id = $3",
    [Math.max(1, quantity), user.id, productId]
  );

  return NextResponse.json(await listCart(user.id));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { productId } = await params;
  await pool.query("DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2", [user.id, productId]);

  return NextResponse.json(await listCart(user.id));
}
