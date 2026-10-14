"""Chat message -> Structured Understanding Object. Real implementation of
docs/plan.md SS4 steps 1 and 10-13 for free-text chat input (the quiz/scan
equivalent, match_routine.py, already implements this shape for structured
input) — orchestrates dictionaries.py (steps 2,4,6), fuzzy.py (step 5),
intent.py (step 7), and embeddings.py (steps 8-9)."""

import re

from app.db import get_pool
from app.dictionaries import CONCERN_KEYWORDS, GOAL_KEYWORDS
from app.embeddings import encode, semantic_search
from app.entities import ID_CONCERN_PHRASES, INGREDIENT_FACTS, canonicalize
from app.fuzzy import fuzzy_match_terms
from app.intent import classify_intent
from app.product_row import to_product
from app.schemas import ChatUnderstanding

_WHITESPACE_PATTERN = re.compile(r"\s+")
_PUNCTUATION_PATTERN = re.compile(r"[^\w\s]")


def _normalize(text: str) -> str:
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
        mapping[_normalize(concern)] = keywords
    for goal, keywords in GOAL_KEYWORDS.items():
        mapping[_normalize(goal)] = keywords
    for id_phrase, concern in ID_CONCERN_PHRASES.items():
        mapping[_normalize(id_phrase)] = CONCERN_KEYWORDS[concern]
    return mapping


_CONCERN_GOAL_PHRASE_MAP = _concern_goal_phrase_map()


def _recognize_entities(normalized_text: str) -> list[str]:
    """Steps 2/4/6: exact dictionary hits (both direct ingredient-keyword
    mentions and concern/goal category-name phrases like "large pores") +
    fuzzy near-misses, canonicalized to the same vocabulary
    match_routine.py's dictionaries already use."""
    hits: set[str] = set()
    for term in _DICTIONARY_VOCABULARY:
        if term in normalized_text:
            hits.add(term)
    for phrase, keywords in _CONCERN_GOAL_PHRASE_MAP.items():
        if phrase in normalized_text:
            hits.update(k.lower() for k in keywords)
    for term in fuzzy_match_terms(normalized_text):
        hits.add(canonicalize(term))
    return sorted(hits)


async def _fetch_conversation_context(
    conversation_id: str | None, normalized_text: str, recent_limit: int = 6, fts_limit: int = 6
) -> list[str]:
    """Step 11, extended: combines two real data sources for grounding
    (e.g. a Gemma call for a follow-up message) instead of recency alone —

      1. The most recent messages (conversational flow / immediate
         follow-ups like "is it vegan?").
      2. A PostgreSQL FTS pass (websearch_to_tsquery + ts_rank, same
         mechanism match_routine.py/chat_pipeline.py already use against
         products) over this conversation's ENTIRE message history — not
         capped to the recent window — so an older relevant message isn't
         lost just because the conversation has moved on since.

    Deduped and returned in chronological order so the combined context
    reads coherently."""
    if not conversation_id:
        return []
    pool = await get_pool()

    recent_rows = await pool.fetch(
        """
        SELECT id, role, text, created_at FROM chat_messages
        WHERE conversation_id = $1 AND text IS NOT NULL
        ORDER BY created_at DESC LIMIT $2
        """,
        conversation_id,
        recent_limit,
    )

    fts_rows = []
    if normalized_text:
        fts_rows = await pool.fetch(
            """
            SELECT id, role, text, created_at
            FROM chat_messages
            WHERE conversation_id = $1 AND text IS NOT NULL
              AND to_tsvector('simple', text) @@ websearch_to_tsquery('simple', $2)
            ORDER BY ts_rank(to_tsvector('simple', text), websearch_to_tsquery('simple', $2)) DESC
            LIMIT $3
            """,
            conversation_id,
            normalized_text,
            fts_limit,
        )

    combined = {row["id"]: row for row in [*recent_rows, *fts_rows]}
    ordered = sorted(combined.values(), key=lambda r: r["created_at"])
    return [f"{r['role']}: {r['text']}" for r in ordered]


