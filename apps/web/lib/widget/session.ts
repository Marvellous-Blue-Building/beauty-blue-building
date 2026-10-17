import { pool } from "@/lib/db";

/** Guest session model for the embeddable widget — deliberately separate
 * from the authenticated app's `chat_conversations`/`chat_messages` (no
 * `users` row, no OAuth), see data/14_widget_sessions.sql. */

/** `promoCode` is Phase 2 Modul 4 (Attribution, Lapis 1) — a code the
 * widget loader read from the retailer page's own `?promo=` URL param,
 * matched later against `event_calendar.promo_code`. */
export async function createWidgetSession(promoCode?: string | null): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO widget_sessions (promo_code) VALUES ($1) RETURNING id`,
    [promoCode || null]
  );
  return result.rows[0].id;
}

export async function touchWidgetSession(sessionId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE widget_sessions SET last_seen_at = now() WHERE id = $1`,
    [sessionId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getOrCreateWidgetConversation(
  sessionId: string,
  conversationId: string | null
): Promise<string> {
  if (conversationId) {
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM widget_conversations WHERE id = $1 AND session_id = $2`,
      [conversationId, sessionId]
    );
    if (existing.rows.length > 0) return existing.rows[0].id;
  }
  const created = await pool.query<{ id: string }>(
    `INSERT INTO widget_conversations (session_id) VALUES ($1) RETURNING id`,
    [sessionId]
  );
  return created.rows[0].id;
}

export async function saveWidgetMessage(params: {
  conversationId: string;
  role: "user" | "bot";
  text: string | null;
  recommendedProductIds?: string[];
  rawJsonText?: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO widget_messages (conversation_id, role, text, recommended_product_ids, raw_json_text)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.conversationId,
      params.role,
      params.text,
      params.recommendedProductIds && params.recommendedProductIds.length > 0 ? params.recommendedProductIds : null,
      params.rawJsonText ?? null,
    ]
  );
  await pool.query(`UPDATE widget_conversations SET updated_at = now() WHERE id = $1`, [params.conversationId]);
}
