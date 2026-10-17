import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { callBeautyScanService, matchCatalogShades, readBeautyScanInput } from "@/lib/beauty-scan";
import { SkinScanError } from "@/lib/skin-scan-client";
import { serverStore } from "@/lib/server-store";

/**
 * POST /api/scan-beauty — the /scan camera's three-pose scan (front burst,
 * turned right, turned left; see components/scan/NativeSkinScanEngine.tsx).
 * services/skin-scanning reads the colour season, face shape and skin type
 * from it plus the usual skin scores, in the app's
 * language, and the season's palette is matched to catalog shades.
 *
 * Same persistence model as /api/scan-analyze: nothing is saved here. The
 * skin scores (`skinMetrics`, with the beauty result attached) are saved at
 * questionnaire submission like any scan (/api/match-routine).
 */
export async function POST(request: NextRequest) {
  const input = readBeautyScanInput(await request.json().catch(() => null));
  if (input === null) {
    return NextResponse.json({ detail: "Missing or malformed frames." }, { status: 400 });
  }
  if (input === "too_large") {
    return NextResponse.json({ detail: "Photos too large.", code: "frames_too_large" }, { status: 413 });
  }
  const language = (await cookies()).get("NEXT_LOCALE")?.value === "id" ? "id" : "en";

  try {
    const report = await callBeautyScanService({ ...input, language }, request.nextUrl.origin);
    report.catalogShades = await matchCatalogShades(report).catch(() => []);
    // Same convenience cache /api/scan-analyze keeps for a /scan/report refresh.
    serverStore.latestScanResult = report.skinMetrics;
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof SkinScanError) {
      return NextResponse.json({ detail: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ detail: "Beauty scan failed." }, { status: 500 });
  }
}
