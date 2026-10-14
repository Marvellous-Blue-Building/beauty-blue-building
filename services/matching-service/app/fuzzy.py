"""RapidFuzz matching against the known skincare vocabulary — catches typos
exact substring matching misses (e.g. "niacinimide", "salicylic acidd").
docs/plan.md SS4 step 5."""

from rapidfuzz import fuzz

from app.dictionaries import CONCERN_KEYWORDS, GOAL_KEYWORDS
from app.entities import SYNONYM_CANONICALIZATION

FUZZY_THRESHOLD = 85


def _vocabulary() -> list[str]:
    terms: set[str] = set()
    for keywords in CONCERN_KEYWORDS.values():
        terms.update(k.lower() for k in keywords)
    for keywords in GOAL_KEYWORDS.values():
        terms.update(k.lower() for k in keywords)
    terms.update(SYNONYM_CANONICALIZATION.keys())
    terms.update(SYNONYM_CANONICALIZATION.values())
    return sorted(terms)


VOCABULARY = _vocabulary()


def fuzzy_match_terms(normalized_text: str, threshold: int = FUZZY_THRESHOLD) -> list[str]:
    """Scans the vocabulary for terms that fuzzy-match a same-length window
    of the message. Deliberately windowed full-string ratio() rather than a
    bare partial_ratio() against the whole message — partial_ratio() finds
    the best-aligned substring of any length, which on a short vocabulary
    term against a long unrelated sentence produces spurious high scores
    (e.g. "hyaluronic acid" vs. "what do you think about the weather today"
    scored >=85 in testing). Comparing only against windows matching the
    term's word count keeps this a real typo-catcher, not a false-positive
    generator."""
    words = normalized_text.split()
    hits: list[str] = []
    for term in VOCABULARY:
        term_word_count = len(term.split())
        windows = [" ".join(words[i : i + term_word_count]) for i in range(len(words) - term_word_count + 1)]
        if not windows:
            continue
        best_score = max(fuzz.ratio(term, window) for window in windows)
        if best_score >= threshold:
            hits.append(term)
    return hits
