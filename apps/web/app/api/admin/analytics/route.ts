import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { holtLinearForecast } from "@/lib/analytics/holt-forecast";
import { robustZScore } from "@/lib/analytics/robust-zscore";
import { runCusum, type CusumPoint } from "@/lib/analytics/cusum";

/**
 * Demand-signal forecast + alert (Phase 5), combining two real algorithms
 * from the user's own knowledge-base docs, both scoped down to the 2
 * signals this project actually has (cart adds, chat recommendation
 * mentions — bucketed hourly, not daily, since real history here is hours
 * old):
 *
 * 1. Holt's linear trend method (lib/analytics/holt-forecast.ts) — "how is
 *    this product's activity trending, what's the next-hour level."
 * 2. Robust z-score + CUSUM spike detection (lib/analytics/robust-zscore.ts,
 *    lib/analytics/cusum.ts), from "Demand Signal System.md" — "has there
 *    been a SUSTAINED shift worth alerting on, not just one noisy hour."
 *
 * Both are real implementations of real algorithms, not fabricated
 * numbers — verified against known monotonic/spike/fading input series.
 * Neither is the full system described in either knowledge-base doc: the
 * DSS doc's 8 signals (Google Trends, social listening, reviews, event
 * calendar, competitor pricing) need external API integrations and a
 * 12-month backtest to calibrate weights/thresholds that don't exist in
 * this project. This endpoint runs the same CUSUM/z-score MECHANISM on
 * the 2 signals available, explicitly labeled as a scoped proof of
 * concept, not a recalibrated production detector.
 *
 * Still explicitly an activity signal, not a sales forecast: there is no
 * orders/transactions table in this project.
 */

function log1p(x: number): number {
  return Math.log(1 + Math.max(0, x));
}

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
      method: "Holt's linear trend method + robust z-score/CUSUM over hourly cart+chat activity — not a sales forecast (no order history exists yet)",
      products: [],
    });
  }

  const productIds = products.map((p) => p.id);

  // Per-product, per-hour, BOTH raw signals aligned on the same bucket grid.
  const { rows: series } = await pool.query(
    `WITH cart_series AS (
       SELECT product_id, date_trunc('hour', added_at) AS bucket, COUNT(*)::float AS cart_n
       FROM cart_items WHERE product_id = ANY($1) GROUP BY product_id, bucket
     ),
     chat_series AS (
       SELECT product_id, bucket, COUNT(*)::float AS chat_n FROM (
         SELECT unnest(recommended_product_ids) AS product_id, date_trunc('hour', created_at) AS bucket
         FROM chat_messages WHERE recommended_product_ids IS NOT NULL
         UNION ALL
         SELECT unnest(recommended_product_ids) AS product_id, date_trunc('hour', created_at) AS bucket
         FROM widget_messages WHERE recommended_product_ids IS NOT NULL
       ) x WHERE product_id = ANY($1) GROUP BY product_id, bucket
     ),
     buckets AS (
       SELECT product_id, bucket FROM cart_series
       UNION
       SELECT product_id, bucket FROM chat_series
     )
     SELECT b.product_id, b.bucket,
            COALESCE(cs.cart_n, 0) AS cart_n,
            COALESCE(ch.chat_n, 0) AS chat_n
     FROM buckets b
     LEFT JOIN cart_series cs ON cs.product_id = b.product_id AND cs.bucket = b.bucket
     LEFT JOIN chat_series ch ON ch.product_id = b.product_id AND ch.bucket = b.bucket
     ORDER BY b.product_id, b.bucket ASC`,
    [productIds]
  );

  const byProduct = new Map<string, { cart: number[]; chat: number[] }>();
  for (const row of series) {
    const entry = byProduct.get(row.product_id) ?? { cart: [], chat: [] };
    entry.cart.push(Number(row.cart_n));
    entry.chat.push(Number(row.chat_n));
    byProduct.set(row.product_id, entry);
  }

  const result = products.map((p) => {
    const { cart, chat } = byProduct.get(p.id) ?? { cart: [Number(p.cart_adds)], chat: [Number(p.chat_mentions)] };
    const combinedSignal = cart.map((c, i) => c * 2 + chat[i]);

    // 1. Holt's linear trend forecast (unchanged from before).
    const forecast = holtLinearForecast(combinedSignal);

    // 2. Robust z-score per signal (in-sample reference window — this
    // product's own short history, not a 28-day lookback like the KB
    // assumes, since that history doesn't exist yet) + CUSUM.
    const chatLog = chat.map(log1p);
    const cartHasVariance = cart.length >= 2;
    const chatHasVariance = chat.length >= 2;

    const points: CusumPoint[] = combinedSignal.map((_, i) => {
      const cartZ = cartHasVariance ? robustZScore(cart[i], cart) : 0;
      const chatZ = chatHasVariance ? robustZScore(chatLog[i], chatLog) : 0;
      const wCart = cartHasVariance ? 0.6 : 0;
      const wChat = chatHasVariance ? 0.4 : 0;
      const wSum = wCart + wChat || 1;
      const dss = (cartZ * wCart + chatZ * wChat) / wSum;
      return { dss, zConfirm: cartZ };
    });
    const alarm = runCusum(points);

    return {
      ...p,
      forecastNextHour: Math.round(forecast.forecastNextPeriod * 10) / 10,
      trend: forecast.trend,
      trendValue: Math.round(forecast.trendValue * 100) / 100,
      dataPoints: forecast.dataPoints,
      alarmLevel: alarm.level,
      alarmLabel: alarm.levelLabel,
      cusum: alarm.cusum,
    };
  });

  return NextResponse.json({
    method:
      "Holt's linear trend method (next-hour forecast) + robust z-score/CUSUM spike detection (alarm level), both from the user's knowledge-base docs, scoped to the 2 real signals (cart adds, chat mentions) this project has, bucketed hourly. Not a sales forecast (no order history exists), and not the full 8-signal DSS (needs Google Trends/social/review/event/competitor data this project doesn't have).",
    products: result,
  });
}
