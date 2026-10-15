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
    // happens later, at an explicit user action rather than every camera
    // capture — both the baseline flow AND the weekly check-in now write at
    // questionnaire submission (/api/match-routine); a check-in's "Save
    // report" button just routes into that same as-is questionnaire first
    // (see app/[locale]/scan/report/page.tsx).
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
