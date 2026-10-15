import { redis } from "@/lib/redis";

/**
 * Redis-backed cache for "Get Realtime Location" pings
 * (components/layout/LocationTracker.tsx polls every 5 minutes). Every
 * ping is cheap and goes straight to Redis; only one ping per hour ever
 * reaches Postgres (see shouldFlushToDb below) — see
 * app/api/profile/location/route.ts, the only caller.
 */

const RECENT_LIST_MAX = 5;
const RECENT_LIST_TTL_SECONDS = 60 * 60 * 24; // housekeeping only — LTRIM is what enforces "last 5"
const DB_SYNC_INTERVAL_SECONDS = 60 * 60; // 1 hour

export interface LocationEntry {
  latitude: number;
  longitude: number;
  address: string | null;
  capturedAt: string;
}

function recentListKey(userId: string): string {
  return `location:recent:${userId}`;
}

function dbSyncKey(userId: string): string {
  return `location:db-sync:${userId}`;
}

/** Pushes a new ping onto the user's recent-location list, keeping only the latest 5 — older entries fall off (are erased) automatically. */
export async function pushRecentLocation(userId: string, entry: LocationEntry): Promise<void> {
  const key = recentListKey(userId);
  await redis.lpush(key, JSON.stringify(entry));
  await redis.ltrim(key, 0, RECENT_LIST_MAX - 1);
  await redis.expire(key, RECENT_LIST_TTL_SECONDS);
}

/** The single most recent ping Redis still has for this user, or null if none/expired. */
export async function getMostRecentLocation(userId: string): Promise<LocationEntry | null> {
  const raw = await redis.lindex(recentListKey(userId), 0);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocationEntry;
  } catch {
    return null;
  }
}

/**
 * Atomically claims the right to flush to Postgres right now — returns
 * true at most once per rolling hour per user (`SET ... NX` makes the
 * claim race-safe across concurrent requests), false otherwise. Callers
 * should flush the *latest* Redis entry (getMostRecentLocation), not
 * whatever payload happened to trigger this particular request.
 */
export async function claimDbFlush(userId: string): Promise<boolean> {
  const result = await redis.set(dbSyncKey(userId), "1", "EX", DB_SYNC_INTERVAL_SECONDS, "NX");
  return result === "OK";
}
