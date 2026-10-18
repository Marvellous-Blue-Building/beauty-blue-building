import { pool } from "@/lib/db";
import { listEvents } from "@/lib/events";

/** node-postgres hands back a native Date for DATE/TIMESTAMPTZ columns —
 * several of the types this file reads from (EventRow.startsAt, raw
 * `created_at`/`sale_date` query rows) are typed as `string` but aren't
 * one at runtime, so every date value gets normalized through this.
 * Keyed on the Jakarta calendar day: events start at 00:00 WIB, which in UTC
 * is still the previous day (9.9 would read as 2026-09-08). */
function dateKey(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

/**
 * Assembles the data block Vera Intelligence (app/api/admin/insight) hands
 * Gemini as grounding — sales totals per event day (demo_sales, see
 * data/22_demo_sales.sql), the event calendar, and recent demand-signal
 * alerts. Built fresh per request (cheap queries, no caching) so answers
 * always reflect the latest admin edits to the event calendar.
 */
export async function buildInsightContext(): Promise<string> {
  const [events, salesByEventDay, recentAlerts] = await Promise.all([
    listEvents(),
    pool.query<{ sale_date: string | Date; units: string; revenue: string }>(
      `SELECT sale_date, sum(units_sold) AS units, sum(revenue) AS revenue
         FROM demo_sales
        GROUP BY sale_date
        ORDER BY sale_date`
    ),
    pool.query<{
      created_at: string | Date;
      alarm_level: number;
      cusum: string;
      action: string;
      note: string | null;
      product_name: string;
    }>(
      `SELECT a.created_at, a.alarm_level, a.cusum, a.action, a.note, p.name AS product_name
         FROM alert_log a
         JOIN products p ON p.id = a.product_id
        ORDER BY a.created_at DESC
        LIMIT 10`
    ),
  ]);

  const salesByDate = new Map(salesByEventDay.rows.map((r) => [dateKey(r.sale_date), r]));
  const idr = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

  const eventLines = events.map((e) => {
    const key = dateKey(e.startsAt);
    const sales = salesByDate.get(key);
    const salesPart = sales
      ? `${sales.units} unit, ${idr(Number(sales.revenue))} revenue`
      : "belum ada data penjualan";
    return (
      `- ${e.name} (${key}, ${e.type}): diskon ${e.discountPct ?? "-"}%, ` +
      `ad budget ${e.adBudget != null ? idr(e.adBudget) : "belum dialokasikan"}, status ${e.status}. ` +
      `Penjualan hari-H: ${salesPart}.` +
      (e.notes ? ` Catatan: ${e.notes}` : "")
    );
  });

  const alertLines = recentAlerts.rows.map(
    (a) =>
      `- ${dateKey(a.created_at)} — ${a.product_name}: alarm level ${a.alarm_level} (CUSUM ${a.cusum}), ` +
      `aksi "${a.action}"${a.note ? `. Catatan: ${a.note}` : ""}`
  );

  return [
    "Kalender event & performa penjualan tenant:",
    eventLines.length ? eventLines.join("\n") : "(belum ada event tercatat)",
    "",
    "Demand-signal alerts terbaru:",
    alertLines.length ? alertLines.join("\n") : "(belum ada alert)",
  ].join("\n");
}
