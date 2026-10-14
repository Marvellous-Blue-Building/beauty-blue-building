import type { Sensitivity } from "@/types/quiz";

/**
 * Entity canonicalization / dictionary tables still needed on the Next.js
 * side. The matching-only dictionaries (CONCERN_KEYWORDS, GOAL_KEYWORDS,
 * scanMetricKeywords) moved to services/matching-service/app/dictionaries.py
 * along with the matching algorithm itself.
 */

/** Ingredient terms to screen OUT of recommendations for a given sensitivity — still used by lib/rag/sensitivity-flags.ts for viewer-side ingredient flagging. */
export const SENSITIVITY_KEYWORDS: Record<Sensitivity, string[]> = {
  Fragrance: ["fragrance", "parfum"],
  Retinoids: ["retinol", "retinal", "tretinoin", "retinyl"],
  "Essential Oils": ["essential oil", "citrus oil", "lavender oil", "tea tree oil"],
  "Eczema-prone skin": ["fragrance", "alcohol denat", "sodium lauryl sulfate"],
  "Chemical Sunscreens": ["avobenzone", "oxybenzone", "octinoxate", "octocrylene", "homosalate"],
  "None of these": [],
};

const VEGAN_PATTERN = /\bvegan\b/i;
const CRUELTY_FREE_PATTERN = /cruelty[\s-]?free|not tested on animals|leaping bunny/i;
const FRAGRANCE_FREE_CLAIM_PATTERN = /fragrance[\s-]?free|unscented|non-?fragrance/i;
const FRAGRANCE_IN_INGREDIENTS_PATTERN = /fragrance|parfum/i;

/** Dictionary + regex detection for ethical claims the real catalog doesn't tag structurally — used by lib/rag/product-row.ts's toProduct() for the listing/detail endpoints. */
export function detectEthicalTags(
  nameAndDescription: string,
  ingredients: string | null
): { vegan: boolean; crueltyFree: boolean; fragranceFree: boolean } {
  const vegan = VEGAN_PATTERN.test(nameAndDescription);
  const crueltyFree = CRUELTY_FREE_PATTERN.test(nameAndDescription);
  const fragranceFree = ingredients
    ? FRAGRANCE_FREE_CLAIM_PATTERN.test(nameAndDescription) || !FRAGRANCE_IN_INGREDIENTS_PATTERN.test(ingredients)
    : FRAGRANCE_FREE_CLAIM_PATTERN.test(nameAndDescription);
  return { vegan, crueltyFree, fragranceFree };
}
