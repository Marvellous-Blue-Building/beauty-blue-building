import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { toProduct, type ProductRow } from "@/lib/rag/product-row";
import type { ChatMessage, ConversationDetail } from "@/types/chat";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  // Ownership check — a conversation only belongs to the user who owns it.
  const convResult = await pool.query<{ id: string; title: string }>(
    "SELECT id, title FROM chat_conversations WHERE id = $1 AND user_id = $2",
    [id, user.id]
  );
  const conversation = convResult.rows[0];
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messagesResult = await pool.query<{
    id: string;
    role: "user" | "bot";
    text: string | null;
    image_color: string | null;
    recommended_product_ids: string[] | null;
    created_at: string;
  }>(
    `SELECT id, role, text, image_color, recommended_product_ids, created_at
     FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [id]
  );

  // Batch-resolve every recommended product id across the whole
  // conversation in one query, rather than one round trip per message.
  const allProductIds = [...new Set(messagesResult.rows.flatMap((m) => m.recommended_product_ids ?? []))];
  const productsById = new Map<string, ReturnType<typeof toProduct>>();
  if (allProductIds.length > 0) {
    const productsResult = await pool.query<ProductRow>(
      `SELECT *, (SELECT count(*) FROM products p2 WHERE p2.parent_sku = products.parent_sku) AS variant_count
       FROM products WHERE id = ANY($1)`,
      [allProductIds]
    );
    for (const row of productsResult.rows) productsById.set(row.id, toProduct(row));
  }

  const messages: ChatMessage[] = messagesResult.rows.map((m) => {
    const text = m.text ?? undefined;
    const navButtons: { label: string; target: string }[] = [];

    if (text) {
      if (text.includes("[Track Your Progress]")) {
        navButtons.push({ label: "Track Your Progress", target: "progress" });
      }
      if (text.includes("[Skin Scanning Analysis Tool]")) {
        navButtons.push({ label: "Skin Scanning Analysis Tool", target: "progress/check-in" });
      }
    }

    return {
      id: m.id,
      role: m.role,
      text: text,
      imageColor: m.image_color ?? undefined,
      products: m.recommended_product_ids
        ? m.recommended_product_ids.map((pid) => productsById.get(pid)).filter((p) => p !== undefined)
        : undefined,
      navButtons: navButtons.length > 0 ? navButtons : undefined,
      createdAt: m.created_at,
    };
  });

  const detail: ConversationDetail = { id: conversation.id, title: conversation.title, messages };
  return NextResponse.json(detail);
}
