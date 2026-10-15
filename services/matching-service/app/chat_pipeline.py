"""Chat message -> Structured Understanding Object. Real implementation of
docs/plan.md SS4 steps 1 and 10-13 for free-text chat input (the quiz/scan
equivalent, match_routine.py, already implements this shape for structured
input) — orchestrates dictionaries.py (steps 2,4,6), fuzzy.py (step 5),
intent.py (step 7), and embeddings.py (steps 8-9)."""

from app.db import get_pool
from app.embeddings import encode, semantic_search
from app.entities import INGREDIENT_FACTS
from app.entity_recognition import normalize_text as _normalize, recognize_entities as _recognize_entities
from app.intent import classify_intent
from app.product_row import to_product
from app.schemas import ChatUnderstanding
from app.user_history import get_user_chat_keywords, get_user_scan_keywords


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


async def _retrieve_candidates(normalized_text: str, recognized_entities: list[str], boost_keywords: list[str] | None = None):
    """Steps 3/5/8/9/10: FTS + trigram + pgvector semantic search, merged
    into one ranked candidate list in a single query — same scoring shape
    as match_routine.py's _match_slot (dictionary-hit bonus on top of a
    base relevance score), extended with a semantic-similarity term.

    `boost_keywords` is services/geotagging-weather's combined holiday+
    weather formula output (e.g. "Broad-Spectrum SPF 50+ Sunscreens") —
    folded into the same search/trigram terms as the user's own recognized
    entities, so today's weather/holiday nudges candidate ranking without
    overriding what the user actually asked for."""
    pool = await get_pool()
    combined_terms = [*recognized_entities, *(boost_keywords or [])]
    search_phrase = " OR ".join(combined_terms) if combined_terms else normalized_text
    trigram_blob = " ".join(combined_terms) if combined_terms else normalized_text
    query_vector = encode(normalized_text)
    vector_literal = "[" + ",".join(str(v) for v in query_vector) + "]"

    # Whenever we have real recognized keyword/ontology terms, a candidate
    # MUST actually mention one somewhere (search_vector now covers name/
    # brand/category/description/usage_instructions) or be a fuzzy
    # ingredient match — the embedding/semantic term alone can never admit
    # a result on its own. all-MiniLM-L6-v2 is English-trained, so for
    # informal Indonesian queries its cosine similarities are noisy enough
    # that a completely unrelated product (e.g. eyelashes, for an acne
    # query) can otherwise outscore genuinely relevant ones on the
    # semantic term alone. With no recognized terms at all (a vague
    # free-text fallback), there's no lexical signal to require, so
    # semantic search stays the primary mechanism — its originally
    # intended fallback role (plan.md steps 8-9).
    lexical_filter = (
        "AND (search_vector @@ websearch_to_tsquery('simple', $1) OR similarity(COALESCE(ingredients, ''), $2) > 0.1)"
        if combined_terms
        else ""
    )

    rows = await pool.fetch(
        f"""
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
        {lexical_filter}
        ORDER BY merge_score DESC
        LIMIT 15
        """,
        search_phrase,
        trigram_blob,
        vector_literal,
    )
    return rows


async def understand_chat_message(
    text: str,
    conversation_id: str | None,
    environmental_context: str | None = None,
    boost_keywords: list[str] | None = None,
    user_id: str | None = None,
) -> ChatUnderstanding:
    normalized_text = _normalize(text)
    recognized_entities = _recognize_entities(normalized_text)
    intent = classify_intent(normalized_text)
    conversation_context = await _fetch_conversation_context(conversation_id, normalized_text)
    if environmental_context:
        # Appended last so it reads as the most current grounding note when
        # step 14 (services/ai-advisor's Gemma call) consumes this list.
        conversation_context = [*conversation_context, f"context: {environmental_context}"]

    # Learns from this user's OWN history, not just the single message/scan
    # in front of it right now — recognized entities from every chat
    # message they've ever sent (across all their conversations, not just
    # this one) plus boost keywords from their last several real skin
    # scans (not just whichever one happens to be current). Both fold into
    # the same product-matching signal as the current message's own
    # recognized entities, and are surfaced to step 14 (Gemma) as an
    # explicit grounding note so it can reference them in its reply too.
    history_keywords: list[str] = []
    if user_id:
        history_keywords = [*(await get_user_chat_keywords(user_id)), *(await get_user_scan_keywords(user_id))]
        if history_keywords:
            conversation_context = [
                *conversation_context,
                f"riwayat pengguna (percakapan & pemindaian kulit sebelumnya): {', '.join(dict.fromkeys(history_keywords))}",
            ]

    matched_fact = next((INGREDIENT_FACTS[e] for e in recognized_entities if e in INGREDIENT_FACTS), None)
    # Whenever the pipeline actually recognized a keyword/ontology term in
    # the user's own message, a product search always runs and always
    # surfaces its closest match — independent of how classify_intent
    # happened to bucket the sentence structure. Without a recognized term
    # at all (a bare "halo"/greeting), there's nothing meaningful to search
    # on, so this still falls back to the narrower intent-based gate.
    needs_candidates = (
        bool(recognized_entities)
        or intent in ("product_recommendation", "routine_advice")
        or (intent == "ingredient_inquiry" and matched_fact is None)
    )

    candidates: list = []
    top_candidate = None
    top_score = 0.0
    if needs_candidates:
        rows = await _retrieve_candidates(normalized_text, recognized_entities, [*(boost_keywords or []), *history_keywords])
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
