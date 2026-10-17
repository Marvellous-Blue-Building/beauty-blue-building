import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { classifySentiment } from "@/lib/analytics/sentiment";

/**
 * Phase 3 "sentiment dan tren" — real visitor chat text (not reviews, not
 * social — this project has neither), attributed to a product via the
 * SINGLE nearest user reply that followed a bot recommendation of that
 * product in the same conversation (a LATERAL "next message" join, not a
 * full cross join between every bot-recommendation and every user message
 * in the conversation — that earlier version multiplied N bot messages ×
 * M user messages per conversation, wildly overcounting any multi-turn
 * conversation). See lib/analytics/sentiment.ts for the classification
 * method.
 */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { rows } = await pool.query<{ product_id: string; text: string }>(
    `WITH chat_bot_products AS (
       SELECT conversation_id, created_at, unnest(recommended_product_ids) AS product_id
       FROM chat_messages WHERE role = 'bot' AND recommended_product_ids IS NOT NULL
     ),
     widget_bot_products AS (
       SELECT conversation_id, created_at, unnest(recommended_product_ids) AS product_id
       FROM widget_messages WHERE role = 'bot' AND recommended_product_ids IS NOT NULL
     )
     SELECT cbp.product_id, reply.text
     FROM chat_bot_products cbp
     JOIN LATERAL (
       SELECT text FROM chat_messages
       WHERE conversation_id = cbp.conversation_id AND role = 'user' AND text IS NOT NULL AND created_at >= cbp.created_at
       ORDER BY created_at ASC LIMIT 1
     ) reply ON true
     UNION ALL
     SELECT wbp.product_id, reply.text
     FROM widget_bot_products wbp
     JOIN LATERAL (
       SELECT text FROM widget_messages
       WHERE conversation_id = wbp.conversation_id AND role = 'user' AND text IS NOT NULL AND created_at >= wbp.created_at
       ORDER BY created_at ASC LIMIT 1
     ) reply ON true`
  );

  const countsByProduct = new Map<string, { positive: number; negative: number; neutral: number }>();
  for (const row of rows) {
    const { label } = classifySentiment(row.text);
    const counts = countsByProduct.get(row.product_id) ?? { positive: 0, negative: 0, neutral: 0 };
    counts[label] += 1;
    countsByProduct.set(row.product_id, counts);
  }

  if (countsByProduct.size === 0) {
    return NextResponse.json({
      method: "Lexicon ID+EN atas teks chat user nyata (bukan review, bukan model NLP terlatih) — lihat lib/analytics/sentiment.ts.",
      products: [],
    });
  }

  const productIds = [...countsByProduct.keys()];
  const { rows: products } = await pool.query<{ id: string; name: string; brand: string | null }>(
    `SELECT id, name, brand FROM products WHERE id = ANY($1)`,
    [productIds]
  );

  const result = products.map((p) => ({
    ...p,
    ...countsByProduct.get(p.id)!,
  }));
  result.sort((a, b) => b.negative + b.positive - (a.negative + a.positive));

  return NextResponse.json({
    method: "Lexicon ID+EN atas teks chat user nyata (bukan review, bukan model NLP terlatih) — lihat lib/analytics/sentiment.ts.",
    products: result,
  });
}
