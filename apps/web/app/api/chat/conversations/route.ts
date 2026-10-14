import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import type { ConversationSummary } from "@/types/chat";

/** Lists real conversations only — nothing is created here. A brand new
 * user who hasn't sent a message yet correctly gets an empty list; the
 * first conversation (with its pinned greeting) is only created on their
 * first real send, see POST /api/chat/messages. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const result = await pool.query<{
    id: string;
    title: string;
    preview: string | null;
    updated_at: string;
  }>(
    `SELECT c.id, c.title, c.updated_at,
       (SELECT text FROM chat_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS preview
     FROM chat_conversations c
     WHERE c.user_id = $1
     ORDER BY c.updated_at DESC`,
    [user.id]
  );

  const conversations: ConversationSummary[] = result.rows.map((r) => ({
    id: r.id,
    title: r.title,
    preview: r.preview,
    updatedAt: r.updated_at,
  }));
  return NextResponse.json(conversations);
}
