import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { callMatchingService } from "@/lib/matching-client";
import { isQuestionnaireComplete, isScanComplete } from "@/lib/onboarding-complete";
import type { QuizAnswers } from "@/types/quiz";
import type { ScanMetrics } from "@/types/scan";

/**
 * Recomputes the routine LIVE from this user's own latest persisted
 * questionnaire + scan every time — not a cached snapshot. Previously this
 * read back a single process-wide `serverStore.latestRoutine` in-memory
 * variable (shared across every user of the running server, and able to
 * go stale against the real `products` table/schema, e.g. missing fields
 * added after it was cached). POST /api/match-routine already persists
 * both the questionnaire and scan (with the quiz nested inside
 * scan_results.raw_json_data) for any logged-in user who completed
 * onboarding — this just reads that real row back and re-runs the match.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(null);

  const result = await pool.query<{ raw_json_data: Record<string, unknown> }>(
    "SELECT raw_json_data FROM scan_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
    [user.id]
  );
  const raw = result.rows[0]?.raw_json_data;
  if (!raw || !raw.questionnaire) return NextResponse.json(null);

  const quiz = raw.questionnaire as QuizAnswers;
  const scan: ScanMetrics = {
    hydration: raw.hydration as number,
    elasticity: raw.elasticity as number,
    pigmentation: raw.pigmentation as number,
    texture: raw.texture as number,
    pores: raw.pores as number,
    overall: raw.overall as number,
  };

  if (!isQuestionnaireComplete(quiz) || !isScanComplete(scan)) return NextResponse.json(null);

  const routine = await callMatchingService(quiz, scan);
  return NextResponse.json(routine);
}
