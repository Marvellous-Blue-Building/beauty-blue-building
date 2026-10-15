import type { QuizAnswers } from "@/types/quiz";
import type { ScanMetrics } from "@/types/scan";
import type { MatchedRoutine } from "@/types/routine";
import type { ChatUnderstanding } from "@/types/chat";
import type { EnvironmentalContext } from "@/lib/geotagging-weather-client";

const MATCHING_SERVICE_URL = process.env.MATCHING_SERVICE_URL ?? "http://localhost:8000";

/** Calls the real matching-service (services/matching-service, FastAPI) — the questionnaire + scan → routine calculation itself lives there, not in this app. */
export async function callMatchingService(
  quiz: QuizAnswers,
  scan: ScanMetrics | null,
  environmentalContext?: EnvironmentalContext | null
): Promise<MatchedRoutine> {
  const res = await fetch(`${MATCHING_SERVICE_URL}/match-routine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quiz, scan, boostKeywords: environmentalContext?.boostKeywords ?? [] }),
  });
  if (!res.ok) {
    throw new Error(`matching-service responded with ${res.status}`);
  }
  return res.json() as Promise<MatchedRoutine>;
}

/** Runs the real 14-stage chat pipeline (docs/plan.md SS4 steps 1-13) over a
 * free-text chat message — dictionary/fuzzy/entity matching, intent
 * classification, FTS/trigram/pgvector semantic search, conversation-state
 * resolution, and confidence/ambiguity scoring. See
 * services/matching-service/app/chat_pipeline.py. */
export async function callChatUnderstand(
  conversationId: string | null,
  text: string,
  environmentalContext?: EnvironmentalContext | null
): Promise<ChatUnderstanding> {
  const res = await fetch(`${MATCHING_SERVICE_URL}/chat/understand`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId,
      text,
      environmentalContext: environmentalContext?.guidanceText ?? null,
      boostKeywords: environmentalContext?.boostKeywords ?? [],
    }),
  });
  if (!res.ok) {
    throw new Error(`matching-service responded with ${res.status}`);
  }
  return res.json() as Promise<ChatUnderstanding>;
}
