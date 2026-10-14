import type { ScanMetrics } from "@/types/scan";

export type ScoreBand = "great" | "good" | "fair" | "needsCare";

export const METRIC_KEYS = [
  "hydration",
  "elasticity",
  "pigmentation",
  "texture",
  "pores",
] as const satisfies readonly (keyof ScanMetrics)[];

export type MetricKey = (typeof METRIC_KEYS)[number];

/** Plain-language rating for a 0-100 score. "Good" starts at 70, which lines
 * up with where services/matching-service starts boosting ingredients for a
 * metric (65-80 depending on the metric). */
export function scoreBand(score: number): ScoreBand {
  if (score >= 85) return "great";
  if (score >= 70) return "good";
  if (score >= 55) return "fair";
  return "needsCare";
}

/** Palette colors per band (dot, bar fill) — labels always accompany them. */
export const BAND_STYLE: Record<ScoreBand, { dot: string; bar: string }> = {
  great: { dot: "bg-secondary", bar: "from-secondary-dim to-secondary" },
  good: { dot: "bg-primary", bar: "from-mint to-primary" },
  fair: { dot: "bg-mint", bar: "from-mint-dim to-mint" },
  needsCare: { dot: "bg-warn", bar: "from-mint to-warn" },
};
