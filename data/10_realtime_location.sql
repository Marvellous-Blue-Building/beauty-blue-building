-- "Get Realtime Location" toggle (Profile screen, enabled by default) plus
-- the last known position/address it's populated from — see
-- app/api/profile/location/route.ts and components/layout/LocationTracker.tsx.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS realtime_location_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_latitude double precision,
  ADD COLUMN IF NOT EXISTS last_longitude double precision,
  ADD COLUMN IF NOT EXISTS last_address text,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;
