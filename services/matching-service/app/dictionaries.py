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

# Union of every ingredient keyword any concern/goal maps to — tells whether
# a message's recognized entities are facial-skin concern/active terms.
CONCERN_GOAL_INGREDIENTS: set[str] = {
    kw.lower() for kws in [*CONCERN_KEYWORDS.values(), *GOAL_KEYWORDS.values()] for kw in kws
}

# Real top-level DB categories that are NOT facial skin care (hair, makeup,
# body, fragrance, nails, oral/intimate, accessories/tools). A facial skin
# concern query is restricted away from these so e.g. an acne/dark-spot
# question can't surface a body lotion, hair shampoo, concealer or a makeup
# brush just because both mention a shared ingredient ("niacinamide",
# "vitamin c", "tea tree"). Applied in chat_pipeline.py only when the message
# is actually facial-concern-driven AND does not itself name a non-facial
# product type (see NON_FACIAL_PRODUCT_PHRASES in app/entities.py) — so
# "sampo untuk rambut kering" / "sabun badan" still return hair/body items.
NON_FACIAL_CATEGORIES: list[str] = [
    "accessories", "bath-and-body", "bath-and-body-set", "body-care",
    "body-cleanser", "body-fragrance", "eyes", "face", "facial",
    "feminine-sanitary", "fragrance", "gift-set", "gift-set-for-her",
    "grooming", "hair-care", "hair-care-set", "hair-tools", "hair-treatments",
    "lips", "makeup", "makeup-brushes", "makeup-palettes-and-set",
    "manicure-and-pedicure", "nail-beauty", "nail-care", "oral-care",
    "organizers", "others", "sanitary", "sociolla-gift-set", "shampoo",
    "shaving-and-grooming", "styling", "tools",
]

# A message that only names a product CATEGORY ("sabun cuci muka terbaik
# apa aja" — "what are the best face washes") never mentions an ingredient/
# concern/goal keyword at all, so CONCERN_KEYWORDS/GOAL_KEYWORDS alone
# would recognize nothing and (before this set existed) leave a genuine
# product request with zero candidates. Used by both app/intent.py's
# intent classification and app/entity_recognition.py's entity
# recognition — a word here is itself a valid search term once it's
# recognized (search_vector covers category text directly).
PRODUCT_CATEGORY_WORDS_ID = {
    "serum", "obat", "krim", "cream", "lotion", "sunscreen", "pelembap", "moisturizer",
    "toner", "masker", "mask", "essence", "cleanser", "pembersih", "sabun", "produk", "skincare",
}

# Subset of PRODUCT_CATEGORY_WORDS_ID that names no ACTUAL product category —
# "produk" ("product"), "obat" ("medicine"/"drug") and "skincare" are generic
# filler that happens to be in this set for intent classification's benefit
# ("produk apa yang bagus"), but carry zero retrieval signal: as FTS/trigram
# search terms they match the word across almost every product's description
# and admit completely unrelated items (a face brush or concealer for an acne
# query). entity_recognition.py subtracts this set before those words can
# become recognized entities / search terms.
GENERIC_PRODUCT_WORDS_ID = {"produk", "obat", "skincare"}

