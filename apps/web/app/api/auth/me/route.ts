import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";

/** Returns the current session's user, or null if not logged in (200 either way — this is a "check" endpoint, not a protected one). */
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json(user);
}
