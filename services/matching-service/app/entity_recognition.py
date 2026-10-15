"""Text -> recognized dictionary/ontology terms. Extracted out of
app/chat_pipeline.py so app/user_history.py can run the exact same
recognition over a user's past chat messages, not just their current one —
no duplicated vocabulary/logic between "what did they just say" and "what
have they said before"."""

import re

from app.dictionaries import BEAUTY_PRODUCT_ONTOLOGY, CONCERN_KEYWORDS, GOAL_KEYWORDS, PRODUCT_CATEGORY_WORDS_ID
from app.entities import ID_CONCERN_PHRASES, canonicalize
from app.fuzzy import fuzzy_match_terms

_WHITESPACE_PATTERN = re.compile(r"\s+")
_PUNCTUATION_PATTERN = re.compile(r"[^\w\s]")


def normalize_text(text: str) -> str:
    """Step 1: lowercase, strip punctuation, collapse whitespace."""
    lowered = text.lower()
    stripped = _PUNCTUATION_PATTERN.sub(" ", lowered)
    return _WHITESPACE_PATTERN.sub(" ", stripped).strip()


def _dictionary_vocabulary() -> list[str]:
    terms: set[str] = set()
    for keywords in CONCERN_KEYWORDS.values():
        terms.update(k.lower() for k in keywords)
    for keywords in GOAL_KEYWORDS.values():
        terms.update(k.lower() for k in keywords)
    return sorted(terms)


_DICTIONARY_VOCABULARY = _dictionary_vocabulary()


def _concern_goal_phrase_map() -> dict[str, list[str]]:
    """A chat message says "large pores" (the concern CATEGORY name), not
    one of its mapped ingredient keywords — this is the lookup that turns
    the former into the latter, same as the quiz flow's checkbox selection
    already does structurally for match_routine.py. Also covers the
    Bahasa Indonesia phrasing of the same concerns (ID_CONCERN_PHRASES),
    since users overwhelmingly ask in Indonesian."""
    mapping: dict[str, list[str]] = {}
    for concern, keywords in CONCERN_KEYWORDS.items():
        mapping[normalize_text(concern)] = keywords
    for goal, keywords in GOAL_KEYWORDS.items():
        mapping[normalize_text(goal)] = keywords
    for id_phrase, concern in ID_CONCERN_PHRASES.items():
        mapping[normalize_text(id_phrase)] = CONCERN_KEYWORDS[concern]
    return mapping


_CONCERN_GOAL_PHRASE_MAP = _concern_goal_phrase_map()


def _beauty_product_ontology_normalized() -> dict[str, str]:
    """normalize_text() strips hyphens/apostrophes ("peel-off mask" ->
    "peel off mask", "men's moisturizer" -> "men s moisturizer") — the
    ontology's own phrases need the identical normalization before
    substring-matching against already-normalized message text, or every
    phrase containing punctuation would simply never match. Keyed by the
    normalized form, valued by the original canonical phrase, so a hit
    still reports the clean "peel-off mask" rather than "peel off mask"."""
    return {normalize_text(phrase): phrase for phrase in BEAUTY_PRODUCT_ONTOLOGY}


_BEAUTY_PRODUCT_ONTOLOGY_NORMALIZED = _beauty_product_ontology_normalized()


def recognize_entities(normalized_text: str) -> list[str]:
    """Steps 2/4/6: exact dictionary hits (both direct ingredient-keyword
    mentions and concern/goal category-name phrases like "large pores") +
    fuzzy near-misses, canonicalized to the same vocabulary
    match_routine.py's dictionaries already use. Also recognizes a bare
    product-category noun ("sabun", "serum", ...) and a full product-type
    ontology phrase ("hyaluronic acid serum", "beard oil") on their own — a
    message that only names what KIND of product someone wants ("sabun
    cuci muka terbaik apa aja") never mentions an ingredient/concern/goal
    term at all, so without this it would recognize nothing and never
    search."""
    hits: set[str] = set()
    for term in _DICTIONARY_VOCABULARY:
        if term in normalized_text:
            hits.add(term)
    for phrase, keywords in _CONCERN_GOAL_PHRASE_MAP.items():
        if phrase in normalized_text:
            hits.update(k.lower() for k in keywords)
    for term in fuzzy_match_terms(normalized_text):
        hits.add(canonicalize(term))
    hits.update(set(normalized_text.split()) & PRODUCT_CATEGORY_WORDS_ID)
    for normalized_phrase, original_phrase in _BEAUTY_PRODUCT_ONTOLOGY_NORMALIZED.items():
        if normalized_phrase in normalized_text:
            hits.add(original_phrase)
    return sorted(hits)
