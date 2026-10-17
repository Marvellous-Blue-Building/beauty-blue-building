import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { listEvents } from "@/lib/events";
import { computeHistoricalUplift, estimateUpcomingUplift, type HistoricalEventForLookup } from "@/lib/analytics/event-uplift";
import { getCategoryHourlySeries, windowValues } from "@/lib/analytics/category-signal";

const CLEAN_WINDOW_DAYS = 56;
const PRE_WINDOW_DAYS = 7;

/**
 * Phase 3 "simulator skenario" — reuses the exact same real uplift engine
 * Phase 2 already ships (lib/analytics/event-uplift.ts), run interactively
 * for a hypothetical category/discount instead of a saved calendar event.
 * The "proyeksi nilai aktivitas" below is signal units × average category
 * price — an illustrative order-of-magnitude proxy, explicitly NOT a
 * revenue forecast (this project has no orders/transactions table).
 */
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const categoryFocus = req.nextUrl.searchParams.get("categoryFocus")?.trim();
  const subType = req.nextUrl.searchParams.get("subType")?.trim() || null;
  const discountPctParam = req.nextUrl.searchParams.get("discountPct");
  const discountPct = discountPctParam ? Number(discountPctParam) : null;

  if (!categoryFocus) return NextResponse.json({ error: "missing_categoryFocus" }, { status: 400 });

  const events = await listEvents();
  const series = await getCategoryHourlySeries(categoryFocus);

  const historicalForLookup: HistoricalEventForLookup[] = [];
  for (const event of events) {
    if (event.status !== "selesai" || event.categoryFocus !== categoryFocus) continue;
    const startsAt = new Date(event.startsAt);
    const endsAt = new Date(event.endsAt);
    const cleanFrom = new Date(startsAt.getTime() - (CLEAN_WINDOW_DAYS + PRE_WINDOW_DAYS) * 86400000);
    const cleanTo = new Date(startsAt.getTime() - PRE_WINDOW_DAYS * 86400000);
    const otherRanges = events.filter((e) => e.id !== event.id).map((e) => ({ start: new Date(e.startsAt), end: new Date(e.endsAt) }));
    const result = computeHistoricalUplift(windowValues(series, startsAt, endsAt), windowValues(series, cleanFrom, cleanTo, otherRanges));
    if (result.significant && result.upliftBersih !== null) {
      historicalForLookup.push({ subType: event.subType, discountPct: event.discountPct, upliftBersih: result.upliftBersih });
    }
  }

  const estimate = estimateUpcomingUplift({ subType, discountPct }, historicalForLookup);

  const { rows: priceRows } = await pool.query<{ avg_price: string | null }>(
    `SELECT AVG(price)::text AS avg_price FROM products WHERE category = $1`,
    [categoryFocus]
  );
  const avgPrice = priceRows[0]?.avg_price ? Number(priceRows[0].avg_price) : null;

  const recentWindow = windowValues(series, new Date(Date.now() - 7 * 86400000), new Date());
  const baselineSignal = recentWindow.length > 0 ? recentWindow.reduce((a, b) => a + b, 0) / recentWindow.length : 0;
  const projectedSignal = estimate.upliftEstimasi !== null ? baselineSignal * (1 + estimate.upliftEstimasi) : null;
  const projectedValueProxy = projectedSignal !== null && avgPrice !== null ? projectedSignal * avgPrice : null;

  return NextResponse.json({
    categoryFocus,
    subType,
    discountPct,
    historicalEventsUsed: historicalForLookup.length,
    upliftEstimasi: estimate.upliftEstimasi,
    basis: estimate.basis,
    baselineSignal: Math.round(baselineSignal * 100) / 100,
    avgPrice,
    projectedValueProxy,
    note: "Proyeksi nilai aktivitas = sinyal aktivitas (bukan unit terjual) × rata-rata harga kategori — indikasi skala, bukan forecast penjualan (tidak ada tabel order).",
  });
}
