import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { listTenantBoosts } from "@/lib/tenant-boosts";

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ boosts: await listTenantBoosts() });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    keyword?: string;
    category?: string;
    weight?: number;
  } | null;
  if (!body?.keyword?.trim()) return NextResponse.json({ error: "missing_keyword" }, { status: 400 });

  await pool.query(
    `INSERT INTO tenant_boosts (keyword, category, weight) VALUES ($1, $2, $3)`,
    [body.keyword.trim(), body.category?.trim() || null, Math.min(5, Math.max(1, body.weight ?? 3))]
  );
  return NextResponse.json({ ok: true });
}
