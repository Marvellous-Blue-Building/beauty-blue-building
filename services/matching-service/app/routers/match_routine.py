"""
Real, live implementation of the questionnaire -> product matching pipeline
described in docs/plan.md SS4 ("Advanced Hybrid RAG Product Recommendation
Pipeline"), run against the actual 24,941-row `products` table — no mock
data, no fabricated scores. Faithful port of the original TypeScript
implementation (apps/web/lib/rag/match-routine.ts) — same SQL, same
dictionaries, same confidence/relaxation order.

What's genuinely implemented here (mapped to plan.md's 14 steps):
  1. Normalization        — quiz enums are already canonical; free text
                             (keyword phrases) is passed through
                             websearch_to_tsquery, which normalizes case/
                             punctuation itself.
  2. Dictionary matching   — CONCERN_KEYWORDS / GOAL_KEYWORDS / ethics
                             regex in app/dictionaries.py.
  4. Regex/structured ext. — budget (quiz value is already Rupiah) and
                             allergen exclusion via POSIX regex on real
                             INCI text.
  3. Postgres FTS          — ts_rank over the generated search_vector
                             column (name+brand+category).
  5. Fuzzy matching        — pg_trgm similarity() over real ingredient
                             text.
  6. Canonicalization      — the keyword dictionaries double as the
                             synonym table (quiz enum -> INCI vocabulary).
  10. Candidate merge/score — SQL prefilter (FTS+trigram+rating) -> Python-
                             side re-rank with dictionary-hit and ethics
                             bonuses.
  11. Context resolution   — scan_metric_keywords() boosts ingredient
                             keywords from the real scan payload.
  12. Confidence/ambiguity — budget then allergen constraints are
                             progressively relaxed on zero-result
                             candidate pools; `confidence` reflects this.
  13. Structured object    — MatchedRoutineStep below.

Explicitly NOT implemented (infrastructure doesn't exist yet, and this
project would rather be honest about that than fake it):
  8-9. Sentence-Transformers embeddings + pgvector semantic search — the
       `products.embedding` column is NULL for all rows; no embedding
       model is deployed.
  14. LLM synthesis — the "why" text below is template-generated from the
       real matched keywords, not an actual LLM call (no LLM API key is
       wired into this service yet).
"""

import re
from dataclasses import dataclass, field
from typing import Optional

from fastapi import APIRouter

from app.db import get_pool
from app.dictionaries import CONCERN_KEYWORDS, GOAL_KEYWORDS, SENSITIVITY_KEYWORDS, scan_metric_keywords
from app.product_row import to_product
from app.schemas import MatchedRoutine, MatchedRoutineStep, MatchRoutineRequest

router = APIRouter()


@dataclass
class SlotDef:
    step_number: int
    categories: list[str]
    priority_keywords: list[str]
    generic_why: str
    name_pattern: Optional[str] = None
    exclude_name_pattern: Optional[str] = None


def _escape_regex(s: str) -> str:
    return re.sub(r"[.*+?^${}()|\[\]\\]", lambda m: "\\" + m.group(0), s)


def _allergen_regex_for(sensitivities: list[str]) -> str:
    keywords: list[str] = []
    for s in sensitivities:
        if s != "None of these":
            keywords += SENSITIVITY_KEYWORDS.get(s, [])
    return "|".join(_escape_regex(k) for k in keywords)


def _contains_flagged_ingredient(ingredients: Optional[str], sensitivities: list[str]) -> bool:
    if not ingredients:
        return False
    keywords: list[str] = []
    for s in sensitivities:
        if s != "None of these":
            keywords += SENSITIVITY_KEYWORDS.get(s, [])
    lower = ingredients.lower()
    return any(kw.lower() in lower for kw in keywords)


@dataclass
class _Ctx:
    quiz: dict
    scan_keywords: list[str]
    exclude_ids: list[str] = field(default_factory=list)
    # From services/geotagging-weather's combined holiday+weather formula —
    # e.g. "Broad-Spectrum SPF 50+ Sunscreens" on a sunny day, or a holiday's
    # "Electrolyte & Hydrating Serums" — boosted the same way scan/concern
    # keywords already are.
    boost_keywords: list[str] = field(default_factory=list)


