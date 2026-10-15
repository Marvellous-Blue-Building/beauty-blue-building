import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth/admin-session";

/**
 * "Demand signal" heuristic (Phase 5) — deliberately NOT sales forecasting.
 * There is no orders/transactions table in this project (confirmed during
 * planning), so there is no honest way to forecast *sales*. Instead this
 * combines two real, already-accumulating signals: cart-add count
 * (cart_items) and chat-recommendation frequency (recommended_product_ids
 * on both the authenticated app's chat_messages and the widget's
 * widget_messages) into a transparent, weighted score. The breakdown is
 * shown, not a single opaque "forecast" number.
 */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { rows } = await pool.query(
    `WITH cart_counts AS (
       SELECT product_id, COUNT(*) AS cart_adds
       FROM cart_items
       GROUP BY product_id
     ),
     chat_mentions AS (
       SELECT product_id, COUNT(*) AS mentions FROM (
         SELECT unnest(recommended_product_ids) AS product_id
         FROM chat_messages WHERE recommended_product_ids IS NOT NULL
         UNION ALL
         SELECT unnest(recommended_product_ids) AS product_id
         FROM widget_messages WHERE recommended_product_ids IS NOT NULL
       ) x
       GROUP BY product_id
     )
     SELECT p.id, p.name, p.brand, p.price, p.stock_quantity,
            COALESCE(cc.cart_adds, 0) AS cart_adds,
            COALESCE(cm.mentions, 0) AS chat_mentions,
            COALESCE(cc.cart_adds, 0) * 2 + COALESCE(cm.mentions, 0) AS signal_score
     FROM products p
     LEFT JOIN cart_counts cc ON cc.product_id = p.id
     LEFT JOIN chat_mentions cm ON cm.product_id = p.id
     WHERE COALESCE(cc.cart_adds, 0) + COALESCE(cm.mentions, 0) > 0
     ORDER BY signal_score DESC
     LIMIT 20`
  );

  return NextResponse.json({
    method: "weighted trailing signal: cart_adds*2 + chat_recommendation_mentions*1 — not a sales forecast (no order history exists yet)",
    products: rows,
  });
}
