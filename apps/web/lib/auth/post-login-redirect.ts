import { pool } from "@/lib/db";
import { callMatchingService } from "@/lib/matching-client";
import { serverStore } from "@/lib/server-store";
import { DEFAULT_QUIZ_ANSWERS, type QuizAnswers } from "@/types/quiz";
import type { ScanMetrics } from "@/types/scan";

/**
 * A returning user who already has a real skin scan on file skips the
 * onboarding flow (Welcome → Scan → Quiz) and lands straight on Your
 * Routine — recomputed fresh from their actual latest questionnaire + scan
 * data (not a stale/shared cache), since the routine-building pipeline
 * isn't itself a persisted table per plan.md's schema.
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
    serverStore.latestRoutine = await callMatchingService(latestQuiz, latestScan);
  } catch (error) {
    console.error("Failed to recompute routine for returning user:", error);
    return "/welcome";
  }

  return "/routine";
}
