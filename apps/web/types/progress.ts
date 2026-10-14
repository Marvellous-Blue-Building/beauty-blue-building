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
