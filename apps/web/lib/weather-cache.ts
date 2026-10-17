import { pool } from "@/lib/db";
import type { CurrentWeather } from "@/lib/weather-client";

/**
 * Latest weather ping per user, stored on the `users` row (see
 * data/21_user_latest_weather.sql) instead of a Redis key — weather is
 * still never treated as durable history, just the most recent reading,
 * aged out after WEATHER_TTL_SECONDS the same way the Redis key used to
 * expire.
 */

// Slightly longer than the 5-minute poll interval so a single delayed/
// missed ping doesn't make the cache look empty.
const WEATHER_TTL_SECONDS = 10 * 60;

export async function setLatestWeather(userId: string, weather: CurrentWeather): Promise<void> {
  await pool.query(
    `UPDATE users SET last_weather = $2, last_weather_updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [userId, JSON.stringify(weather)]
  );
}

export async function getLatestWeather(userId: string): Promise<CurrentWeather | null> {
  const result = await pool.query<{
    last_weather: CurrentWeather | null;
    last_weather_updated_at: string | null;
  }>("SELECT last_weather, last_weather_updated_at FROM users WHERE id = $1", [userId]);

  const row = result.rows[0];
  if (!row?.last_weather || !row.last_weather_updated_at) return null;

  const ageSeconds = (Date.now() - new Date(row.last_weather_updated_at).getTime()) / 1000;
  if (ageSeconds > WEATHER_TTL_SECONDS) return null;

  return row.last_weather;
}
