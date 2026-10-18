"""
Vera Intelligence — the tenant-facing analytics chat on the admin
dashboard (distinct persona/system prompt from the shopper-facing Gemini
advisor in gemini.py, but shares the same Vertex AI / Gemini Developer API
client and auth setup).

Answers questions like "why did 9.9 underperform" or "what should we do
for 11.11" by reasoning ONLY over the data block apps/web assembles from
Postgres (sales, events, alerts — see app/api/admin/insight/route.ts) and
passes in as `data_context`. Never invents numbers.
"""

from google.genai import types

from app.gemini import GEMINI_MODEL, get_client

SYSTEM_PROMPT = (
    "You are Vera Intelligence, a retail analytics strategist embedded in a "
    "beauty brand's tenant dashboard. You answer the brand's own team "
    "(not shoppers) about their sales, events/promos, and demand-signal "
    "alerts. Always respond in Bahasa Indonesia. "
    "Base every claim strictly on the DATA block you're given below — "
    "cite concrete numbers, dates, and event names from it. If the data "
    "doesn't cover something the question asks about, say so plainly "
    "instead of guessing. Some numbers are clearly marked as sample/demo "
    "data — if so, mention briefly that the analysis uses sample data. "
    "When asked for strategy or recommendations, give 2-4 concrete, "
    "actionable suggestions grounded in what the data actually shows "
    "(e.g. what changed between a weak event and a strong one), not "
    "generic marketing advice. Keep the whole answer under roughly 180 "
    "words — short paragraphs or a short bulleted list, never a wall of "
    "text, and always finish your last sentence instead of trailing off."
)


def generate_insight_reply(
    user_text: str,
    data_context: str = "",
    conversation_context: list[str] | None = None,
) -> str:
    client = get_client()

    context_lines = []
    if data_context:
        context_lines.append(f"DATA:\n{data_context}")
    if conversation_context:
        context_lines.append("Recent conversation:\n" + "\n".join(conversation_context))
    context_block = ("\n\n".join(context_lines) + "\n\n") if context_lines else ""

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=f"{context_block}Question: {user_text}",
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.4,
            top_p=0.9,
            max_output_tokens=1400,
            # See gemini.py's note on gemini-2.5-flash's default "thinking"
            # eating the whole output-token budget — off for the same reason.
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    return (response.text or "").strip()
