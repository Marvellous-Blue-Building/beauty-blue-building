import { pool } from "@/lib/db";

/** Shared by Phase 2 (event uplift) and Phase 3 (what-if simulator) — the
 * same hourly cart+chat signal query, scoped to one product category, so
 * both features compare against the exact same real numbers instead of
 * two slightly different derivations. */

export interface SeriesPoint {
  bucket: Date;
  value: number;
}

export async function getCategoryHourlySeries(category: string): Promise<SeriesPoint[]> {
  const { rows } = await pool.query(
    `WITH cart_series AS (
       SELECT date_trunc('hour', ci.added_at) AS bucket, COUNT(*)::float AS cart_n
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       WHERE p.category = $1
       GROUP BY bucket
     ),
     chat_series AS (
       SELECT bucket, COUNT(*)::float AS chat_n FROM (
         SELECT date_trunc('hour', created_at) AS bucket, unnest(recommended_product_ids) AS product_id
         FROM chat_messages WHERE recommended_product_ids IS NOT NULL
         UNION ALL
         SELECT date_trunc('hour', created_at) AS bucket, unnest(recommended_product_ids) AS product_id
         FROM widget_messages WHERE recommended_product_ids IS NOT NULL
       ) x JOIN products p ON p.id = x.product_id
       WHERE p.category = $1
       GROUP BY bucket
     ),
     buckets AS (
       SELECT bucket FROM cart_series
       UNION
       SELECT bucket FROM chat_series
     )
     SELECT b.bucket,
            COALESCE(cs.cart_n, 0) * 2 + COALESCE(ch.chat_n, 0) AS value
     FROM buckets b
     LEFT JOIN cart_series cs ON cs.bucket = b.bucket
     LEFT JOIN chat_series ch ON ch.bucket = b.bucket
     ORDER BY b.bucket ASC`,
    [category]
  );
  return rows.map((r) => ({ bucket: new Date(r.bucket), value: Number(r.value) }));
}

export function windowValues(
  series: SeriesPoint[],
  from: Date,
  to: Date,
  excludeRanges: { start: Date; end: Date }[] = []
): number[] {
  return series
    .filter(
      (p) =>
        p.bucket >= from &&
        p.bucket <= to &&
        !excludeRanges.some((r) => p.bucket >= r.start && p.bucket <= r.end)
    )
    .map((p) => p.value);
}
