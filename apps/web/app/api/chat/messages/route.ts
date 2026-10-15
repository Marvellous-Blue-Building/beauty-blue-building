import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { generateBotReply } from "@/lib/chat/bot-reply";
import { createConversation } from "@/lib/chat/create-conversation";
import type { ChatMessage } from "@/types/chat";

// Only used when generateBotReply genuinely fails (e.g. ai-advisor down) —
// a transparent error notice, not a scripted "engagement" reply pretending
// to have understood the message. Every turn still gets a stored bot
// message either way, so history never has a silent gap for the user to
// rediscover on their next visit. Always Indonesian — see bot-reply.ts.
const BOT_REPLY_UNAVAILABLE =
  "Maaf, saya tidak dapat menghasilkan respons saat ini — silakan coba lagi.";

/** Appends a real user message. By default NOTHING is stored to the DB —
 * the conversation (and its pinned greeting, see is_pinned) is only
 * created on the user's very first real send, not on merely visiting the
 * chat screen. Always stores a paired bot message too (the real pipeline
 * reply, or an honest error notice if that genuinely failed) — every turn
 * is persisted, never a silent gap. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { conversationId, text } = (await request.json()) as {
    conversationId: string | null;
    text: string;
  };

  let targetConversationId = conversationId;
  if (targetConversationId) {
    const owned = await pool.query(
      "SELECT id FROM chat_conversations WHERE id = $1 AND user_id = $2",
      [targetConversationId, user.id]
    );
    if (!owned.rows[0]) targetConversationId = null;
  }

  let greetingMessage: ChatMessage | null = null;
  if (!targetConversationId) {
    const created = await createConversation(user.id);
    targetConversationId = created.conversationId;
    greetingMessage = created.greetingMessage;
  }

  const insertedUser = await pool.query<{ id: string; created_at: string }>(
    "INSERT INTO chat_messages (conversation_id, role, text) VALUES ($1, 'user', $2) RETURNING id, created_at",
    [targetConversationId, text]
  );
  await pool.query("UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [
    targetConversationId,
  ]);
  const message: ChatMessage = {
    id: insertedUser.rows[0].id,
    role: "user",
    text,
    createdAt: insertedUser.rows[0].created_at,
  };

  let botReply;
  try {
    botReply = await generateBotReply(targetConversationId, text, user.id);
  } catch (err) {
    console.error("generateBotReply failed:", err);
    botReply = { text: BOT_REPLY_UNAVAILABLE };
  }

  const insertedBot = await pool.query<{ id: string; created_at: string }>(
    `INSERT INTO chat_messages (conversation_id, role, text, recommended_product_ids, raw_json_text)
     VALUES ($1, 'bot', $2, $3, $4) RETURNING id, created_at`,
    [targetConversationId, botReply.text, botReply.products?.map((p) => p.id) ?? null, botReply.rawJsonText ?? null]
  );

  const botMessage: ChatMessage = {
    id: insertedBot.rows[0].id,
    role: "bot",
    text: botReply.text,
    products: botReply.products,
    createdAt: insertedBot.rows[0].created_at,
  };
  return NextResponse.json({ conversationId: targetConversationId, greetingMessage, message, botMessage });
}
