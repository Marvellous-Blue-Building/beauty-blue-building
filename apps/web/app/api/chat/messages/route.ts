import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { generateBotReply } from "@/lib/chat/bot-reply";
import type { ChatMessage } from "@/types/chat";

const GREETING: Record<string, string> = {
  en: "Hello with AI Advisor here, May I help you?",
  id: "Halo, ini AI Advisor. Ada yang bisa saya bantu?",
};

async function greetingText(): Promise<string> {
  const locale = (await cookies()).get("NEXT_LOCALE")?.value ?? "en";
  return GREETING[locale] ?? GREETING.en;
}

/** Appends a real user message. By default NOTHING is stored to the DB —
 * the conversation (and its pinned greeting, see is_pinned) is only
 * created on the user's very first real send, not on merely visiting the
 * chat screen. Also generates and stores a template-based bot reply (see
 * lib/chat/bot-reply.ts) in the same conversation. */
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
    const created = await pool.query<{ id: string }>(
      "INSERT INTO chat_conversations (user_id, title) VALUES ($1, 'New Conversation') RETURNING id",
      [user.id]
    );
    targetConversationId = created.rows[0].id;

    const greetingTextValue = await greetingText();
    const insertedGreeting = await pool.query<{ id: string; created_at: string }>(
      "INSERT INTO chat_messages (conversation_id, role, text, is_pinned) VALUES ($1, 'bot', $2, true) RETURNING id, created_at",
      [targetConversationId, greetingTextValue]
    );
    greetingMessage = {
      id: insertedGreeting.rows[0].id,
      role: "bot",
      text: greetingTextValue,
      createdAt: insertedGreeting.rows[0].created_at,
    };
  }

  const insertedUser = await pool.query<{ id: string; created_at: string }>(
    "INSERT INTO chat_messages (conversation_id, role, text) VALUES ($1, 'user', $2) RETURNING id, created_at",
    [targetConversationId, text]
  );

  const botText = generateBotReply(text);
  const insertedBot = await pool.query<{ id: string; created_at: string }>(
    "INSERT INTO chat_messages (conversation_id, role, text) VALUES ($1, 'bot', $2) RETURNING id, created_at",
    [targetConversationId, botText]
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
  const botMessage: ChatMessage = {
    id: insertedBot.rows[0].id,
    role: "bot",
    text: botText,
    createdAt: insertedBot.rows[0].created_at,
  };
  return NextResponse.json({ conversationId: targetConversationId, greetingMessage, message, botMessage });
}
