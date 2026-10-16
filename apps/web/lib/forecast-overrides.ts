import { pool } from "@/lib/db";

/** Manual forecast override, mandatory reason — see data/18_forecast_overrides.sql. */

export interface ForecastOverrideRow {
  id: string;
  productId: string;
  overrideValue: number;
  reason: string;
  createdAt: string;
}

export async function createOverride(input: { productId: string; overrideValue: number; reason: string }): Promise<void> {
  await pool.query(`INSERT INTO forecast_overrides (product_id, override_value, reason) VALUES ($1, $2, $3)`, [
    input.productId,
    input.overrideValue,
    input.reason,
  ]);
}

export async function getLatestOverride(productId: string): Promise<ForecastOverrideRow | null> {
  const { rows } = await pool.query(
    `SELECT id, product_id, override_value, reason, created_at FROM forecast_overrides
     WHERE product_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [productId]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return { id: r.id, productId: r.product_id, overrideValue: Number(r.override_value), reason: r.reason, createdAt: r.created_at };
}

export async function listOverrideHistory(productId: string): Promise<ForecastOverrideRow[]> {
  const { rows } = await pool.query(
    `SELECT id, product_id, override_value, reason, created_at FROM forecast_overrides
     WHERE product_id = $1 ORDER BY created_at DESC`,
    [productId]
  );
  return rows.map((r) => ({ id: r.id, productId: r.product_id, overrideValue: Number(r.override_value), reason: r.reason, createdAt: r.created_at }));
}
