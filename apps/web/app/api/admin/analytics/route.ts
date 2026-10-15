import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { holtLinearForecast } from "@/lib/analytics/holt-forecast";

/**
 * Demand-signal forecast (Phase 5) — a real forecasting algorithm (Holt's
 * linear trend method, see lib/analytics/holt-forecast.ts) run over an
 * hourly time series of two already-accumulating signals: cart-add count
 * (cart_items) and chat-recommendation frequency (recommended_product_ids
 * on both the authenticated app's chat_messages and the widget's
 * widget_messages).
 *
 * Deliberately labeled "activity forecast", not "sales forecast": there is
 * no orders/transactions table in this project, so there is no honest way
 * to forecast actual sales. What IS honest is forecasting the trend of
 * this signal itself, with a real smoothing/trend algorithm rather than a
 * static weighted score — which is what this endpoint now does.
 */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { rows: products } = await pool.query(
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

  if (products.length === 0) {
    return NextResponse.json({
      method: "Holt's linear trend method over hourly cart+chat activity signal — not a sales forecast (no order history exists yet)",
      products: [],
    });
  }

  const productIds = products.map((p) => p.id);

  // Hourly-bucketed combined signal per product, chronological.
  const { rows: series } = await pool.query(
    `WITH cart_series AS (
       SELECT product_id, date_trunc('hour', added_at) AS bucket, COUNT(*) * 2 AS n
       FROM cart_items
       WHERE product_id = ANY($1)
       GROUP BY product_id, bucket
     ),
     chat_series AS (
       SELECT product_id, bucket, COUNT(*) AS n FROM (
         SELECT unnest(recommended_product_ids) AS product_id, date_trunc('hour', created_at) AS bucket
         FROM chat_messages WHERE recommended_product_ids IS NOT NULL
         UNION ALL
         SELECT unnest(recommended_product_ids) AS product_id, date_trunc('hour', created_at) AS bucket
         FROM widget_messages WHERE recommended_product_ids IS NOT NULL
       ) x
       WHERE product_id = ANY($1)
       GROUP BY product_id, bucket
     )
     SELECT product_id, bucket, SUM(n)::float AS signal FROM (
       SELECT * FROM cart_series
       UNION ALL
       SELECT * FROM chat_series
     ) combined
     GROUP BY product_id, bucket
     ORDER BY product_id, bucket ASC`,
    [productIds]
  );

  const seriesByProduct = new Map<string, number[]>();
  for (const row of series) {
    const arr = seriesByProduct.get(row.product_id) ?? [];
    arr.push(Number(row.signal));
    seriesByProduct.set(row.product_id, arr);
  }

  const result = products.map((p) => {
    const hourly = seriesByProduct.get(p.id) ?? [Number(p.signal_score)];
    const forecast = holtLinearForecast(hourly);
    return {
      ...p,
      forecastNextHour: Math.round(forecast.forecastNextPeriod * 10) / 10,
      trend: forecast.trend,
      trendValue: Math.round(forecast.trendValue * 100) / 100,
      dataPoints: forecast.dataPoints,
    };
  });

  return NextResponse.json({
    method:
      "Holt's linear trend method (double exponential smoothing) over an hourly cart+chat activity signal — not Holt-Winters (no reliable seasonal period yet) and not a sales forecast (no order history exists).",
    products: result,
  });
}
