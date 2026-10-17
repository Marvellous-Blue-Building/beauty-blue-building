import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { holtLinearForecast } from "@/lib/analytics/holt-forecast";
import { robustZScore } from "@/lib/analytics/robust-zscore";
import { runCusum, type CusumPoint } from "@/lib/analytics/cusum";
import { getSmtpTransporter, smtpFromAddress } from "@/lib/email/smtp-client";

/**
 * Phase 3 "alert dikirim ke supply chain dan marketing dalam hari yang
 * sama" (Demand Signal System.md, "Aturan aksi & alert"). Manually
 * triggered by the admin per the KB's own design principle ("manusia
 * tetap memutuskan aksi di atas nilai tertentu") — this project has no
 * scheduler/cron, so there is no automatic daily run to hook into, and an
 * unsolicited automatic email would be dishonest about what's actually
 * running. Single-admin app (lib/auth/admin-session.ts) — sent to the
 * same mailbox SMTP is configured with, no separate recipient to manage.
 */
function log1p(x: number): number {
  return Math.log(1 + Math.max(0, x));
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { productId?: string } | null;
  if (!body?.productId) return NextResponse.json({ error: "missing_productId" }, { status: 400 });

  const { rows: productRows } = await pool.query(
    `SELECT id, name, brand, stock_quantity FROM products WHERE id = $1`,
    [body.productId]
  );
  if (productRows.length === 0) return NextResponse.json({ error: "product_not_found" }, { status: 404 });
  const product = productRows[0];

  const { rows: series } = await pool.query(
    `WITH cart_series AS (
       SELECT date_trunc('hour', added_at) AS bucket, COUNT(*)::float AS cart_n
       FROM cart_items WHERE product_id = $1 GROUP BY bucket
     ),
     chat_series AS (
       SELECT bucket, COUNT(*)::float AS chat_n FROM (
         SELECT unnest(recommended_product_ids) AS product_id, date_trunc('hour', created_at) AS bucket
         FROM chat_messages WHERE recommended_product_ids IS NOT NULL
         UNION ALL
         SELECT unnest(recommended_product_ids) AS product_id, date_trunc('hour', created_at) AS bucket
         FROM widget_messages WHERE recommended_product_ids IS NOT NULL
       ) x WHERE product_id = $1 GROUP BY bucket
     ),
     buckets AS (SELECT bucket FROM cart_series UNION SELECT bucket FROM chat_series)
     SELECT b.bucket, COALESCE(cs.cart_n, 0) AS cart_n, COALESCE(ch.chat_n, 0) AS chat_n
     FROM buckets b
     LEFT JOIN cart_series cs ON cs.bucket = b.bucket
     LEFT JOIN chat_series ch ON ch.bucket = b.bucket
     ORDER BY b.bucket ASC`,
    [body.productId]
  );

  const cart = series.map((r) => Number(r.cart_n));
  const chat = series.map((r) => Number(r.chat_n));
  const combinedSignal = cart.map((c, i) => c * 2 + chat[i]);
  const forecast = holtLinearForecast(combinedSignal);

  const chatLog = chat.map(log1p);
  const cartHasVariance = cart.length >= 2;
  const chatHasVariance = chat.length >= 2;
  const points: CusumPoint[] = combinedSignal.map((_, i) => {
    const cartZ = cartHasVariance ? robustZScore(cart[i], cart) : 0;
    const chatZ = chatHasVariance ? robustZScore(chatLog[i], chatLog) : 0;
    const wCart = cartHasVariance ? 0.6 : 0;
    const wChat = chatHasVariance ? 0.4 : 0;
    const wSum = wCart + wChat || 1;
    return { dss: (cartZ * wCart + chatZ * wChat) / wSum, zConfirm: cartZ };
  });
  const alarm = runCusum(points);

  const hoursOfStockLeft = forecast.forecastNextPeriod > 0 ? Math.round((product.stock_quantity / forecast.forecastNextPeriod) * 10) / 10 : null;

  const subject = `[${alarm.levelLabel.toUpperCase()}] ${product.name} — alert demand signal`;
  const text = `[${alarm.levelLabel}] ${product.name}${product.brand ? ` (${product.brand})` : ""}
Skor sinyal (cart+chat) saat ini: ${combinedSignal[combinedSignal.length - 1] ?? 0} · CUSUM ${alarm.cusum}
Forecast jam depan: ${Math.round(forecast.forecastNextPeriod * 10) / 10} (tren: ${forecast.trend})
Stok gudang: ${product.stock_quantity} unit${hoursOfStockLeft !== null ? ` ≈ ${hoursOfStockLeft} jam pada laju saat ini` : ""}
Titik data: ${forecast.dataPoints} jam — ${forecast.dataPoints < 3 ? "keandalan rendah, data masih tipis" : "cukup untuk tren awal"}

Dikirim manual dari tenant dashboard (Forecasting > Activity Forecast & Alert).`;

  await getSmtpTransporter().sendMail({
    from: smtpFromAddress(),
    to: smtpFromAddress(),
    subject,
    text,
  });

  return NextResponse.json({ ok: true });
}
