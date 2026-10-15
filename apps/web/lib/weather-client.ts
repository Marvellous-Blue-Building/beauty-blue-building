/**
 * Calls the real weather API (lat/long based) — used by
 * app/api/profile/location/route.ts on every 5-minute geolocation ping, so
 * services/geotagging-weather's formula always has current conditions for
 * wherever the user actually is right now.
 */

export interface CurrentWeather {
  condition: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  observedAt: string;
}

interface EwalabsForecastEntry {
  local_datetime: string; // "YYYY-MM-DD HH:MM:SS"
  temperature: number;
  weather: string;
  humidity: number;
  wind_speed: number;
  wind_direction: string;
}

interface EwalabsResponse {
  status: string;
  data?: {
    forecast?: EwalabsForecastEntry[];
  };
}

// The API's local_datetime strings have no timezone suffix, but they're
// wall-clock time in Indonesia (WIB, UTC+7, no DST) — not the timezone of
// whatever machine this code happens to run on. Appending the explicit
// offset before parsing makes `new Date(...)` produce the correct absolute
// instant regardless of the server's own ambient timezone; without it,
// entries up to 3 hours apart (the API's own forecast granularity) could
// get misjudged as "closest to now" by the server/API timezone gap.
const JAKARTA_OFFSET = "+07:00";

function parseLocalDatetime(localDatetime: string): number {
  return new Date(`${localDatetime.replace(" ", "T")}${JAKARTA_OFFSET}`).getTime();
}

/** Picks whichever forecast slot's local_datetime is closest to now — the API returns a rolling multi-hour forecast, not a single "current conditions" field. */
function closestToNow(forecast: EwalabsForecastEntry[]): EwalabsForecastEntry {
  const now = Date.now();
  return forecast.reduce((closest, entry) => {
    const entryTime = parseLocalDatetime(entry.local_datetime);
    const closestTime = parseLocalDatetime(closest.local_datetime);
    return Math.abs(entryTime - now) < Math.abs(closestTime - now) ? entry : closest;
  }, forecast[0]);
}

export async function fetchCurrentWeather(latitude: number, longitude: number): Promise<CurrentWeather | null> {
  try {
    const response = await fetch(`https://weather.ewalabs.com/api/v1?lat=${latitude}&lon=${longitude}`);
    if (!response.ok) return null;
    const body = (await response.json()) as EwalabsResponse;
    const forecast = body.data?.forecast;
    if (body.status !== "success" || !forecast || forecast.length === 0) return null;

    const entry = closestToNow(forecast);
    return {
      condition: entry.weather,
      temperature: entry.temperature,
      humidity: entry.humidity,
      windSpeed: entry.wind_speed,
      windDirection: entry.wind_direction,
      observedAt: entry.local_datetime,
    };
  } catch (error) {
    console.error("Failed to fetch current weather:", error);
    return null;
  }
}
