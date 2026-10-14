"""Entity canonicalization / dictionary tables — ported 1:1 from
apps/web/lib/rag/dictionaries.ts. Map the quiz's fixed enum answers to the
cosmetic-ingredient vocabulary that actually appears in the real product
catalog's `ingredients` text."""

import re
from typing import Optional

CONCERN_KEYWORDS: dict[str, list[str]] = {
    "Acne & Breakouts": ["salicylic acid", "niacinamide", "tea tree", "zinc", "benzoyl peroxide"],
    "Fine Lines & Aging": ["retinol", "peptide", "collagen", "bakuchiol", "retinal"],
    "Dark Spots / Hyperpigmentation": [
        "vitamin c",
        "ascorbic acid",
        "niacinamide",
        "alpha arbutin",
        "tranexamic acid",
    ],
    "Dryness & Dehydration": ["hyaluronic acid", "glycerin", "ceramide", "squalane", "panthenol"],
    "Redness & Irritation": ["centella", "panthenol", "allantoin", "cica", "aloe"],
    "Large Pores": ["niacinamide", "salicylic acid", "clay", "witch hazel"],
}

GOAL_KEYWORDS: dict[str, list[str]] = {
    "Clear Skin": ["salicylic acid", "niacinamide", "tea tree"],
    "Anti-Aging": ["retinol", "peptide", "collagen"],
    "Even Tone": ["vitamin c", "ascorbic acid", "niacinamide", "alpha arbutin"],
    "Hydration": ["hyaluronic acid", "glycerin", "ceramide"],
}

# Also duplicated in apps/web/lib/rag/sensitivity-flags.ts, which still needs
# it for viewer-side ingredient flagging unrelated to this matching service.
SENSITIVITY_KEYWORDS: dict[str, list[str]] = {
    "Fragrance": ["fragrance", "parfum"],
    "Retinoids": ["retinol", "retinal", "tretinoin", "retinyl"],
    "Essential Oils": ["essential oil", "citrus oil", "lavender oil", "tea tree oil"],
    "Eczema-prone skin": ["fragrance", "alcohol denat", "sodium lauryl sulfate"],
    "Chemical Sunscreens": ["avobenzone", "oxybenzone", "octinoxate", "octocrylene", "homosalate"],
    "None of these": [],
}


# services/skin-scanning's scoring v2 (app/metrics.py) scores every one of
# the 5 metrics with the SAME linear formula: 95 at its "good" calibration
# anchor, 45 at its "poor" anchor, clamped 5-99. A raw score of 70 is now
# meaningfully the same thing on every metric — exactly halfway between
# those two anchors — so one shared threshold is the principled choice,
# where the old per-metric numbers (70/80/75/75/65) were leftover guesses
# from a prior, non-uniform heuristic scoring version. Kept equal to
# apps/web/lib/scan/score-bands.ts's "good" cutoff on purpose — a scan
# metric starts boosting ingredients exactly where the diagnostic report
# itself stops calling that metric "good".
SCAN_METRIC_BOOST_THRESHOLD = 70


def scan_metric_keywords(scan: Optional[dict]) -> list[str]:
    """Context resolution: boost ingredient keywords based on real scan metrics."""
    if not scan:
        return []
    boosts: list[str] = []
    if scan["hydration"] < SCAN_METRIC_BOOST_THRESHOLD:
        boosts += ["hyaluronic acid", "glycerin", "ceramide", "squalane"]
    if scan["elasticity"] < SCAN_METRIC_BOOST_THRESHOLD:
        boosts += ["peptide", "retinol", "collagen"]
    if scan["pigmentation"] < SCAN_METRIC_BOOST_THRESHOLD:
        boosts += ["vitamin c", "niacinamide", "alpha arbutin"]
    if scan["texture"] < SCAN_METRIC_BOOST_THRESHOLD:
        boosts += ["salicylic acid", "niacinamide"]
    if scan["pores"] < SCAN_METRIC_BOOST_THRESHOLD:
        boosts += ["niacinamide", "salicylic acid", "clay"]
    return boosts


_VEGAN_PATTERN = re.compile(r"\bvegan\b", re.IGNORECASE)
_CRUELTY_FREE_PATTERN = re.compile(r"cruelty[\s-]?free|not tested on animals|leaping bunny", re.IGNORECASE)
_FRAGRANCE_FREE_CLAIM_PATTERN = re.compile(r"fragrance[\s-]?free|unscented|non-?fragrance", re.IGNORECASE)
_FRAGRANCE_IN_INGREDIENTS_PATTERN = re.compile(r"fragrance|parfum", re.IGNORECASE)


def detect_ethical_tags(name_and_description: str, ingredients: Optional[str]) -> dict[str, bool]:
    """Dictionary + regex detection for ethical claims the real catalog doesn't tag structurally."""
    vegan = bool(_VEGAN_PATTERN.search(name_and_description))
    cruelty_free = bool(_CRUELTY_FREE_PATTERN.search(name_and_description))
    if ingredients:
        fragrance_free = bool(_FRAGRANCE_FREE_CLAIM_PATTERN.search(name_and_description)) or not bool(
            _FRAGRANCE_IN_INGREDIENTS_PATTERN.search(ingredients)
        )
    else:
        fragrance_free = bool(_FRAGRANCE_FREE_CLAIM_PATTERN.search(name_and_description))
    return {"vegan": vegan, "crueltyFree": cruelty_free, "fragranceFree": fragrance_free}
