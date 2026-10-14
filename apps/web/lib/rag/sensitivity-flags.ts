import type { Sensitivity } from "@/types/quiz";
import type { InciIngredient } from "@/types/product";
import { SENSITIVITY_KEYWORDS } from "@/lib/rag/dictionaries";

/** Parses the raw INCI blob into a display-friendly ingredient list (capped to keep cards readable). */
export function parseIngredients(raw: string | null, limit = 8): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, limit);
}

/** Flags ingredients that match the viewer's declared sensitivities — computed live against real ingredient text, not pre-baked per product. */
export function flagIngredients(
  ingredientNames: string[],
  sensitivities: Sensitivity[]
): InciIngredient[] {
  const activeKeywords = sensitivities
    .filter((s) => s !== "None of these")
    .flatMap((s) => SENSITIVITY_KEYWORDS[s]);

  return ingredientNames.map((name) => ({
    name,
    flagged: activeKeywords.some((kw) => name.toLowerCase().includes(kw.toLowerCase())),
  }));
}

/** Whether any ingredient in the raw INCI text matches one of the viewer's sensitivities — used to exclude/penalize candidates during matching. */
export function containsFlaggedIngredient(
  ingredients: string | null,
  sensitivities: Sensitivity[]
): boolean {
  if (!ingredients) return false;
  const activeKeywords = sensitivities
    .filter((s) => s !== "None of these")
    .flatMap((s) => SENSITIVITY_KEYWORDS[s]);
  const lower = ingredients.toLowerCase();
  return activeKeywords.some((kw) => lower.includes(kw.toLowerCase()));
}
