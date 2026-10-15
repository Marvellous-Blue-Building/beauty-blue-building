import { getMostRecentLocation } from "@/lib/location-cache";

/**
 * Calls services/geotagging-weather's combined holiday+weather formula for
 * this user's last known location (cached every 5 minutes by
 * components/layout/LocationTracker.tsx → app/api/profile/location/route.ts).
 * Used to ground both chat replies and routine/diagnose-report product
 * matching in what day it is and what the weather's doing — see
 * lib/matching-client.ts's callers.
 */

const GEOTAGGING_WEATHER_SERVICE_URL = process.env.GEOTAGGING_WEATHER_SERVICE_URL ?? "http://localhost:8010";

export interface EnvironmentalContext {
  guidanceText: string;
  boostKeywords: string[];
}

interface GeotaggingWeatherResponse {
  guidance_text: string;
  boost_keywords: string[];
}

/** Best-effort: an unreachable service just means "no environmental context
 * this time" — never block the chat reply or product match that's waiting
 * on this. A missing cached location (denied/revoked geolocation
 * permission, or never granted) still calls the service — it falls back
 * to its date/time + Indonesia holiday formula with weather omitted,
 * rather than nothing at all. */
export async function getEnvironmentalContext(userId: string): Promise<EnvironmentalContext | null> {
  const location = await getMostRecentLocation(userId);
  const query = location ? `?lat=${location.latitude}&lon=${location.longitude}` : "";

  try {
    const res = await fetch(`${GEOTAGGING_WEATHER_SERVICE_URL}/context${query}`);
    if (!res.ok) return null;
    const data = (await res.json()) as GeotaggingWeatherResponse;
    return { guidanceText: data.guidance_text, boostKeywords: data.boost_keywords };
  } catch (error) {
    console.error("Failed to fetch environmental context:", error);
    return null;
  }
}
