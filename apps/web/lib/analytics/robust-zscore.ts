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

/**
 * z_{s,t} = (x - median(history)) / (1.4826 * MAD(history) + epsilon), clipped to [-5, 5].
 *
 * `epsilon` defaults to 1, not the KB's literal "tiny constant to avoid
 * division by zero": the only inputs this is ever called with in this
 * codebase (cart-add/chat-mention counts per hour) are small, zero-inflated
 * integers, where MAD is routinely exactly 0 (e.g. "mostly 0s and 1s") —
 * with a near-zero epsilon, that makes ANY single non-zero hour register as
 * a maxed-out ±5 z-score, which then never lets CUSUM settle back down.
 * epsilon=1 ("a difference of one whole event") keeps a genuinely small
 * bump small and a real multi-unit spike still clearly large — verified
 * against a seeded ~100-point series where the old epsilon pinned CUSUM at
 * 100+ for a flat/declining product.
 */
export function robustZScore(value: number, history: number[], epsilon = 1): number {
  if (history.length === 0) return 0;
  const med = median(history);
  const madValue = mad(history);
  const z = (value - med) / (1.4826 * madValue + epsilon);
  return Math.max(-5, Math.min(5, z));
}
