import { pool } from "@/lib/db";
import type { ChatMessage } from "@/types/chat";

// The AI Advisor always responds in Bahasa Indonesia, independent of the
// app's own UI locale — see lib/chat/bot-reply.ts's module docstring.
const GREETING_TEXT = "Halo, ini AI Advisor. Ada yang bisa saya bantu?";

/** Creates a new conversation + its pinned greeting message. Used both
 * lazily (first real send, see app/api/chat/messages/route.ts) and
 * explicitly ("Clear Chat" starting a fresh session — see
 * app/api/chat/conversations/route.ts's POST — which must NOT delete the
 * previous conversation; it stays intact in /chat/history). */
export async function createConversation(userId: string): Promise<{
  conversationId: string;
  greetingMessage: ChatMessage;
}> {
  const created = await pool.query<{ id: string }>(
    "INSERT INTO chat_conversations (user_id, title) VALUES ($1, 'New Conversation') RETURNING id",
    [userId]
  );
  const conversationId = created.rows[0].id;

  const greetingTextValue = GREETING_TEXT;
  const insertedGreeting = await pool.query<{ id: string; created_at: string }>(
    "INSERT INTO chat_messages (conversation_id, role, text, is_pinned) VALUES ($1, 'bot', $2, true) RETURNING id, created_at",
    [conversationId, greetingTextValue]
  );
  const greetingMessage: ChatMessage = {
    id: insertedGreeting.rows[0].id,
    role: "bot",
    text: greetingTextValue,
    createdAt: insertedGreeting.rows[0].created_at,
  };

  return { conversationId, greetingMessage };
}
