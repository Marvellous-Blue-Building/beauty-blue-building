/**
 * Robust z-score (median + MAD) — from the Demand Signal System knowledge
 * base (apps/web/Demand Signal System.md), section "Algoritma inti §1".
 * Uses median/MAD instead of mean/stddev so a single extreme hour doesn't
 * distort the scale — exactly the KB's own rationale.
 */

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mad(values: number[]): number {
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

/** z_{s,t} = (x - median(history)) / (1.4826 * MAD(history) + epsilon), clipped to [-5, 5]. */
export function robustZScore(value: number, history: number[], epsilon = 1e-6): number {
  if (history.length === 0) return 0;
  const med = median(history);
  const madValue = mad(history);
  const z = (value - med) / (1.4826 * madValue + epsilon);
  return Math.max(-5, Math.min(5, z));
}
