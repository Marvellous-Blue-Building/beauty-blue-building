import { NextResponse } from "next/server";
import { serverStore } from "@/lib/server-store";

/** Returns the last routine computed by POST /api/match-routine, so a refresh of /routine doesn't lose it. */
export async function GET() {
  return NextResponse.json(serverStore.latestRoutine);
}
