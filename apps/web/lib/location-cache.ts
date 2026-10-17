import { pool } from "@/lib/db";

/**
 * Latest known location, read/written straight from the `users` table
 * (columns added by data/10_realtime_location.sql). Replaces a Redis-backed
 * recent-ping list + hourly DB flush: every 5-minute ping from
 * components/layout/LocationTracker.tsx now writes directly here, which is
 * cheap enough at this app's scale and keeps a single source of truth.
 */

export interface LocationEntry {
  latitude: number;
  longitude: number;
  address: string | null;
  capturedAt: string;
}

export async function pushRecentLocation(userId: string, entry: LocationEntry): Promise<void> {
  await pool.query(
    `UPDATE users
        SET last_latitude = $2, last_longitude = $3, last_address = $4, location_updated_at = $5
      WHERE id = $1`,
    [userId, entry.latitude, entry.longitude, entry.address, entry.capturedAt]
  );
}

export async function getMostRecentLocation(userId: string): Promise<LocationEntry | null> {
  const result = await pool.query<{
    last_latitude: number | null;
    last_longitude: number | null;
    last_address: string | null;
    location_updated_at: string | null;
  }>(
    "SELECT last_latitude, last_longitude, last_address, location_updated_at FROM users WHERE id = $1",
    [userId]
  );
  const row = result.rows[0];
  if (!row || row.last_latitude == null || row.last_longitude == null) return null;

  return {
    latitude: row.last_latitude,
    longitude: row.last_longitude,
    address: row.last_address,
    capturedAt: row.location_updated_at ?? new Date().toISOString(),
  };
}
