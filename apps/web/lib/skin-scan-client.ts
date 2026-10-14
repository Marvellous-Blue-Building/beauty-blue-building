import type { ScanReport } from "@/types/scan";

const SKIN_SCAN_SERVICE_URL =
  process.env.SKIN_SCAN_SERVICE_URL ?? "http://localhost:3003";

export class SkinScanError extends Error {
  status: number;
  /** The engine's reason for a 422: no_face, face_too_small, no_skin,
   * too_dark or too_blurry. */
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Sends a captured frame to the real skin-scanning engine
 * (services/skin-scanning, FastAPI) — MediaPipe face landmarks + OpenCV
 * per-zone pixel analysis run there, not in this app. A 422 means the photo
 * can't be scored (no face, or too dark / blurry / small), with the reason in
 * `code`.
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
    let message = "Skin analysis failed.";
    let code: string | undefined;
    try {
      const body = (await res.json()) as {
        detail?: string | { code?: string; message?: string };
      };
      if (typeof body.detail === "string") {
        message = body.detail;
      } else if (body.detail?.message) {
        message = body.detail.message;
        code = body.detail.code;
      }
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new SkinScanError(message, res.status, code);
  }

  return res.json() as Promise<ScanReport>;
}
