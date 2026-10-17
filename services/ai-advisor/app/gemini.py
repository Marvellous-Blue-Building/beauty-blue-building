"""
Calls Google's Gemini (via the google-genai SDK) to generate a skincare-
advisor reply. This is the real fallback path for chat messages the
deterministic rule set and keyword/dictionary matching
(lib/chat/bot-reply.ts, lib/rag/) can't resolve — a real LLM call, not a
scripted reply.

Replaces the earlier local Gemma setup (kagglehub + transformers + torch):
no model weights to download or load, so there's no CPU/memory sizing
concern and no first-request warm-up cost beyond the API round trip.

Two auth modes, picked automatically from what's set:
  - GOOGLE_CLOUD_PROJECT set -> Vertex AI. Authenticates via Application
    Default Credentials — on Cloud Run that's the service account's own
    identity (needs the roles/aiplatform.user IAM role), no secret to
    manage. This is the production/Cloud Run path.
  - otherwise GEMINI_API_KEY -> the Gemini Developer API (API-key auth,
    free tier via https://aistudio.google.com/apikey). Simpler for local
    dev when a GCP project isn't set up yet.
"""

import os

from google import genai
from google.genai import types

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

SYSTEM_PROMPT = (
    "You are the AI Advisor inside a skincare app. Always respond in Bahasa "
    "Indonesia, regardless of what language the question is asked in. Give a "
    "short, friendly, practical answer (2-3 sentences) about skincare "
    "ingredients, routines, or concerns. If the question describes a serious "
    "or medical-sounding skin condition, recommend seeing a dermatologist "
    "instead of self-treating. Do not invent specific product names. "
    "CRITICAL: If the user is simply looking for a specific product (e.g., 'cari eye shadow', 'produk bibir', 'lipstick'), "
    "do NOT suggest the Skin Scanning Analysis Tool. Simply answer their query and let the product cards handle the recommendation. "
    "MANDATORY TOOL TAGS: You MUST append these tags at the very end of your response "
    "if the user's intent matches: "
    "- If user wants to check/scan/analyze skin (e.g., 'cek kulit', 'scan kulit'): "
    "Append ' [Skin Scanning Analysis Tool]' "
    "- If user wants to track progress/check improvement (e.g., 'cek progres', 'track progress'): "
    "Append ' [Track Your Progress]' "
    "You MUST add the tag even if you provide a conversational answer. No exceptions."
)


_client: genai.Client | None = None


def _build_client() -> genai.Client:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    if project:
        return genai.Client(
            vertexai=True,
            project=project,
            location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
        )

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Set GOOGLE_CLOUD_PROJECT (Vertex AI — the Cloud Run deployment path) "
            "or GEMINI_API_KEY (Gemini Developer API — the local-dev path) "
            "before calling /advise."
        )
    return genai.Client(api_key=api_key)


def get_client() -> genai.Client:
    """Lazy init — keeps service startup/health checks fast and surfaces a
    missing/invalid credential as a request-time 503, not a boot crash."""
    global _client
    if _client is None:
        _client = _build_client()
    return _client


def is_ready() -> bool:
    return _client is not None


def generate_reply(
    user_text: str,
    recognized_entities: list[str] | None = None,
    candidate_products: list[str] | None = None,
    conversation_context: list[str] | None = None,
) -> str:
    """Grounded when services/matching-service's /chat/understand pipeline
    (docs/plan.md SS4 steps 1-13) couldn't resolve a message deterministically
    but still recognized partial signal — step 14 synthesizes from that
    instead of the bare user question. Always replies in Bahasa Indonesia
    (see SYSTEM_PROMPT) regardless of the app's UI locale.

    Nav buttons (skin scan / progress tracking) are NOT decided here —
    apps/web's bot-reply.ts calls this service's own /detect-nav-intent
    (skin_intent_detector.py) against the raw user message instead, since
    that's a real, testable classifier rather than trusting an LLM to
    reliably self-tag its own free-text reply."""
    client = get_client()

    context_lines = []
    if recognized_entities:
        context_lines.append(f"Known relevant topic(s): {', '.join(recognized_entities)}.")
    if candidate_products:
        context_lines.append(f"Possibly relevant products: {'; '.join(candidate_products)}.")
    if conversation_context:
        context_lines.append("Recent conversation:\n" + "\n".join(conversation_context))
    context_block = ("\n".join(context_lines) + "\n\n") if context_lines else ""

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=f"{context_block}User question: {user_text}",
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.7,
            top_p=0.9,
            max_output_tokens=200,
        ),
    )
    return (response.text or "").strip()
