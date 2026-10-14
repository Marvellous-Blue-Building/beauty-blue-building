import type { QuizAnswers } from "@/types/quiz";
import type { ScanMetrics } from "@/types/scan";
import type { MatchedRoutine } from "@/types/routine";

const MATCHING_SERVICE_URL = process.env.MATCHING_SERVICE_URL ?? "http://localhost:8000";

/** Calls the real matching-service (services/matching-service, FastAPI) — the questionnaire + scan → routine calculation itself lives there, not in this app. */
export async function callMatchingService(
  quiz: QuizAnswers,
  scan: ScanMetrics | null
): Promise<MatchedRoutine> {
  const res = await fetch(`${MATCHING_SERVICE_URL}/match-routine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quiz, scan }),
  });
  if (!res.ok) {
    throw new Error(`matching-service responded with ${res.status}`);
  }
  return res.json() as Promise<MatchedRoutine>;
}
