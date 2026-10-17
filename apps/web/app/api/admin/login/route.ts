import { NextRequest, NextResponse } from "next/server";
import { checkAdminPassword, ADMIN_COOKIE } from "@/lib/auth/admin-session";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { password?: string } | null;
  if (!body?.password) {
    return NextResponse.json({ error: "missing_password" }, { status: 400 });
  }
  const token = checkAdminPassword(body.password);
  if (!token) {
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
