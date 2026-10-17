-- Latest weather reading per user, replacing the Redis-only cache in
-- apps/web/lib/weather-cache.ts (never treated as durable history, just
-- the most recent ping — see that file for the staleness check).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_weather JSONB,
  ADD COLUMN IF NOT EXISTS last_weather_updated_at TIMESTAMPTZ;
