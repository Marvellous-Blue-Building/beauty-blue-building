import { NextRequest, NextResponse } from "next/server";
import { callSkinScanService, SkinScanError } from "@/lib/skin-scan-client";
import { serverStore } from "@/lib/server-store";

export async function POST(request: NextRequest) {
  const { imageBase64 } = (await request.json()) as { imageBase64?: string };
  if (!imageBase64) {
    return NextResponse.json({ detail: "Missing imageBase64." }, { status: 400 });
  }

  try {
    const report = await callSkinScanService(imageBase64);
    // Process-wide convenience cache so a /scan/report refresh (guest or
    // pre-quiz) still has the last real report. Persistence is deliberate and
    // separate: the baseline flow writes at questionnaire submission
    // (/api/match-routine), the weekly check-in at the report's "Submit scan"
    // (/api/scan-result POST) — both keyed to an explicit user action rather
    // than every camera capture.
    serverStore.latestScanResult = report;
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof SkinScanError) {
      return NextResponse.json(
        { detail: error.message, code: error.code },
        { status: error.status }
      );
    }
    return NextResponse.json({ detail: "Skin analysis failed." }, { status: 500 });
  }
}
