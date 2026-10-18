export interface ScanMetrics {
  hydration: number | null;
  elasticity: number | null;
  pigmentation: number | null;
  texture: number | null;
  pores: number | null;
  overall: number | null;
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
/** The headline beauty-scan readings, carried on the scan report so they are
 * saved with it (scan_results.raw_json_data, via /api/match-routine). The
 * full result lives in the scan store (lib/store/scan-store.ts). */
export interface BeautySummary {
  captureMode: string;
  seasonKey: string | null;
  undertone: string | null;
  faceShapeKey: string | null;
  skinTypeKey: string | null;
}

export interface SkinMeasurement {
  key: string;
  value: number | null;
  unit: "log_contrast";
  status: "measured" | "unavailable";
  reason: string | null;
  source: "front";
  regions: string[];
  samplePixels: number;
  coverage: number;
}

export interface ScanReport extends ScanMetrics {
  measurementVersion?: string;
  measurementStatus?: "complete" | "partial" | "unavailable";
  measurements?: SkinMeasurement[];
  /** Scoring model version; scores from different versions aren't on the
   * same scale. Absent means version 1. */
  scoringVersion?: number;
  scanId: string;
  status: string;
  createdAt: string;
  ragTriggerStatus: string;
  flaggedZones: FlaggedZone[];
  beauty?: BeautySummary;
}
