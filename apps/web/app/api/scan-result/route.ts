import { NextRequest, NextResponse } from "next/server";
import { serverStore } from "@/lib/server-store";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import type { ScanReport } from "@/types/scan";

export async function GET() {
  const user = await getSessionUser();
  if (user) {
    const result = await pool.query<{ raw_json_data: ScanReport }>(
      "SELECT raw_json_data FROM scan_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [user.id]
    );
    if (result.rows[0]) {
      return NextResponse.json(result.rows[0].raw_json_data);
    }
  }
  // Guest / no persisted scan yet — process-wide last-seen real report.
  return NextResponse.json(serverStore.latestScanResult);
}

/**
 * Commits a completed weekly check-in: the diagnostic report plus the exact
 * captured photo the metrics were computed from. Called from the report
 * screen's "Submit scan" action in the "Recheck Your Skin" flow — the
 * baseline scan stores its row later, at questionnaire submission
 * (/api/match-routine).
 *
 * A guest has no row to write to, so this succeeds without persisting
 * (`stored: false`) rather than erroring; the client still moves on to
 * Progress.
 */
export async function POST(request: NextRequest) {
  const { report, imageBase64 } = (await request.json()) as {
    report?: ScanReport;
    imageBase64?: string | null;
  };

  if (!report || typeof report.hydration !== "number") {
    return NextResponse.json({ error: "Invalid scan report." }, { status: 400 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ stored: false });
  }

  try {
    await pool.query(
      `INSERT INTO scan_results
         (user_id, raw_json_data, hydration_score, pigmentation_score, image_data)
       VALUES ($1, $2::jsonb, $3, $4, $5)`,
      [
        user.id,
        JSON.stringify(report),
        report.hydration,
        report.pigmentation,
        imageBase64 ?? null,
      ]
    );
  } catch (error) {
    console.error("Failed to persist check-in scan:", error);
    return NextResponse.json({ error: "Failed to store scan." }, { status: 500 });
  }

  return NextResponse.json({ stored: true });
}
