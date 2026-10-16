import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { createOverride, listOverrideHistory } from "@/lib/forecast-overrides";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const productId = req.nextUrl.searchParams.get("productId");
  if (!productId) return NextResponse.json({ error: "missing_productId" }, { status: 400 });
  return NextResponse.json({ history: await listOverrideHistory(productId) });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { productId?: string; overrideValue?: number; reason?: string } | null;
  if (!body?.productId) return NextResponse.json({ error: "missing_productId" }, { status: 400 });
  if (body.overrideValue === undefined || body.overrideValue === null) return NextResponse.json({ error: "missing_overrideValue" }, { status: 400 });
  if (!body.reason?.trim()) return NextResponse.json({ error: "missing_reason" }, { status: 400 });

  await createOverride({ productId: body.productId, overrideValue: body.overrideValue, reason: body.reason.trim() });
  return NextResponse.json({ ok: true });
}
