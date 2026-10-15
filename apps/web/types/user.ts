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
  /** Whether the server's SMTP env vars are actually usable right now —
   * the Profile screen disables the "Send Report to My Email" toggle
   * when this is false, since turning it on wouldn't do anything. */
  smtpConfigured: boolean;
  /** "Get Realtime Location" preference (enabled by default) — gates
   * components/layout/LocationTracker.tsx's periodic geolocation polling. */
  realtimeLocationEnabled: boolean;
  /** Full reverse-geocoded address from the last location ping, or null
   * until the first one lands (see app/api/profile/location/route.ts). */
  address: string | null;
}
