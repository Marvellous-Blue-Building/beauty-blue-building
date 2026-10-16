import { pool } from "@/lib/db";

/** Tenant-curated merchandising/trend boosts — reuses the exact same
 * ranking-only `boostKeywords` plumbing that services/matching-service
 * already accepts for weather/holiday boosts (see
 * lib/geotagging-weather-client.ts's EnvironmentalContext). A keyword is
 * never an admission gate, only a +weight re-rank hit (see
 * chat_pipeline.py / match_routine.py) — repeating it `weight` times is
 * the simplest way to plug a weight into an API that only takes a flat
 * list, no Python changes needed. */
export async function getActiveTenantBoostKeywords(): Promise<string[]> {
  const { rows } = await pool.query<{ keyword: string; weight: number }>(
    `SELECT keyword, weight FROM tenant_boosts
     WHERE active AND (starts_at IS NULL OR starts_at <= now())
       AND (ends_at IS NULL OR ends_at >= now())`
  );
  return rows.flatMap((r) => Array(r.weight).fill(r.keyword));
}

export interface TenantBoostRow {
  id: string;
  keyword: string;
  category: string | null;
  sku: string | null;
  weight: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export async function listTenantBoosts(): Promise<TenantBoostRow[]> {
  const { rows } = await pool.query(
    `SELECT id, keyword, category, sku, weight, active, starts_at, ends_at, created_at
     FROM tenant_boosts ORDER BY created_at DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    keyword: r.keyword,
    category: r.category,
    sku: r.sku,
    weight: r.weight,
    active: r.active,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    createdAt: r.created_at,
  }));
}
