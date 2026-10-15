import { NextRequest, NextResponse } from "next/server";
import { callSkinScanService, SkinScanError } from "@/lib/skin-scan-client";
import { touchWidgetSession } from "@/lib/widget/session";

/**
 * POST /api/widget/scan-analyze — guest wrapper around the real
 * services/skin-scanning `/analyze` call (same engine the authenticated
 * app uses, see lib/skin-scan-client.ts). No persistence yet in Phase 2 —
 * the widget renders the ScanReport it gets back; saving widget scans to a
 * table is a natural Phase 3 extension (color analysis needs the same
 * captured frame) rather than being built twice.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { imageBase64?: string; sessionId?: string } | null;
  if (!body?.imageBase64 || !body?.sessionId) {
    return NextResponse.json({ error: "missing_image_or_session" }, { status: 400 });
  }

  const sessionValid = await touchWidgetSession(body.sessionId);
  if (!sessionValid) {
    return NextResponse.json({ error: "invalid_session" }, { status: 404 });
  }

  try {
    const report = await callSkinScanService(body.imageBase64);
    return NextResponse.json(report);
  } catch (err) {
    if (err instanceof SkinScanError) {
      return NextResponse.json({ error: err.code ?? "scan_failed", message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "scan_failed" }, { status: 500 });
  }
}
