"""User-level history signals — additional context threaded into both the
chat pipeline's candidate retrieval (app/chat_pipeline.py) and the
routine/diagnose-report product matching (app/routers/match_routine.py),
on top of the single current message/scan each already receives. Lets
both "remember" what a returning user has said across past conversations
and what their last several real skin scans actually measured — not just
the one request in front of them right now.
"""

import json

from app.db import get_pool
from app.dictionaries import scan_metric_keywords
from app.entity_recognition import normalize_text, recognize_entities


async def get_user_chat_keywords(user_id: str, limit: int = 30) -> list[str]:
    """Recognized entities from this user's own past chat messages, across
    every conversation they've ever had — not just the current one (see
    chat_pipeline.py's _fetch_conversation_context for the same-
    conversation equivalent)."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT cm.text
        FROM chat_messages cm
        JOIN chat_conversations cc ON cc.id = cm.conversation_id
        WHERE cc.user_id = $1 AND cm.role = 'user' AND cm.text IS NOT NULL
        ORDER BY cm.created_at DESC
        LIMIT $2
        """,
        user_id,
        limit,
    )
    joined = " ".join(r["text"] for r in rows)
    return recognize_entities(normalize_text(joined))


async def get_user_scan_keywords(user_id: str, limit: int = 5) -> list[str]:
    """Boost keywords from this user's last several real skin scans, not
    just the single current one a request happens to carry — surfaces a
    recurring concern even if today's scan looks fine on that one metric."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT raw_json_data
        FROM scan_results
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        """,
        user_id,
        limit,
    )
    keywords: list[str] = []
    for row in rows:
        try:
            data = json.loads(row["raw_json_data"])
        except (TypeError, ValueError):
            continue
        keywords += scan_metric_keywords(data)
    return list(dict.fromkeys(keywords))  # de-dupe, preserve first-seen order
