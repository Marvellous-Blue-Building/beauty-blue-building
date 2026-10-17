/**
 * CUSUM spike detection + alarm levels — from the Demand Signal System
 * knowledge base (apps/web/Demand Signal System.md), "Algoritma inti §3".
 *
 * Scoped-down from the KB's 8-signal, daily-cadence design to the 2 real
 * signals this project actually has (cart adds, chat recommendation
 * mentions), bucketed hourly rather than daily since real activity history
 * here is hours old, not months. The KB's own k/threshold constants (k=0.5,
 * watch=2, rising=4, surge=7) are kept as-is — they're dimensionless
 * relative to the DSS score's own z-score scale, so they still apply
 * mechanically; what's NOT claimed is that they've been calibrated for
 * THIS cadence/signal-set via the KB's own backtest process (that needs
 * 12 months of historical spikes to calibrate against, which doesn't
 * exist yet). This is the CUSUM mechanism working correctly on real
 * inputs, not a recalibrated production detector.
 *
 * Also scoped down from the KB's literal alarm conditions: the "Rising"
 * band's KB wording ("4≤C<7, or C≥4 and z(S1)>1") is redundant as written;
 * this implementation keeps the same four ordered bands (Surge > Rising >
 * Watch > Normal) with the same confirming-signal logic, just without the
 * overlapping clause.
 */

export type AlarmLevel = -1 | 0 | 1 | 2 | 3;

export const ALARM_LABELS: Record<AlarmLevel, string> = {
  [-1]: "Fading",
  0: "Normal",
  1: "Watch",
  2: "Rising",
  3: "Surge",
};

export interface CusumPoint {
  /** Combined Demand Signal Score for this time bucket (weighted z-scores). */
  dss: number;
  /** The "confirmation" signal's own z-score for this bucket (cart adds here — analogous to the KB's S1 sell-out signal). */
  zConfirm: number;
}

export interface CusumResult {
  cusum: number;
  level: AlarmLevel;
  levelLabel: string;
}

const K_DRIFT = 0.5;
const THRESH = { watch: 2, rising: 4, surge: 7 };
const FADING_WINDOW = 7;
const FADING_DSS = -1.5;

/** C_t = max(0, C_{t-1} + DSS_t - k) — run across the full ordered series, return the final state. */
export function runCusum(points: CusumPoint[]): CusumResult {
  if (points.length === 0) return { cusum: 0, level: 0, levelLabel: ALARM_LABELS[0] };

  let c = 0;
  for (const p of points) {
    c = Math.max(0, c + p.dss - K_DRIFT);
  }
  c = Math.round(c * 100) / 100;

  const last = points[points.length - 1];
  const recentWindow = points.slice(-FADING_WINDOW);
  const fading = recentWindow.length >= FADING_WINDOW && recentWindow.every((p) => p.dss < FADING_DSS);

  let level: AlarmLevel = 0;
  if (fading) level = -1;
  else if (c >= THRESH.surge && last.zConfirm > 2) level = 3;
  else if (c >= THRESH.rising) level = 2;
  else if (c >= THRESH.watch) level = 1;

  return { cusum: c, level, levelLabel: ALARM_LABELS[level] };
}
