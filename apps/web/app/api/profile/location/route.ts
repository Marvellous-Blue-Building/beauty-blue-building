import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { reverseGeocode } from "@/lib/geocode";
import { claimDbFlush, getMostRecentLocation, pushRecentLocation } from "@/lib/location-cache";

/**
 * Receives one geolocation ping from components/layout/LocationTracker.tsx
 * (the browser's own navigator.geolocation, polled every 5 minutes while
 * "Get Realtime Location" is on). Every ping is cheap and always goes to
 * Redis, which only ever keeps the latest 5 (older ones are erased) — only
 * one ping per rolling hour is actually flushed to Postgres, and that
 * flush always uses whatever Redis currently considers the latest entry,
 * not necessarily this exact request's own payload.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Never trust a stale client timer alone — a tick that fires right after
  // the user disables the toggle (or a response to an older toggle state)
  // shouldn't still persist a position.
  if (!user.realtimeLocationEnabled) {
    return NextResponse.json({ skipped: true });
  }

  const { latitude, longitude } = (await request.json()) as {
    latitude?: number;
    longitude?: number;
  };
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return NextResponse.json({ error: "Missing latitude/longitude." }, { status: 400 });
  }

  const address = await reverseGeocode(latitude, longitude);
  await pushRecentLocation(user.id, { latitude, longitude, address, capturedAt: new Date().toISOString() });

  let dbSynced = false;
  if (await claimDbFlush(user.id)) {
    const latest = await getMostRecentLocation(user.id);
    if (latest) {
      await pool.query(
        `UPDATE users
           SET last_latitude = $2, last_longitude = $3, last_address = $4, location_updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [user.id, latest.latitude, latest.longitude, latest.address]
      );
      dbSynced = true;
    }
  }

  return NextResponse.json({ address, dbSynced });
}