async def _match_slot(slot: SlotDef, ctx: _Ctx) -> Optional[MatchedRoutineStep]:
    pool = await get_pool()
    all_keywords = list(dict.fromkeys([*slot.priority_keywords, *ctx.scan_keywords, *ctx.boost_keywords]))
    search_phrase = " OR ".join(all_keywords)
    trigram_blob = " ".join(all_keywords)

    active_sensitivities = [s for s in ctx.quiz["sensitivities"] if s != "None of these"]
    budget_idr = ctx.quiz["budget"]
    allergen_regex = _allergen_regex_for(active_sensitivities)

    async def run_query(apply_budget: bool, apply_name_pattern: bool, apply_allergen_filter: bool):
        params: list = [slot.categories, search_phrase if all_keywords else "", trigram_blob]
        where = "category = ANY($1) AND stock_quantity > 0 AND (id != ALL($4::uuid[]))"
        params.append(ctx.exclude_ids)

        if slot.name_pattern and apply_name_pattern:
            params.append(slot.name_pattern)
            where += f" AND name ILIKE ${len(params)}"
        if slot.exclude_name_pattern:
            params.append(slot.exclude_name_pattern)
            where += f" AND name NOT ILIKE ${len(params)}"
        if apply_budget:
            params.append(budget_idr)
            where += f" AND price <= ${len(params)}"
        if apply_allergen_filter and allergen_regex:
            params.append(allergen_regex)
            where += f" AND (ingredients IS NULL OR ingredients !~* ${len(params)})"

        sql = f"""
            SELECT *,
              (
                ts_rank(search_vector, websearch_to_tsquery('simple', $2)) * 10
                + COALESCE(similarity(COALESCE(ingredients, ''), $3), 0) * 5
                + (COALESCE(rating, 3.5) / 5.0) * 3
              ) AS base_score,
              (SELECT count(*) FROM products p2 WHERE p2.parent_sku = products.parent_sku) AS variant_count,
              (SELECT array_agg(DISTINCT p3.color_variant) FROM products p3
                WHERE p3.parent_sku = products.parent_sku AND p3.color_variant IS NOT NULL AND p3.stock_quantity > 0) AS color_palette
            FROM products
            WHERE {where}
            ORDER BY base_score DESC, rating DESC NULLS LAST
            LIMIT 30
        """
        return await pool.fetch(sql, *params)

    # Confidence/ambiguity handling (plan.md step 12): progressively relax
    # constraints — cheapest-to-sacrifice first — until the real catalog
    # actually yields a candidate, rather than returning nothing.
    relaxed: list[str] = []
    rows = await run_query(apply_budget=True, apply_name_pattern=True, apply_allergen_filter=True)
    if not rows:
        relaxed.append("budget")
        rows = await run_query(apply_budget=False, apply_name_pattern=True, apply_allergen_filter=True)
    if not rows and slot.name_pattern:
        relaxed.append("name_pattern")
        rows = await run_query(apply_budget=False, apply_name_pattern=False, apply_allergen_filter=True)
    if not rows and active_sensitivities:
        relaxed.append("allergen")
        rows = await run_query(apply_budget=False, apply_name_pattern=False, apply_allergen_filter=False)
    if not rows:
        return None

    # Python-side re-rank: dictionary exact-hit bonus + ethics bonus
    # (candidate merge/scoring, plan.md step 10).
    ranked = []
    for row in rows:
        haystack = f"{row['name']} {row['ingredients'] or ''}".lower()
        dictionary_hits = [kw for kw in slot.priority_keywords if kw.lower() in haystack]
        environment_hits = [kw for kw in ctx.boost_keywords if kw.lower() in haystack]
        product = to_product(row)
        ethics_bonus = 0
        ethics = ctx.quiz["ethics"]
        if ethics["vegan"] and "Vegan" in product.tags:
            ethics_bonus += 2
        if ethics["crueltyFree"] and "Cruelty-Free" in product.tags:
            ethics_bonus += 2
        if ethics["fragranceFree"] and "Fragrance-Free" in product.tags:
            ethics_bonus += 2

        # Weighted below dictionary_hits (5) — today's holiday/weather is
        # contextual signal, not a substitute for the user's own stated
        # concerns/goals.
        final_score = float(row["base_score"]) + len(dictionary_hits) * 5 + ethics_bonus + len(environment_hits) * 3
        ranked.append(
            {
                "row": row,
                "product": product,
                "final_score": final_score,
                "dictionary_hits": dictionary_hits,
                "environment_hits": environment_hits,
            }
        )

    ranked.sort(key=lambda r: r["final_score"], reverse=True)
    top = ranked[0]
    still_flagged = _contains_flagged_ingredient(top["row"]["ingredients"], ctx.quiz["sensitivities"])

    match_percent = max(70, min(99, round(60 + top["final_score"])))
    if not relaxed and not still_flagged:
        confidence = "high"
    elif "allergen" in relaxed or still_flagged:
        confidence = "low"
    else:
        confidence = "medium"

    if top["dictionary_hits"]:
        why = f"Contains {' & '.join(top['dictionary_hits'][:2])} — matched to your profile"
    elif top["environment_hits"]:
        why = f"Contains {' & '.join(top['environment_hits'][:2])} — matched to today's weather/holiday"
    else:
        why = slot.generic_why

    product = top["product"]
    product.matchPercent = match_percent

    return MatchedRoutineStep(stepNumber=slot.step_number, why=why, confidence=confidence, product=product)


