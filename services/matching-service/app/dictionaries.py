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


def scan_metric_keywords(scan: Optional[dict]) -> list[str]:
    """Context resolution: boost ingredient keywords based on real scan metrics."""
    if not scan:
        return []
    boosts: list[str] = []
    if scan["hydration"] < 70:
        boosts += ["hyaluronic acid", "glycerin", "ceramide", "squalane"]
    if scan["elasticity"] < 80:
        boosts += ["peptide", "retinol", "collagen"]
    if scan["pigmentation"] < 75:
        boosts += ["vitamin c", "niacinamide", "alpha arbutin"]
    if scan["texture"] < 75:
        boosts += ["salicylic acid", "niacinamide"]
    if scan["pores"] < 65:
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
