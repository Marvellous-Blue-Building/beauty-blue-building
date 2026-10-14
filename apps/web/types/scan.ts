export interface ScanMetrics {
  hydration: number;
  elasticity: number;
  pigmentation: number;
  texture: number;
  pores: number;
  overall: number;
}

export type FlaggedZoneSeverity = "low" | "medium" | "high";

export interface FlaggedZone {
  /** Stable id ("forehead_shine", "under_eye", "cheek_texture",
   * "cheek_redness", "nose_pores") — absent on reports from before v2. */
  key?: string;
  zone: string;
  score: number;
  description: string;
  severity: FlaggedZoneSeverity;
  /** Where the area is, as a 0-1 position in the analyzed (full) photo. */
  x?: number | null;
  y?: number | null;
}

/** Diagnostic report returned by the real Python skin-scanning service
 * (services/skin-scanning) via the /api/scan-analyze proxy. Extends the
 * metric wire contract so it can still be fed to the RAG matching pipeline. */
export interface ScanReport extends ScanMetrics {
  /** Scoring model version; scores from different versions aren't on the
   * same scale. Absent means version 1. */
  scoringVersion?: number;
  scanId: string;
  status: string;
  createdAt: string;
  ragTriggerStatus: string;
  flaggedZones: FlaggedZone[];
}
