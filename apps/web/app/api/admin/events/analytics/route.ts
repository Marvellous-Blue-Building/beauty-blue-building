import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { listEvents, type EventRow } from "@/lib/events";
import { computeHistoricalUplift, estimateUpcomingUplift, type HistoricalEventForLookup } from "@/lib/analytics/event-uplift";
import { getCategoryHourlySeries, windowValues, type SeriesPoint } from "@/lib/analytics/category-signal";

/**
 * Phase 2 analytics — Modul 2 (historical uplift), Modul 3 (upcoming
 * uplift lookup), Modul 4 (promo-code attribution, Lapis 1 + Lapis 3).
 * See apps/web/Event, Promo, Uplift & Attribution.md and
 * apps/web/lib/analytics/event-uplift.ts for exactly which tiers of the
 * spec this implements vs. explicitly leaves as roadmap.
 */

const CLEAN_WINDOW_DAYS = 56;
const PRE_WINDOW_DAYS = 7;

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const events = await listEvents();
  const now = new Date();

  const categories = [...new Set(events.map((e) => e.categoryFocus).filter((c): c is string => !!c))];
  const seriesByCategory = new Map<string, SeriesPoint[]>();
  for (const category of categories) {
    seriesByCategory.set(category, await getCategoryHourlySeries(category));
  }

  // Modul 2: historical uplift for finished events.
  const upliftByEventId = new Map<string, ReturnType<typeof computeHistoricalUplift>>();
  for (const event of events) {
    if (event.status !== "selesai" || !event.categoryFocus) continue;
    const series = seriesByCategory.get(event.categoryFocus) ?? [];
    const startsAt = new Date(event.startsAt);
    const endsAt = new Date(event.endsAt);
    const cleanFrom = new Date(startsAt.getTime() - (CLEAN_WINDOW_DAYS + PRE_WINDOW_DAYS) * 86400000);
    const cleanTo = new Date(startsAt.getTime() - PRE_WINDOW_DAYS * 86400000);
    const otherEventRanges = events
      .filter((e) => e.id !== event.id)
      .map((e) => ({ start: new Date(e.startsAt), end: new Date(e.endsAt) }));

    const eventWindow = windowValues(series, startsAt, endsAt);
    const cleanWindow = windowValues(series, cleanFrom, cleanTo, otherEventRanges);
    upliftByEventId.set(event.id, computeHistoricalUplift(eventWindow, cleanWindow));
  }

  // Modul 3: lookup-table estimate for upcoming (not-yet-started) planned events.
  const historicalForLookup: HistoricalEventForLookup[] = events
    .filter((e) => e.status === "selesai" && upliftByEventId.get(e.id)?.significant && upliftByEventId.get(e.id)?.upliftBersih !== null)
    .map((e) => ({
      subType: e.subType,
      discountPct: e.discountPct,
      upliftBersih: upliftByEventId.get(e.id)!.upliftBersih as number,
    }));

  const upcomingEstimateByEventId = new Map<string, ReturnType<typeof estimateUpcomingUplift>>();
  for (const event of events) {
    if (!["rencana", "disetujui"].includes(event.status) || new Date(event.startsAt) <= now) continue;
    upcomingEstimateByEventId.set(event.id, estimateUpcomingUplift({ subType: event.subType, discountPct: event.discountPct }, historicalForLookup));
  }

  // Modul 4: promo-code attribution (Lapis 1 deterministic — exact code match — + Lapis 3 "organik" fallback).
  const attributionByEventId = new Map<string, { sessions: number; mentions: number; costPerSession: number | null }>();
  for (const event of events) {
    if (!event.promoCode) continue;
    const { rows: sessionRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM widget_sessions WHERE promo_code = $1`,
      [event.promoCode]
    );
    const { rows: mentionRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM widget_messages wm
       JOIN widget_conversations wc ON wc.id = wm.conversation_id
       JOIN widget_sessions ws ON ws.id = wc.session_id
       WHERE ws.promo_code = $1 AND wm.recommended_product_ids IS NOT NULL`,
      [event.promoCode]
    );
    const sessions = Number(sessionRows[0].count);
    const mentions = Number(mentionRows[0].count);
    attributionByEventId.set(event.id, {
      sessions,
      mentions,
      costPerSession: event.adBudget && sessions > 0 ? event.adBudget / sessions : null,
    });
  }

  const { rows: totalSessionRows } = await pool.query<{ total: string; organik: string }>(
    `SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE promo_code IS NULL)::text AS organik FROM widget_sessions`
  );

  const result = events.map((event: EventRow) => ({
    ...event,
    historicalUplift: upliftByEventId.get(event.id) ?? null,
    upcomingUplift: upcomingEstimateByEventId.get(event.id) ?? null,
    attribution: attributionByEventId.get(event.id) ?? null,
  }));

  return NextResponse.json({
    method:
      "Uplift historis: Tingkat C (rasio ke median jendela bersih 8 minggu) atas sinyal cart+chat per kategori. Uplift mendatang: lookup table median per sub-tipe (Tahap 1), tanpa faktor skala pengunjung (data tidak tersedia). Attribution: kode promo unik (Lapis 1) + sisa sesi tanpa kode dilaporkan sebagai organik (Lapis 3) — belum ada multi-touch attribution atau geo holdout.",
    events: result,
    attributionSummary: {
      totalSessions: Number(totalSessionRows[0].total),
      organikSessions: Number(totalSessionRows[0].organik),
    },
  });
}