async def _retrieve_candidates(normalized_text: str, recognized_entities: list[str]):
    """Steps 3/5/8/9/10: FTS + trigram + pgvector semantic search, merged
    into one ranked candidate list in a single query — same scoring shape
    as match_routine.py's _match_slot (dictionary-hit bonus on top of a
    base relevance score), extended with a semantic-similarity term."""
    pool = await get_pool()
    search_phrase = " OR ".join(recognized_entities) if recognized_entities else normalized_text
    trigram_blob = " ".join(recognized_entities) if recognized_entities else normalized_text
    query_vector = encode(normalized_text)
    vector_literal = "[" + ",".join(str(v) for v in query_vector) + "]"

    rows = await pool.fetch(
        """
        SELECT *,
          (
            ts_rank(search_vector, websearch_to_tsquery('simple', $1)) * 10
            + COALESCE(similarity(COALESCE(ingredients, ''), $2), 0) * 5
            + COALESCE(1 - (embedding <=> $3::vector), 0) * 8
            + (COALESCE(rating, 3.5) / 5.0) * 2
          ) AS merge_score,
          (SELECT count(*) FROM products p2 WHERE p2.parent_sku = products.parent_sku) AS variant_count,
          (SELECT array_agg(DISTINCT p3.color_variant) FROM products p3
            WHERE p3.parent_sku = products.parent_sku AND p3.color_variant IS NOT NULL AND p3.stock_quantity > 0) AS color_palette
        FROM products
        WHERE stock_quantity > 0
        ORDER BY merge_score DESC
        LIMIT 15
        """,
        search_phrase,
        trigram_blob,
        vector_literal,
    )
    return rows


async def understand_chat_message(text: str, conversation_id: str | None) -> ChatUnderstanding:
    normalized_text = _normalize(text)
    recognized_entities = _recognize_entities(normalized_text)
    intent = classify_intent(normalized_text)
    conversation_context = await _fetch_conversation_context(conversation_id, normalized_text)

    matched_fact = next((INGREDIENT_FACTS[e] for e in recognized_entities if e in INGREDIENT_FACTS), None)
    needs_candidates = intent in ("product_recommendation", "routine_advice") or (
        intent == "ingredient_inquiry" and matched_fact is None
    )

    candidates: list = []
    top_candidate = None
    top_score = 0.0
    if needs_candidates:
        rows = await _retrieve_candidates(normalized_text, recognized_entities)
        if rows:
            # Top 6 closest-ranked DISTINCT items (by parent_sku) for the
            # chat UI's full-width product list — the ranked pool often has
            # several color/size variant rows of the same product back to
            # back, which would otherwise fill all 6 slots with one item.
            seen_parent_skus: set = set()
            distinct_rows = []
            for r in rows:
                if r["parent_sku"] in seen_parent_skus:
                    continue
                seen_parent_skus.add(r["parent_sku"])
                distinct_rows.append(r)
                if len(distinct_rows) == 6:
                    break
            candidates = [to_product(r) for r in distinct_rows]
            top_candidate = candidates[0]
            # Rough normalization — the merge_score's theoretical max is
            # ~25 (10 FTS + 5 trigram + 8 vector + 2 rating); clamp to 0-1.
            top_score = max(0.0, min(1.0, float(rows[0]["merge_score"]) / 20))

    # Step 12: confidence/ambiguity scoring. Confidence is the numeric
    # signal strength; is_ambiguous additionally requires that step 7/13
    # actually produced a real deterministic reply below — a "confident"
    # classification with nothing to say (e.g. a recognized ingredient with
    # no canned fact and no strong candidate) must still defer to Gemma,
    # not claim resolution it doesn't have.
    score = 0.4 * (1.0 if recognized_entities else 0.0) + 0.2 * (1.0 if intent != "general_question" else 0.0) + 0.4 * top_score
    if score >= 0.7:
        confidence = "high"
    elif score >= 0.4:
        confidence = "medium"
    else:
        confidence = "low"

    # All agent-composed reply text here is in Bahasa Indonesia — the AI
    # Advisor always responds in Indonesian regardless of the app's UI
    # locale (same rule enforced in services/ai-advisor's SYSTEM_PROMPT for
    # the Gemma/step-14 side of this pipeline).
    reply = None
    if intent == "ingredient_inquiry" and matched_fact:
        reply = matched_fact
    elif intent == "product_recommendation" and top_candidate:
        haystack = f"{top_candidate.name} {' '.join(i.name for i in top_candidate.inci)}".lower()
        hits = [e for e in recognized_entities if e in haystack]
        why = f"Mengandung {' & '.join(hits[:2])}" if hits else f"Pilihan dengan rating bagus di kategori {top_candidate.category}"
        reply = f"{top_candidate.name} — {why}"
    elif intent == "routine_advice":
        reply = (
            "Pagi: bersihkan wajah → treatment (serum) → pelembap → SPF (selalu di langkah terakhir). "
            "Malam: bersihkan wajah → treatment → pelembap (tidak perlu SPF)."
        )
    elif matched_fact:
        reply = matched_fact

    is_ambiguous = confidence == "low" or reply is None

    return ChatUnderstanding(
        normalizedText=normalized_text,
        recognizedEntities=recognized_entities,
        intent=intent,
        confidence=confidence,
        isAmbiguous=is_ambiguous,
        reply=reply,
        topCandidate=top_candidate,
        candidates=candidates,
        conversationContext=conversation_context,
    )
