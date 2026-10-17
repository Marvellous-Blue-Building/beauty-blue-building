import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth/admin-session";

/** Widget conversation history, listed per guest session — reads the real
 * `widget_sessions` / `widget_conversations` / `widget_messages` tables the
 * embeddable widget writes to. The preview is the session's first user
 * message (what the visitor actually asked first). */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT
       s.id,
       s.created_at,
       s.last_seen_at,
       COALESCE(c.conversation_count, 0)::int AS conversation_count,
       COALESCE(m.message_count, 0)::int AS message_count,
       first_user.text AS first_user_message
     FROM widget_sessions s
     LEFT JOIN (
       SELECT session_id, count(*)::int AS conversation_count
       FROM widget_conversations
       GROUP BY session_id
     ) c ON c.session_id = s.id
     LEFT JOIN (
       SELECT wc.session_id, count(wm.id)::int AS message_count
       FROM widget_conversations wc
       JOIN widget_messages wm ON wm.conversation_id = wc.id
       GROUP BY wc.session_id
     ) m ON m.session_id = s.id
     LEFT JOIN LATERAL (
       SELECT wm.text
       FROM widget_conversations wc
       JOIN widget_messages wm ON wm.conversation_id = wc.id
       WHERE wc.session_id = s.id AND wm.role = 'user' AND wm.text IS NOT NULL
       ORDER BY wm.created_at ASC
       LIMIT 1
     ) first_user ON true
     WHERE EXISTS (SELECT 1 FROM widget_conversations c WHERE c.session_id = s.id)
     ORDER BY s.last_seen_at DESC
     LIMIT 200`
  );

  return NextResponse.json({ sessions: rows });
}
