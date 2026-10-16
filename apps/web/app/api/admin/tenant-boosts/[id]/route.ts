import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth/admin-session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { active?: boolean } | null;
  if (typeof body?.active !== "boolean") return NextResponse.json({ error: "missing_active" }, { status: 400 });
  await pool.query(`UPDATE tenant_boosts SET active = $2, updated_at = now() WHERE id = $1`, [id, body.active]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await pool.query(`DELETE FROM tenant_boosts WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