# Pattern dictionary / ontology of beauty & personal-care product TYPES
# (as opposed to CONCERN_KEYWORDS/GOAL_KEYWORDS, which are cosmetic
# INGREDIENTS). A message naming a specific product type — "cleansing
# balm", "hyaluronic acid serum", "beard oil" — is itself a valid search
# term the moment it's recognized (search_vector covers name/category/
# description text directly), the same role PRODUCT_CATEGORY_WORDS_ID
# plays for single common words; this is the longer, phrase-level
# complement to that set. Matched as a substring against normalized text
# (see app/entity_recognition.py), so multi-word phrases work the same way
# CONCERN_KEYWORDS/GOAL_KEYWORDS terms already do.
BEAUTY_PRODUCT_ONTOLOGY: list[str] = [
    # Face
    "facial cleanser", "cleansing oil", "cleansing balm", "micellar water",
    "facial toner", "hydrating toner", "exfoliating toner", "facial essence",
    "facial serum", "ampoule", "facial moisturizer", "face cream",
    "gel moisturizer", "facial lotion", "face oil", "sunscreen", "sunblock",
    "sunscreen stick", "sunscreen spray", "sunscreen serum", "eye cream",
    "eye serum", "eye patches", "face mask", "sheet mask", "sleeping mask",
    "clay mask", "peel-off mask", "exfoliating scrub", "chemical exfoliant",
    "acne treatment", "spot treatment", "pore strips", "blackhead remover",
    "facial mist", "makeup remover", "lip balm", "lip scrub", "neck cream",
    "facial treatment pads",
    # Hair & scalp
    "shampoo", "conditioner", "hair mask", "hair treatment", "hair serum",
    "hair oil", "leave-in conditioner", "hair milk", "hair tonic",
    "scalp serum", "scalp scrub", "scalp treatment", "anti-dandruff shampoo",
    "hair growth treatment", "heat protectant", "hair spray", "hair gel",
    "hair wax", "hair clay", "hair pomade", "hair mousse", "dry shampoo",
    "hair perfume", "hair dye", "hair bleach", "hair color conditioner",
    "hair straightening treatment", "curl cream", "hair detangler",
    "hair styling cream",
    # Body
    "body wash", "shower gel", "body soap", "body scrub", "body exfoliator",
    "body lotion", "body cream", "body butter", "body oil", "body serum",
    "body moisturizer", "body sunscreen", "hand cream", "foot cream",
    "heel balm", "elbow cream", "body acne treatment", "stretch mark cream",
    "firming lotion", "cellulite cream", "after-sun lotion", "body mist",
    "deodorant", "antiperspirant", "body powder", "foot spray",
    "hand sanitizer", "cuticle oil",
    # Oral / dental
    "toothpaste", "tooth whitening strips", "mouthwash", "dental floss",
    "toothbrush", "tongue cleaner", "breath spray",
    # Intimate / feminine care
    "feminine wash", "intimate moisturizer", "intimate wipes",
    "menstrual pads", "pantyliners", "tampons", "menstrual cup",
    # Hair removal / shaving
    "shaving cream", "aftershave balm", "hair removal cream",
    "waxing strips", "depilatory wax", "razor",
    # General hygiene
    "hand wash", "body wipes", "wet wipes", "antibacterial soap",
    # Fragrance
    "perfume", "eau de parfum", "eau de toilette", "eau de cologne",
    "perfume oil", "solid perfume", "deodorant spray", "fragrance lotion",
    "fragrance gift set",
    # Nails
    "nail polish", "gel nail polish", "nail strengthener", "nail treatment",
    "base coat", "top coat", "nail polish remover", "cuticle remover",
    "nail serum", "nail glue", "press-on nails", "nail art stickers",
    "nail hardener", "nail repair cream",
    # Supplements / ingestible wellness
    "collagen supplement", "biotin supplement",
    "hair skin and nails supplement", "vitamin c supplement",
    "vitamin e supplement", "zinc supplement", "general multivitamin",
    "probiotic supplement", "hydration electrolyte powder",
    "collagen drink", "beauty gummies", "protein powder",
    "herbal wellness drink",
    # Men's grooming
    "men's facial cleanser", "men's moisturizer", "beard oil", "beard balm",
    "beard shampoo", "beard conditioner",
    # Dermatological / targeted treatment
    "anti-aging cream", "retinol treatment", "vitamin c serum",
    "niacinamide serum", "hyaluronic acid serum", "ceramide cream",
    "barrier repair cream", "sensitive skin moisturizer",
    "rosacea-compatible skincare", "hyperpigmentation treatment",
    "dark spot corrector", "scar care gel", "keratosis pilaris treatment",
    "eczema-compatible moisturizer",
]

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
