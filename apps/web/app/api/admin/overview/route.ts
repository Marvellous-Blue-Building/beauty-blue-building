import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth/admin-session";

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [products, boosts, sessions, conversations, messages] = await Promise.all([
    pool.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE stock_quantity > 0)::int AS in_stock FROM products`),
    pool.query(`SELECT count(*)::int AS n FROM tenant_boosts WHERE active`),
    pool.query(`SELECT count(*)::int AS n FROM widget_sessions`),
    pool.query(`SELECT count(*)::int AS n FROM widget_conversations`),
    pool.query(`SELECT count(*)::int AS n FROM widget_messages`),
  ]);

  return NextResponse.json({
    totalProducts: products.rows[0].n,
    inStockProducts: products.rows[0].in_stock,
    activeBoosts: boosts.rows[0].n,
    widgetSessions: sessions.rows[0].n,
    widgetConversations: conversations.rows[0].n,
    widgetMessages: messages.rows[0].n,
  });
}
