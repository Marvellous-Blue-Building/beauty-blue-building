/** One row of "Your Progress History" — a persisted scan_results entry for
 * the signed-in user. `createdAt` is the scan row's own timestamp. */
export interface ProgressHistoryItem {
  id: string;
  createdAt: string;
  /** The report's overall skin score (0-100); null for very old rows whose
   * raw_json_data predates the metric. */
  overall: number | null;
}

export interface ProgressSnapshot {
  day: number;
  label: string;
  /** Day 0 (the user's first completed scan+questionnaire) is always enabled; 30/60/90 unlock only once that many real days have elapsed since then. */
  enabled: boolean;
  /** Null until real data exists for this snapshot (no scan/check-in yet, or the day hasn't unlocked). */
  hydration: number | null;
  texture: number | null;
  pigmentation: number | null;
  /**
   * The face photo captured for this snapshot. Falls back to the Day 0
   * baseline photo whenever a later day has no stored image of its own.
   */
  image: string | null;
}
