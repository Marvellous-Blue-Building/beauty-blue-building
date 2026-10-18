"""Chat message -> Structured Understanding Object. Real implementation of
docs/plan.md SS4 steps 1 and 10-13 for free-text chat input (the quiz/scan
equivalent, match_routine.py, already implements this shape for structured
input) — orchestrates dictionaries.py (steps 2,4,6), fuzzy.py (step 5),
intent.py (step 7), and embeddings.py (steps 8-9)."""

from app.db import get_pool
from app.dictionaries import CONCERN_GOAL_INGREDIENTS, NON_FACIAL_CATEGORIES
from app.embeddings import encode, semantic_search
from app.entities import FACIAL_PRODUCT_PHRASES, INGREDIENT_FACTS, NON_FACIAL_PRODUCT_PHRASES
from app.entity_recognition import (
    normalize_text as _normalize,
    primary_concern_terms as _primary_concern_terms,
    recognize_entities as _recognize_entities,
)
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


async def _retrieve_candidates(
    normalized_text: str,
    primary_terms: list[str],
    context_terms: list[str] | None = None,
    exclude_categories: list[str] | None = None,
):
    """Steps 3/5/8/9/10: FTS + trigram + pgvector semantic search, merged
    into one ranked candidate list in a single query — same scoring shape
    as match_routine.py's _match_slot (dictionary-hit bonus on top of a
    base relevance score), extended with a semantic-similarity term.

    Two deliberately separate signal tiers (not collapsed into one term
    list, which was the bug this replaces):

      * `primary_terms` — what THIS message actually asked for (its own
        recognized entities, e.g. the acne ingredients for "produk untuk
        jerawat saya"). When present, a candidate MUST match one of them
        (FTS hit or fuzzy ingredient match) to be admitted at all.
      * `context_terms` — the user's history keywords + weather/holiday
        boost keywords. These only ADD to the ranking of already-admitted
        candidates; they can never admit one on their own. Previously all
        three were merged into the admission WHERE, so a past chat/scan
        term ("retinol", "collagen") or a shared ingredient that isn't
        category-specific ("tea tree", "zinc") could surface a completely
        unrelated product — e.g. a tea-tree/zinc SHAMPOO for an acne query.

    The semantic vector is built from the canonical English concepts in
    `primary_terms` when we have them: the user is usually writing
    Indonesian, but all-MiniLM-L6-v2 is English-trained, so embedding the
    raw Indonesian message is noisy. The recognized entities already ARE
    the English translation of what the user meant, so they're what gets
    embedded (semantic user-input translation). With no recognized terms
    at all (a vague free-text fallback), there's nothing to translate and
    the raw normalized text is embedded instead.

    `exclude_categories` (top-level product categories to filter OUT) is the
    facial-concern scope computed in understand_chat_message — a facial
    concern request must not surface hair/body/makeup/fragrance/nail items
    that merely share an ingredient. Empty/None leaves it unfiltered.
    """
    pool = await get_pool()
    context_terms = context_terms or []
    has_primary = bool(primary_terms)
    primary_phrase = " OR ".join(primary_terms) if has_primary else normalized_text
    primary_blob = " ".join(primary_terms) if has_primary else normalized_text
    context_phrase = " OR ".join(context_terms)
    query_vector = encode(primary_blob)
    vector_literal = "[" + ",".join(str(v) for v in query_vector) + "]"

    params: list = [primary_phrase, primary_blob, vector_literal, context_phrase]
    category_filter = ""
    if exclude_categories:
        params.append(exclude_categories)
        category_filter = f"AND category <> ALL(${len(params)})"

    # Whenever we have real recognized keyword/ontology terms from THIS
    # message, a candidate MUST actually mention one somewhere (search_vector
    # now covers name/brand/category/description/usage_instructions) or be a
    # fuzzy ingredient match — the embedding/semantic term alone can never
    # admit a result on its own. all-MiniLM-L6-v2 is English-trained, so for
    # informal Indonesian queries its cosine similarities are noisy enough
    # that a completely unrelated product (e.g. eyelashes, for an acne
    # query) can otherwise outscore genuinely relevant ones on the semantic
    # term alone. Context terms are deliberately NOT in this filter — they
    # only re-rank below. With no recognized terms at all (a vague
    # free-text fallback), there's no lexical signal to require, so
    # semantic search stays the primary mechanism — its originally
    # intended fallback role (plan.md steps 8-9).
    lexical_filter = (
        "AND (search_vector @@ websearch_to_tsquery('simple', $1) OR similarity(COALESCE(ingredients, ''), $2) > 0.1)"
        if has_primary
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
            + ts_rank(search_vector, websearch_to_tsquery('simple', $4)) * 4
          ) AS merge_score,
          (SELECT count(*) FROM products p2 WHERE p2.parent_sku = products.parent_sku) AS variant_count,
          (SELECT array_agg(DISTINCT p3.color_variant) FROM products p3
            WHERE p3.parent_sku = products.parent_sku AND p3.color_variant IS NOT NULL AND p3.stock_quantity > 0) AS color_palette
        FROM products
        WHERE stock_quantity > 0
        {lexical_filter}
        {category_filter}
        ORDER BY merge_score DESC
        LIMIT 15
        """,
        *params,
    )
    return rows


async def understand_chat_message(
    text: str,
    conversation_id: str | None,
    environmental_context: str | None = None,
    boost_keywords: list[str] | None = None,
    user_id: str | None = None,
    language: str = "id",
) -> ChatUnderstanding:
    normalized_text = _normalize(text)
    recognized_entities = _recognize_entities(normalized_text)
    intent = classify_intent(normalized_text)
    conversation_context = await _fetch_conversation_context(conversation_id, normalized_text)
    if environmental_context:
        # Appended last so it reads as the most current grounding note when
        # step 14 (services/ai-advisor's Gemma call) consumes this list.
        conversation_context = [*conversation_context, f"context: {environmental_context}"]

    # Grounding Rule from COPY_KB.py:
    # weigh ALL of these signals that are actually present, together:
    # 1) shopper's own words, 2) Color/Face Shape Analysis result, 3) questionnaire answers.
    grounding_note = (
        "GROUNDING RULE: weigh ALL of these signals that are actually present, together: "
        "1) shopper's own words, 2) Color/Face Shape Analysis result, 3) questionnaire answers."
    )
    conversation_context = [*conversation_context, grounding_note]

    # Response Format Rule from COPY_KB.py:
    # your entire reply is ONE short opening sentence acknowledging what the shopper is looking for — nothing else.
    # NEVER name a specific product in the text; they are shown in cards below.
    format_note = (
        "RESPONSE FORMAT RULE: your entire reply is ONE short opening sentence acknowledging "
        "what the shopper is looking for — nothing else. NEVER name a specific "
        "product in the text; they are shown in cards below."
    )
    conversation_context = [*conversation_context, format_note]

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
    # The concern's headline ingredient (e.g. "vitamin c" for "noda hitam")
    # picks the reply fact that actually matches what was asked — otherwise
    # whichever of the concern's recognized ingredients sorts first wins
    # (niacinamide's acne fact answering a dark-spot question).
    primary_terms = _primary_concern_terms(normalized_text)
    matched_fact = (
        next((INGREDIENT_FACTS[t] for t in primary_terms if t in INGREDIENT_FACTS), None) or matched_fact
    )
    # Facial-concern scoping: a request driven by a facial concern/active
    # (or naming a facial product type) must not surface hair/body/makeup/
    # fragrance/nail items that merely share an ingredient — a tea-tree/zinc
    # shampoo, a concealer or a face brush for "produk untuk jerawat saya".
    # Skipped when the message itself names a non-facial product type, so
    # "sampo untuk rambut kering" / "sabun badan" keep their categories.
    is_facial_request = any(e in CONCERN_GOAL_INGREDIENTS for e in recognized_entities) or any(
        e in FACIAL_PRODUCT_PHRASES for e in recognized_entities
    )
    names_non_facial = any(e in NON_FACIAL_PRODUCT_PHRASES for e in recognized_entities)
    exclude_categories = NON_FACIAL_CATEGORIES if is_facial_request and not names_non_facial else None

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
        # THIS message's own entities are the admission gate; history/boost
        # keywords are passed separately as ranking-only context (see
        # _retrieve_candidates) so a past chat or scan can nudge ranking but
        # never introduce a product the user didn't actually ask about.
        rows = await _retrieve_candidates(
            normalized_text,
            recognized_entities,
            [*(boost_keywords or []), *history_keywords],
            exclude_categories,
        )
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

    # Agent-composed reply text is in Bahasa Indonesia by default — the AI
    # Advisor responds in Indonesian regardless of the app's UI locale (same
    # rule enforced in services/ai-advisor's SYSTEM_PROMPT for the
    # Gemma/step-14 side of this pipeline). `language="en"` is only sent by
    # the embeddable widget on an English host page; the ingredient facts are
    # Indonesian-only, so in English those questions defer to Gemma instead.
    english = language == "en"
    reply = None
    if intent == "ingredient_inquiry" and matched_fact:
        reply = None if english else matched_fact
    elif intent == "product_recommendation" and top_candidate:
        haystack = f"{top_candidate.name} {' '.join(i.name for i in top_candidate.inci)}".lower()
        hits = [e for e in recognized_entities if e in haystack]
        if english:
            why = f"Contains {' & '.join(hits[:2])}" if hits else f"A highly rated pick in {top_candidate.category}"
        else:
            why = f"Mengandung {' & '.join(hits[:2])}" if hits else f"Pilihan dengan rating bagus di kategori {top_candidate.category}"
        reply = f"{top_candidate.name} — {why}"
    elif intent == "routine_advice":
        reply = (
            "Morning: cleanse → treatment (serum) → moisturiser → SPF (always the last step). "
            "Night: cleanse → treatment → moisturiser (no SPF needed)."
        ) if english else (
            "Pagi: bersihkan wajah → treatment (serum) → pelembap → SPF (selalu di langkah terakhir). "
            "Malam: bersihkan wajah → treatment → pelembap (tidak perlu SPF)."
        )
    elif matched_fact and not english:
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
