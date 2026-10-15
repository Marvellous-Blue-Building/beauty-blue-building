import { redis } from "@/lib/redis";
import type { CurrentWeather } from "@/lib/weather-client";

/**
 * Redis cache for the latest weather ping per user (see
 * app/api/profile/location/route.ts). Weather is never persisted to
 * Postgres — it's ephemeral, re-fetched every 5 minutes alongside the
 * user's location — so services/geotagging-weather's formula (and
 * anything else reading it) always reads the latest cached value here.
 */

// Slightly longer than the 5-minute poll interval so a single delayed/
// missed ping doesn't make the cache look empty.
const WEATHER_TTL_SECONDS = 10 * 60;

function weatherKey(userId: string): string {
  return `weather:latest:${userId}`;
}

export async function setLatestWeather(userId: string, weather: CurrentWeather): Promise<void> {
  await redis.set(weatherKey(userId), JSON.stringify(weather), "EX", WEATHER_TTL_SECONDS);
}

export async function getLatestWeather(userId: string): Promise<CurrentWeather | null> {
  const raw = await redis.get(weatherKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CurrentWeather;
  } catch {
    return null;
  }
}
