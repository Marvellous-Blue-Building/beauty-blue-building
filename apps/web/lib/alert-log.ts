import { pool } from "@/lib/db";

/** Alert feedback loop — see data/17_alert_log.sql. Mirrors lib/tenant-boosts.ts's shape. */

export type AlertAction = "tindak_lanjut" | "diabaikan" | "salah_alarm";

export interface AlertLogRow {
  id: string;
  productId: string;
  alarmLevel: number;
  cusum: number;
  action: AlertAction;
  note: string | null;
  createdAt: string;
}

export async function logAlertAction(input: {
  productId: string;
  alarmLevel: number;
  cusum: number;
  action: AlertAction;
  note?: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO alert_log (product_id, alarm_level, cusum, action, note) VALUES ($1, $2, $3, $4, $5)`,
    [input.productId, input.alarmLevel, input.cusum, input.action, input.note || null]
  );
}

export async function getLatestAlertActions(productIds: string[]): Promise<Map<string, AlertLogRow>> {
  if (productIds.length === 0) return new Map();
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (product_id) id, product_id, alarm_level, cusum, action, note, created_at
     FROM alert_log WHERE product_id = ANY($1)
     ORDER BY product_id, created_at DESC`,
    [productIds]
  );
  const map = new Map<string, AlertLogRow>();
  for (const r of rows) {
    map.set(r.product_id, {
      id: r.id,
      productId: r.product_id,
      alarmLevel: r.alarm_level,
      cusum: Number(r.cusum),
      action: r.action,
      note: r.note,
      createdAt: r.created_at,
    });
  }
  return map;
}
