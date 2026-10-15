import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import { redis } from "@/lib/redis";
import type { GoogleIdentity } from "@/lib/auth/google-oauth";

export const SESSION_COOKIE = "session_token";
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 1 day

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  /** "Send My Report to Email" preference (Profile screen) — used to gate
   * emailing the skin-scan PDF report, see lib/email/send-scan-report.ts. */
  sendReportEmail: boolean;
  /** "Get Realtime Location" preference (Profile screen, enabled by
   * default) — gates both the client's periodic geolocation polling
   * (components/layout/LocationTracker.tsx) and the server-side write in
   * app/api/profile/location/route.ts. */
  realtimeLocationEnabled: boolean;
}

/**
 * Finds the user by email, or creates one — "store user data to table User
 * for first time if data does not exist". An existing user's row is left
 * untouched (we don't clobber their avatar/preferences on every login).
 */
export async function upsertUserFromGoogle(identity: GoogleIdentity): Promise<SessionUser> {
  const existing = await pool.query<{
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    send_report_email: boolean;
    realtime_location_enabled: boolean;
  }>(
    "SELECT id, email, full_name, avatar_url, send_report_email, realtime_location_enabled FROM users WHERE email = $1",
    [identity.email]
  );
  if (existing.rows[0]) {
    const u = existing.rows[0];
    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      avatarUrl: u.avatar_url,
      sendReportEmail: u.send_report_email,
      realtimeLocationEnabled: u.realtime_location_enabled,
    };
  }

  const inserted = await pool.query<{
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    send_report_email: boolean;
    realtime_location_enabled: boolean;
  }>(
    `INSERT INTO users (firebase_uid, email, full_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, full_name, avatar_url, send_report_email, realtime_location_enabled`,
    [identity.sub, identity.email, identity.name]
  );
  const u = inserted.rows[0];
  return {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    avatarUrl: u.avatar_url,
    sendReportEmail: u.send_report_email,
    realtimeLocationEnabled: u.realtime_location_enabled,
  };
}

/**
 * Creates a session: a durable row in user_sessions (audit/record table)
 * plus a Redis flag keyed by session token with a 1-day TTL. Redis is the
 * fast-path validity check and expires the session automatically after a
 * day; the DB row is the durable record of the session even after that.
 */
export async function createSession(user: SessionUser): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await pool.query(
    `INSERT INTO user_sessions (user_id, email, session_token, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [user.id, user.email, token, expiresAt]
  );
  await redis.set(`session:${token}`, user.email, "EX", SESSION_TTL_SECONDS);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });

  return token;
}

/** Removes the Redis flag and marks the DB session row logged-out — "remove it when user click logout". */
export async function destroySession(token: string): Promise<void> {
  await redis.del(`session:${token}`);
  await pool.query(
    "UPDATE user_sessions SET logged_out_at = CURRENT_TIMESTAMP WHERE session_token = $1 AND logged_out_at IS NULL",
    [token]
  );

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Resolves the current request's session. Redis is the source of truth for
 * validity — if the key is missing (explicit logout, or its 1-day TTL
 * naturally expired), the session is treated as invalid even if the cookie
 * is still present.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const email = await redis.get(`session:${token}`);
  if (!email) return null;

  const result = await pool.query<{
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    send_report_email: boolean;
    realtime_location_enabled: boolean;
  }>(
    "SELECT id, email, full_name, avatar_url, send_report_email, realtime_location_enabled FROM users WHERE email = $1",
    [email]
  );
  const u = result.rows[0];
  if (!u) return null;

  return {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    avatarUrl: u.avatar_url,
    sendReportEmail: u.send_report_email,
    realtimeLocationEnabled: u.realtime_location_enabled,
  };
}
