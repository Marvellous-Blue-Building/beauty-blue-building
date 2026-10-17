import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { reverseGeocode } from "@/lib/geocode";
import { pushRecentLocation } from "@/lib/location-cache";
import { fetchCurrentWeather } from "@/lib/weather-client";
import { setLatestWeather } from "@/lib/weather-cache";

/**
 * Receives one geolocation ping from components/layout/LocationTracker.tsx
 * (the browser's own navigator.geolocation, polled every 5 minutes while
 * "Get Realtime Location" is on) and writes it straight to the user's row
 * in Postgres.
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

  // Re-fetched every ping (every 5 minutes); see lib/weather-cache.ts for
  // how long a reading stays fresh before a reader treats it as stale.
  const weather = await fetchCurrentWeather(latitude, longitude);
  if (weather) {
    await setLatestWeather(user.id, weather);
  }

  return NextResponse.json({ address, weather, dbSynced: true });
}