def _compact(steps: list[Optional[MatchedRoutineStep]]) -> list[str]:
    return [s.product.id for s in steps if s is not None]


def _compact_steps(steps: list[Optional[MatchedRoutineStep]]) -> list[MatchedRoutineStep]:
    return [s for s in steps if s is not None]


async def match_routine(quiz: dict, scan: Optional[dict], boost_keywords: Optional[list[str]] = None) -> MatchedRoutine:
    concern_keywords = [kw for c in quiz["concerns"] for kw in CONCERN_KEYWORDS.get(c, [])]
    goal_keywords = GOAL_KEYWORDS.get(quiz["goal"], []) if quiz["goal"] else []
    priority_keywords = list(dict.fromkeys([*concern_keywords, *goal_keywords]))
    scan_keywords = scan_metric_keywords(scan)

    def ctx(exclude_ids: Optional[list[str]] = None) -> _Ctx:
        return _Ctx(
            quiz=quiz,
            scan_keywords=scan_keywords,
            exclude_ids=exclude_ids or [],
            boost_keywords=boost_keywords or [],
        )

    am_cleanser = await _match_slot(
        SlotDef(
            step_number=1,
            categories=["cleanser"],
            priority_keywords=priority_keywords,
            generic_why="Removes overnight oil without stripping — a gentle first step",
        ),
        ctx(),
    )
    am_serum = await _match_slot(
        SlotDef(
            step_number=2,
            categories=["treatment", "skin-care"],
            name_pattern="%serum%",
            priority_keywords=priority_keywords,
            generic_why="Water-soluble — apply before richer creams",
        ),
        ctx(_compact([am_cleanser])),
    )
    am_moisturizer = await _match_slot(
        SlotDef(
            step_number=3,
            categories=["moisturizer"],
            priority_keywords=priority_keywords,
            generic_why="Hydrates without clogging pores",
        ),
        ctx(_compact([am_cleanser, am_serum])),
    )
    am_spf = await _match_slot(
        SlotDef(
            step_number=4,
            categories=["sun-care"],
            priority_keywords=[],
            generic_why="Final step — daily protection, non-negotiable",
        ),
        ctx(),
    )

    pm_cleanser = await _match_slot(
        SlotDef(
            step_number=1,
            categories=["cleanser"],
            name_pattern="%oil%",
            priority_keywords=priority_keywords,
            generic_why="Oil-based first cleanse — fully removes SPF & makeup",
        ),
        ctx(_compact([am_cleanser])),
    )
    pm_treatment = await _match_slot(
        SlotDef(
            step_number=2,
            categories=["treatment", "skin-care"],
            name_pattern="%serum%",
            priority_keywords=[*priority_keywords, "retinol", "salicylic acid"],
            generic_why="Active treatment step — introduce gradually",
        ),
        ctx(_compact([am_cleanser, am_serum, pm_cleanser])),
    )
    pm_moisturizer = await _match_slot(
        SlotDef(
            step_number=3,
            categories=["moisturizer"],
            name_pattern="%night%",
            priority_keywords=priority_keywords,
            generic_why="Seals in actives overnight",
        ),
        ctx(_compact([am_cleanser, am_serum, am_moisturizer, pm_cleanser])),
    )

    return MatchedRoutine(
        am=_compact_steps([am_cleanser, am_serum, am_moisturizer, am_spf]),
        pm=_compact_steps([pm_cleanser, pm_treatment, pm_moisturizer]),
    )


@router.post("/match-routine", response_model=MatchedRoutine)
async def post_match_routine(body: MatchRoutineRequest) -> MatchedRoutine:
    quiz = body.quiz.model_dump()
    scan = body.scan.model_dump() if body.scan else None
    return await match_routine(quiz, scan, boost_keywords=body.boostKeywords)
