import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * Single-admin auth for the tenant dashboard — deliberately not the full
 * Google OAuth / multi-user session system the shopper-facing app uses.
 * One shared password (ADMIN_PASSWORD env var), one cookie whose value is
 * a hash of it so the plaintext password never sits in a cookie. This is
 * the "no new auth system" simplification the Phase 4 plan calls for —
 * there is exactly one tenant (one retailer) per deployment.
 */
export const ADMIN_COOKIE = "admin_session";

function expectedToken(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return createHash("sha256").update(password).digest("hex");
}

export function checkAdminPassword(password: string): string | null {
  const expected = expectedToken();
  if (!expected) return null;
  const candidate = createHash("sha256").update(password).digest("hex");
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return expected;
}

export async function isAdminRequest(): Promise<boolean> {
  const expected = expectedToken();
  if (!expected) return false;
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
