"""Rule-based intent classification for chat messages — docs/plan.md SS4
step 7. Deliberately a transparent keyword ruleset, not a fabricated ML
classifier: there's no labeled training data for this app, and this
project's existing honesty tier (see match_routine.py, gemma.py docstrings)
is to not claim more than what's actually implemented."""

import re
from typing import Literal

from app.dictionaries import PRODUCT_CATEGORY_WORDS_ID

Intent = Literal["product_recommendation", "ingredient_inquiry", "routine_advice", "general_question"]

# English + Bahasa Indonesia patterns — the AI Advisor always responds in
# Indonesian (see services/ai-advisor's SYSTEM_PROMPT), and users
# overwhelmingly ask in Indonesian too (e.g. "cari obat jerawat murah dong",
# "serum murah bagus"), so this can't be English-only.
_PRODUCT_RECOMMENDATION_PATTERN = re.compile(
    r"\b(recommend|suggest|what should i use|what do you recommend|looking for|need a|"
    r"best .* for|which product|"
    r"cari|carikan|cariin|rekomendasi|rekomendasikan|rekomendasiin|mau beli|butuh|"
    r"ada gak|ada ga|tolong carikan)\b",
    re.IGNORECASE,
)
_ROUTINE_ADVICE_PATTERN = re.compile(
    r"\b(routine|order|morning steps|evening steps|what order|when should i apply|"
    r"am routine|pm routine|step by step|"
    r"urutan|rutinitas|langkah|tahapan)\b",
    re.IGNORECASE,
)
_INGREDIENT_INQUIRY_PATTERN = re.compile(
    r"\b(what is|what does|is .* safe|is .* good|does .* help|good for|side effect|"
    r"can i use|why use|benefits of|"
    r"apa itu|apakah .* aman|apakah .* bagus|apa manfaat|apa fungsi|boleh gak|boleh ga|"
    r"efek samping|kegunaan)\b",
    re.IGNORECASE,
)

# A message naming a product category alongside a price/quality adjective
# (e.g. "serum murah bagus", "sabun cuci muka terbaik") has no action verb
# at all, so the regex above won't catch it — this is a second, independent
# signal checked as a word-set intersection instead.
_QUALITY_PRICE_WORDS_ID = {
    "murah", "terjangkau", "bagus", "ampuh", "worth", "oke", "ok", "recommended",
    "terbaik", "favorit", "top",
}


def _mentions_product_noun_with_quality(normalized_text: str) -> bool:
    words = set(normalized_text.split())
    return bool(words & PRODUCT_CATEGORY_WORDS_ID) and bool(words & _QUALITY_PRICE_WORDS_ID)


def classify_intent(normalized_text: str) -> Intent:
    if _PRODUCT_RECOMMENDATION_PATTERN.search(normalized_text) or _mentions_product_noun_with_quality(
        normalized_text
    ):
        return "product_recommendation"
    if _ROUTINE_ADVICE_PATTERN.search(normalized_text):
        return "routine_advice"
    if _INGREDIENT_INQUIRY_PATTERN.search(normalized_text):
        return "ingredient_inquiry"
    return "general_question"
