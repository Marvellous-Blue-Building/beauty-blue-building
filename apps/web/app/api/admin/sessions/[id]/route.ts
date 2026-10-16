import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth/admin-session";

/** Full transcript across every conversation in a widget session, oldest
 * first. `conversation_id` lets the UI group messages into their
 * conversation; recommended products are resolved to name/brand/price. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const { rows } = await pool.query(
    `SELECT
       msg.id,
       msg.role,
       msg.text,
       msg.created_at,
       msg.conversation_id,
       COALESCE((
         SELECT json_agg(json_build_object('name', p.name, 'brand', p.brand, 'price', p.price) ORDER BY p.name)
         FROM unnest(msg.recommended_product_ids) AS rid(pid)
         JOIN products p ON p.id = rid.pid
       ), '[]'::json) AS products
     FROM widget_conversations c
     JOIN widget_messages msg ON msg.conversation_id = c.id
     WHERE c.session_id = $1
     ORDER BY msg.created_at ASC`,
    [id]
  );

  return NextResponse.json({ messages: rows });
}
