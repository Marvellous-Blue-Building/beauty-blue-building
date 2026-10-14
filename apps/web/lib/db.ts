import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set — add it to .env.local (see .env.local example in the project README/setup notes). No hardcoded fallback credential is kept in source."
  );
}

// Real Postgres connection (the same `bluebuilding` DB set up for the
// project). Cached on globalThis so Next.js's dev-mode hot reload doesn't
// spawn a new pool on every file save (same pattern as lib/server-store.ts).
const CONNECTION_STRING = process.env.DATABASE_URL;

const globalForDb = globalThis as unknown as { __beautyAdvisorPool?: Pool };

export const pool: Pool =
  globalForDb.__beautyAdvisorPool ??
  new Pool({ connectionString: CONNECTION_STRING, max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__beautyAdvisorPool = pool;
}
