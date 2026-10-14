import type { ScanReport } from "@/types/scan";
import type { MatchedRoutine } from "@/types/routine";

/**
 * In-memory cache for state that isn't per-user persisted data — cart,
 * saved products, and the user profile now live in real Postgres tables
 * (see app/api/cart, app/api/saved-products, app/api/profile, all scoped to
 * the authenticated session via lib/auth/session.ts).
 *
 * What's left here is genuinely process-wide convenience state, not
 * per-user data: the last-computed routine match (so a /routine refresh
 * doesn't lose it) and the last real scan report for unauthenticated/dev
 * viewing. Resets on a full `next dev` restart.
 *
 * Cached on `globalThis` so Next.js's dev-mode hot reload doesn't wipe
 * state on every file save (same pattern used for the pg Pool in lib/db.ts).
 */

interface ServerStoreState {
  latestScanResult: ScanReport | null;
  latestRoutine: MatchedRoutine | null;
}

function createInitialState(): ServerStoreState {
  return {
    latestScanResult: null,
    latestRoutine: null,
  };
}

const globalForStore = globalThis as unknown as {
  __beautyAdvisorStore?: ServerStoreState;
};

export const serverStore: ServerStoreState =
  globalForStore.__beautyAdvisorStore ?? createInitialState();

if (process.env.NODE_ENV !== "production") {
  globalForStore.__beautyAdvisorStore = serverStore;
}
