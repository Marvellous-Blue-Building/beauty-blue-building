import { NextRequest, NextResponse } from "next/server";
import { createWidgetSession } from "@/lib/widget/session";

/** POST /api/widget/session — creates a new anonymous widget session.
 * Called once by the embed script when no session id is cached in the
 * visitor's localStorage. Public, unauthenticated, no origin check needed
 * (nothing secret — mirrors Ganes' public config endpoint).
 *
 * Optional `promoCode` in the body — the widget loader's best-effort read
 * of the retailer page's own `?promo=` param (Phase 2 attribution). */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { promoCode?: string } | null;
  const sessionId = await createWidgetSession(body?.promoCode?.trim() || null);
  return NextResponse.json({ sessionId });
}
