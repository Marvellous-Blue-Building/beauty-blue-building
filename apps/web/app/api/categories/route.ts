import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export interface CategoryCount {
  category: string;
  count: number;
}

/** Real distinct categories from the live catalog, ordered by how many products are in each. */
export async function GET() {
  const result = await pool.query<{ category: string; count: string }>(
    `SELECT category, count(*) FROM products
     WHERE category IS NOT NULL AND stock_quantity > 0
     GROUP BY category
     ORDER BY count(*) DESC`
  );
  const categories: CategoryCount[] = result.rows.map((r) => ({
    category: r.category,
    count: parseInt(r.count, 10),
  }));
  return NextResponse.json(categories);
}
