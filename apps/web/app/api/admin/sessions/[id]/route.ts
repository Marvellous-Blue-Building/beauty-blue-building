import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { extractImageUrl } from "@/lib/rag/image-url";

/** Full transcript across every conversation in a widget session, oldest
 * first. `conversation_id` lets the UI group messages into their
 * conversation; recommended products are resolved, in the order the bot
 * recommended them, to what the transcript's product cards need. */
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
         SELECT json_agg(json_build_object(
           'id', p.id, 'name', p.name, 'brand', p.brand, 'price', p.price, 'listedPrice', p.listed_price,
           'rating', p.rating, 'totalReview', p.total_review, 'imageUrl', p.image_url
         ) ORDER BY rid.ord)
         FROM unnest(msg.recommended_product_ids) WITH ORDINALITY AS rid(pid, ord)
         JOIN products p ON p.id = rid.pid
       ), '[]'::json) AS products
     FROM widget_conversations c
     JOIN widget_messages msg ON msg.conversation_id = c.id
     WHERE c.session_id = $1
     ORDER BY msg.created_at ASC`,
    [id]
  );

  // image_url wraps the real origin in a dead resize proxy — unwrap it (lib/rag/image-url.ts).
  for (const row of rows) {
    for (const p of row.products) p.imageUrl = extractImageUrl(p.imageUrl);
  }
  return NextResponse.json({ messages: rows });
}
