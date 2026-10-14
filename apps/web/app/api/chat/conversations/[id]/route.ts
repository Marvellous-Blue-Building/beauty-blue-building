import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
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
    recommendation_product_id: string | null;
    recommendation_badge: string | null;
    created_at: string;
  }>(
    `SELECT id, role, text, image_color, recommendation_product_id, recommendation_badge, created_at
     FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [id]
  );

  const messages: ChatMessage[] = messagesResult.rows.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text ?? undefined,
    imageColor: m.image_color ?? undefined,
    recommendation: m.recommendation_product_id
      ? { productId: m.recommendation_product_id, badge: m.recommendation_badge ?? "" }
      : undefined,
    createdAt: m.created_at,
  }));

  const detail: ConversationDetail = { id: conversation.id, title: conversation.title, messages };
  return NextResponse.json(detail);
}

/** "Clear Chat" — wipes this conversation's non-pinned messages (the
 * permanent greeting is pinned and survives), keeps the conversation row. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const convResult = await pool.query<{ id: string }>(
    "SELECT id FROM chat_conversations WHERE id = $1 AND user_id = $2",
    [id, user.id]
  );
  if (!convResult.rows[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await pool.query("DELETE FROM chat_messages WHERE conversation_id = $1 AND is_pinned = false", [id]);
  await pool.query("UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);

  return NextResponse.json({ ok: true });
}
