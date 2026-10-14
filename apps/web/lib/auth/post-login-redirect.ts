import { pool } from "@/lib/db";
import { callMatchingService } from "@/lib/matching-client";
import { DEFAULT_QUIZ_ANSWERS, type QuizAnswers } from "@/types/quiz";
import type { ScanMetrics } from "@/types/scan";

/**
 * A returning user who already has a real skin scan on file skips the
 * onboarding flow (Welcome → Scan → Quiz) and lands straight on Your
 * Routine. This just verifies the real catalog match still succeeds for
 * their latest persisted questionnaire + scan before redirecting there —
 * GET /api/routine (which Your Routine actually calls) recomputes the real
 * result itself, live, per request; there's no shared cache to populate
 * here anymore.
 */
export async function resolvePostLoginRedirect(userId: string): Promise<"/routine" | "/welcome"> {
  const scanResult = await pool.query<{ raw_json_data: ScanMetrics }>(
    "SELECT raw_json_data FROM scan_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
    [userId]
  );
  const latestScan = scanResult.rows[0]?.raw_json_data ?? null;
  if (!latestScan) {
    return "/welcome";
  }

  const questionnaireResult = await pool.query<{ responses: QuizAnswers }>(
    "SELECT responses FROM questionnaires WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
    [userId]
  );
  const latestQuiz = questionnaireResult.rows[0]?.responses ?? DEFAULT_QUIZ_ANSWERS;

  try {
    await callMatchingService(latestQuiz, latestScan);
  } catch (error) {
    console.error("Failed to recompute routine for returning user:", error);
    return "/welcome";
  }

  return "/routine";
}
