import type { QuizAnswers } from "@/types/quiz";
import type { ScanMetrics, ScanReport } from "@/types/scan";

/**
 * A scan counts as finished after a completed engine report, even when
 * individual measurements are unavailable.
 * Used to gate persistence: a first-time Google sign-in must not write a
 * scan_results row for someone who never completed a scan.
 */
export function isScanComplete(scan: ScanMetrics | null | undefined): boolean {
  if (!scan) return false;
  const report = scan as Partial<ScanReport>;
  if ((report.scoringVersion ?? 0) >= 3) {
    return report.status === "SUCCESS" && typeof report.scanId === "string" &&
      !!report.scanId && Array.isArray(report.measurements) && report.measurements.length > 0;
  }
  return typeof scan.hydration === "number" && Number.isFinite(scan.hydration);
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
