import type { QuizAnswers } from "@/types/quiz";
import type { ScanMetrics } from "@/types/scan";

/**
 * A scan counts as finished only once the engine returned real metrics for it.
 * Used to gate persistence: a first-time Google sign-in must not write a
 * scan_results row for someone who never completed a scan.
 */
export function isScanComplete(scan: ScanMetrics | null | undefined): boolean {
  return !!scan && typeof scan.hydration === "number";
}

/**
 * The questionnaire is finished once every answer that gates forward progress
 * has been given: skin type (step 1), at least one concern (step 2), and a
 * goal (step 5). Sensitivities (which has an explicit Skip) and climate (which
 * has no gate) are optional by the flow's own design, so they don't block
 * completion.
 *
 * Both a first-time sign-in's "take my onboarding data with me" re-submit and
 * the server that writes it use this so partial answers are never persisted.
 */
export function isQuestionnaireComplete(quiz: QuizAnswers): boolean {
  return quiz.skinType != null && quiz.concerns.length > 0 && quiz.goal != null;
}
