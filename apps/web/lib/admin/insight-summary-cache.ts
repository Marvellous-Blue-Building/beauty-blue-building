/**
 * Once-a-day cache for the Forecasting section's auto-generated top
 * insight (see app/api/admin/insight/summary/route.ts). In-memory and
 * per-server-instance — acceptable for this single-tenant admin dashboard
 * at this scale; a cold start or a second Cloud Run instance just means an
 * extra regeneration, not incorrect data.
 */

interface CachedSummary {
  text: string;
  generatedAt: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// One entry per reply language, so the EN and ID dashboards each get their own.
const cache = new Map<string, CachedSummary>();

export function getCachedSummary(language: string): CachedSummary | null {
  const cached = cache.get(language);
  if (!cached) return null;
  const age = Date.now() - new Date(cached.generatedAt).getTime();
  return age < ONE_DAY_MS ? cached : null;
}

export function setCachedSummary(language: string, text: string): CachedSummary {
  const cached = { text, generatedAt: new Date().toISOString() };
  cache.set(language, cached);
  return cached;
}
