import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { callMatchingService } from "@/lib/matching-client";
import { getEnvironmentalContext } from "@/lib/geotagging-weather-client";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { isQuestionnaireComplete, isScanComplete } from "@/lib/onboarding-complete";
import { sendScanReportEmailIfEnabled } from "@/lib/email/send-scan-report";
import type { QuizAnswers } from "@/types/quiz";
import type { ScanReport } from "@/types/scan";

export async function POST(request: NextRequest) {
  // `scan` is typed as the full ScanReport (not just the bare 6 metrics) —
  // useScanStore's `result` (what both call sites actually POST here) is
  // already a real ScanReport (scanId/createdAt/flaggedZones included), so
  // it's genuinely available, not just metrics.
  const { quiz, scan, imageBase64 } = (await request.json()) as {
    quiz: QuizAnswers;
    scan: ScanReport | null;
    imageBase64?: string | null;
  };

  // This is the natural point the questionnaire is "submitted" — persist it
  // for logged-in users only, and only once the onboarding is actually
  // complete (a finished scan AND all required questionnaire answers). This
  // protects a first-time Google sign-in from writing partial rows: a guest
  // who abandons onboarding partway — or signs in before scanning — keeps
  // their data client-side and nothing is written until they've finished.
  // A guest's answers stay client-side (quiz-store/scan-store, sessionStorage)
  // unless they later sign in from the guest-locked Your Routine screen, which
  // re-POSTs here with the same payload now that a real session exists — and
  // that re-POST is subject to the same completeness gate. Best-effort: a
  // persistence failure shouldn't block the (already real, DB-backed) product
  // matching the user is waiting on.
  const user = await getSessionUser();
  const complete = isScanComplete(scan) && isQuestionnaireComplete(quiz);
  if (user && complete) {
    try {
      await pool.query(
        "INSERT INTO questionnaires (user_id, responses) VALUES ($1, $2::jsonb)",
        [user.id, JSON.stringify(quiz)]
      );
    } catch (error) {
      console.error("Failed to persist questionnaire:", error);
    }

    // Reflect the Step-4 ethical preferences onto the account row so the
    // Profile toggles and the Shop's preference filters match what was chosen
    // in the questionnaire — `users.preferences` is the field those screens
    // actually read (and can later update from Profile).
    if (quiz.ethics) {
      try {
        await pool.query(
          "UPDATE users SET preferences = $2::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [user.id, JSON.stringify(quiz.ethics)]
        );
      } catch (error) {
        console.error("Failed to persist ethical preferences:", error);
      }
    }

    // ON CONFLICT DO NOTHING against idx_scan_results_user_scan_id
    // (data/08_scan_results_dedupe.sql) — a real scan's own scanId makes
    // this insert naturally idempotent, so a retried/duplicate POST for
    // the same scan never stores a second row NOR emails the report
    // twice (only a genuine new row, confirmed by RETURNING, triggers it).
    let didInsertScanResult = false;
    try {
      const inserted = await pool.query(
        `INSERT INTO scan_results
           (user_id, raw_json_data, hydration_score, pigmentation_score, image_data)
         VALUES ($1, $2::jsonb, $3, $4, $5)
         ON CONFLICT (user_id, (raw_json_data->>'scanId'))
           WHERE (raw_json_data->>'scanId') IS NOT NULL
         DO NOTHING
         RETURNING id`,
        [
          user.id,
          JSON.stringify({ ...(scan ?? {}), questionnaire: quiz }),
          scan?.hydration ?? null,
          scan?.pigmentation ?? null,
          imageBase64 ?? null,
        ]
      );
      didInsertScanResult = inserted.rows.length > 0;
    } catch (error) {
      console.error("Failed to persist scan result:", error);
    }

    if (scan && didInsertScanResult) {
      const locale = (await cookies()).get("NEXT_LOCALE")?.value ?? "en";
      await sendScanReportEmailIfEnabled(user, scan, locale, imageBase64);
    }
  }

  const environmentalContext = user ? await getEnvironmentalContext(user.id).catch(() => null) : null;
  const routine = await callMatchingService(quiz, scan, environmentalContext);
  return NextResponse.json(routine);
}
