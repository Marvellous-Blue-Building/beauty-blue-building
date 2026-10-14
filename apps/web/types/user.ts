import type { EthicalPreferences } from "./quiz";

/**
 * Real user profile, derived at read time (see app/api/profile/route.ts)
 * from the `users` row plus the user's latest `questionnaires` and
 * `scan_results` rows — not duplicated/stored redundantly on `users`.
 */
export interface UserProfile {
  name: string;
  email: string;
  avatarUrl: string | null;
  /** Null until the user has completed the quiz at least once. */
  skinType: string | null;
  concernSummary: string | null;
  goal: string | null;
  /** Null until the user has completed a real skin scan. */
  scanScore: number | null;
  dayStreak: number;
  flaggedAllergenCount: number;
  preferences: EthicalPreferences;
  sendReportEmail: boolean;
}
