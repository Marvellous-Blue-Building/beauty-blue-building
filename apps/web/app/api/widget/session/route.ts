import { NextResponse } from "next/server";
import { createWidgetSession } from "@/lib/widget/session";

/** POST /api/widget/session — creates a new anonymous widget session.
 * Called once by the embed script when no session id is cached in the
 * visitor's localStorage. Public, unauthenticated, no origin check needed
 * (nothing secret — mirrors Ganes' public config endpoint). */
export async function POST() {
  const sessionId = await createWidgetSession();
  return NextResponse.json({ sessionId });
}
