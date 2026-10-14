import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export interface PriceRange {
  min: number;
  max: number;
}

/** Real cheapest/priciest in-stock products — backs the questionnaire's budget slider so its scale always matches the live catalog, in Rupiah. */
export async function GET() {
  const result = await pool.query<{ min: string | null; max: string | null }>(
    `SELECT MIN(price) AS min, MAX(price) AS max FROM products WHERE price > 0 AND stock_quantity > 0`
  );
  const row = result.rows[0];
  const range: PriceRange = {
    min: row?.min ? Math.floor(parseFloat(row.min) / 1000) * 1000 : 0,
    max: row?.max ? Math.ceil(parseFloat(row.max) / 1000) * 1000 : 1000000,
  };
  return NextResponse.json(range);
}
