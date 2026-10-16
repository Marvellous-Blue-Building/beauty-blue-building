import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { listEvents, createEvent } from "@/lib/events";

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ events: await listEvents() });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    type?: string;
    subType?: string;
    startsAt?: string;
    endsAt?: string;
    categoryFocus?: string;
    discountPct?: number;
    adBudget?: number;
    promoCode?: string;
    status?: string;
    notes?: string;
  } | null;

  if (!body?.name?.trim()) return NextResponse.json({ error: "missing_name" }, { status: 400 });
  if (!body.type?.trim()) return NextResponse.json({ error: "missing_type" }, { status: 400 });
  if (!body.startsAt || !body.endsAt) return NextResponse.json({ error: "missing_dates" }, { status: 400 });

  try {
    await createEvent({
      name: body.name.trim(),
      type: body.type.trim(),
      subType: body.subType?.trim() || null,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      categoryFocus: body.categoryFocus?.trim() || null,
      discountPct: body.discountPct ?? null,
      adBudget: body.adBudget ?? null,
      promoCode: body.promoCode?.trim() || null,
      status: (body.status as "rencana" | "disetujui" | "berjalan" | "selesai" | "batal") ?? "rencana",
      notes: body.notes?.trim() || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("event_calendar_promo_code_key")) {
      return NextResponse.json({ error: "promo_code_taken" }, { status: 409 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}
