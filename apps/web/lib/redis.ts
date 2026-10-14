import Redis from "ioredis";

// Real Redis connection, used as the fast-path "is this session currently
// valid" check for the auth system (lib/auth/session.ts). Cached on
// globalThis so Next.js's dev-mode hot reload doesn't open a new
// connection on every file save (same pattern as lib/db.ts's pg Pool).
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";

const globalForRedis = globalThis as unknown as { __beautyAdvisorRedis?: Redis };

export const redis: Redis = globalForRedis.__beautyAdvisorRedis ?? new Redis(REDIS_URL);

if (process.env.NODE_ENV !== "production") {
  globalForRedis.__beautyAdvisorRedis = redis;
}
