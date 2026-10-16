import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { logAlertAction, type AlertAction } from "@/lib/alert-log";

const VALID_ACTIONS: AlertAction[] = ["tindak_lanjut", "diabaikan", "salah_alarm"];

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    productId?: string;
    alarmLevel?: number;
    cusum?: number;
    action?: string;
    note?: string;
  } | null;

  if (!body?.productId) return NextResponse.json({ error: "missing_productId" }, { status: 400 });
  if (!body.action || !VALID_ACTIONS.includes(body.action as AlertAction)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  await logAlertAction({
    productId: body.productId,
    alarmLevel: body.alarmLevel ?? 0,
    cusum: body.cusum ?? 0,
    action: body.action as AlertAction,
    note: body.note,
  });
  return NextResponse.json({ ok: true });
}
