import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { productId } = await params;
  await pool.query("DELETE FROM saved_products WHERE user_id = $1 AND product_id = $2", [user.id, productId]);

  const result = await pool.query<{ product_id: string }>(
    "SELECT product_id FROM saved_products WHERE user_id = $1 ORDER BY saved_at DESC",
    [user.id]
  );
  return NextResponse.json(result.rows.map((r) => r.product_id));
}
