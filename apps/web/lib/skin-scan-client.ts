import type { ScanReport } from "@/types/scan";

const SKIN_SCAN_SERVICE_URL =
  process.env.SKIN_SCAN_SERVICE_URL ?? "http://localhost:3003";

export class SkinScanError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Sends a captured frame to the real skin-scanning engine
 * (services/skin-scanning, FastAPI) — MediaPipe face landmarks + OpenCV
 * per-zone pixel analysis run there, not in this app. A 422 means the engine
 * detected no face in the frame.
 */
export async function callSkinScanService(imageBase64: string): Promise<ScanReport> {
  let res: Response;
  try {
    res = await fetch(`${SKIN_SCAN_SERVICE_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64 }),
    });
  } catch {
    throw new SkinScanError(
      "Couldn't reach the skin-scanning service. Is it running on port 3003?",
      503
    );
  }

  if (!res.ok) {
    let detail = "Skin analysis failed.";
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new SkinScanError(detail, res.status);
  }

  return res.json() as Promise<ScanReport>;
}
