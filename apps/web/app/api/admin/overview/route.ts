import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth/admin-session";

/**
 * Overview dashboard data — every number is read from the database, nothing
 * is sample data. Daily series cover the last 30 days in Asia/Jakarta time
 * (zero-filled), so the client can slice 7/14/30-day ranges and compute
 * week-over-week deltas without another round trip.
 */
const DAYS = 30;

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [products, boosts, sessions, conversations, messages, totals, daily, categories, recent] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE stock_quantity > 5)::int AS in_stock,
              count(*) FILTER (WHERE stock_quantity BETWEEN 1 AND 5)::int AS low_stock,
              count(*) FILTER (WHERE stock_quantity <= 0 OR stock_quantity IS NULL)::int AS out_of_stock
       FROM products`
    ),
    pool.query(`SELECT count(*)::int AS n FROM tenant_boosts WHERE active`),
    pool.query(`SELECT count(*)::int AS n FROM widget_sessions`),
    pool.query(`SELECT count(*)::int AS n FROM widget_conversations`),
    pool.query(`SELECT count(*)::int AS n FROM widget_messages`),
    pool.query(
      `SELECT (SELECT count(*) FROM chat_messages)::int + (SELECT count(*) FROM widget_messages)::int AS chat_messages,
              (SELECT count(*) FROM scan_results)::int AS scans,
              (SELECT count(*) FROM users)::int AS users`
    ),
    pool.query(
      `WITH days AS (
         SELECT generate_series(
           (now() AT TIME ZONE 'Asia/Jakarta')::date - ($1::int - 1),
           (now() AT TIME ZONE 'Asia/Jakarta')::date,
           interval '1 day'
         )::date AS day
       ),
       chats AS (
         SELECT (created_at AT TIME ZONE 'Asia/Jakarta')::date AS day, count(*) AS n FROM (
           SELECT created_at FROM chat_messages
           UNION ALL
           SELECT created_at FROM widget_messages
         ) m GROUP BY 1
       ),
       scans AS (
         SELECT (created_at AT TIME ZONE 'Asia/Jakarta')::date AS day, count(*) AS n FROM scan_results GROUP BY 1
       ),
       signups AS (
         SELECT (created_at AT TIME ZONE 'Asia/Jakarta')::date AS day, count(*) AS n FROM users GROUP BY 1
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              COALESCE(c.n, 0)::int AS chats,
              COALESCE(s.n, 0)::int AS scans,
              COALESCE(u.n, 0)::int AS users
       FROM days d
       LEFT JOIN chats c ON c.day = d.day
       LEFT JOIN scans s ON s.day = d.day
       LEFT JOIN signups u ON u.day = d.day
       ORDER BY d.day`,
      [DAYS]
    ),
    pool.query(
      `SELECT COALESCE(category, 'lainnya') AS category, count(*)::int AS n
       FROM products GROUP BY 1 ORDER BY 2 DESC LIMIT 5`
    ),
    pool.query(
      `SELECT id, name, brand, sku, price, stock_quantity, image_url, updated_at
       FROM products ORDER BY updated_at DESC NULLS LAST LIMIT 25`
    ),
  ]);

  return NextResponse.json({
    totalProducts: products.rows[0].n,
    inStockProducts: products.rows[0].in_stock + products.rows[0].low_stock,
    stock: {
      inStock: products.rows[0].in_stock,
      lowStock: products.rows[0].low_stock,
      outOfStock: products.rows[0].out_of_stock,
    },
    activeBoosts: boosts.rows[0].n,
    widgetSessions: sessions.rows[0].n,
    widgetConversations: conversations.rows[0].n,
    widgetMessages: messages.rows[0].n,
    totals: totals.rows[0],
    daily: daily.rows,
    categories: categories.rows,
    recentProducts: recent.rows,
  });
}
