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
  zone: string;
  score: number;
  description: string;
  severity: FlaggedZoneSeverity;
}

/** Diagnostic report returned by the real Python skin-scanning service
 * (services/skin-scanning) via the /api/scan-analyze proxy. Extends the
 * metric wire contract so it can still be fed to the RAG matching pipeline. */
export interface ScanReport extends ScanMetrics {
  scanId: string;
  status: string;
  createdAt: string;
  ragTriggerStatus: string;
  flaggedZones: FlaggedZone[];
}
