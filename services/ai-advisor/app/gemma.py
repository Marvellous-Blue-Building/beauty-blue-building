"""
Loads Google's Gemma model from Kaggle Models (https://www.kaggle.com/models/google/gemma-2)
on first use and generates a skincare-advisor reply. This is the real fallback
path for chat messages the deterministic rule set and keyword/dictionary
matching (lib/chat/bot-reply.ts, lib/rag/) can't resolve — same honesty tier
as the rest of this project: a real local LLM call with real (if modest,
given the 2B CPU-friendly variant) generation quality, not a scripted reply.
"""

import os
import threading

import kagglehub
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

GEMMA_KAGGLE_HANDLE = os.environ.get(
    "GEMMA_KAGGLE_HANDLE", "google/gemma-2/transformers/gemma-2-2b-it"
)

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

_generator = None
_lock = threading.Lock()


def _load_generator():
    model_path = kagglehub.model_download(GEMMA_KAGGLE_HANDLE)
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    # Forced CPU, not "auto": on Apple Silicon, "auto" picks the MPS (Metal)
    # backend and, when the model doesn't fully fit in unified memory, disk-
    # offloads the rest — that combination crashes natively (MPSGraph
    # over-release) on first real generation. CPU is slower per token but
    # reliable, and the 2B variant is documented as CPU-practical anyway.
    model = AutoModelForCausalLM.from_pretrained(model_path, device_map="cpu")
    return pipeline("text-generation", model=model, tokenizer=tokenizer)


def get_generator():
    """Lazy, thread-safe load — keeps service startup/health checks fast;
    the first /advise call after boot pays the download+load cost instead."""
    global _generator
    if _generator is None:
        with _lock:
            if _generator is None:
                _generator = _load_generator()
    return _generator


def is_loaded() -> bool:
    return _generator is not None


def generate_reply(
    user_text: str,
    recognized_entities: list[str] | None = None,
    candidate_products: list[str] | None = None,
    conversation_context: list[str] | None = None,
) -> tuple[str, list[dict[str, str]]]:
    """Grounded when services/matching-service's /chat/understand pipeline
    (docs/plan.md SS4 steps 1-13) couldn't resolve a message deterministically
    but still recognized partial signal — step 14 synthesizes from that
    instead of the bare user question. Always replies in Bahasa Indonesia
    (see SYSTEM_PROMPT) regardless of the app's UI locale."""
    generator = get_generator()

    context_lines = []
    if recognized_entities:
        context_lines.append(f"Known relevant topic(s): {', '.join(recognized_entities)}.")
    if candidate_products:
        context_lines.append(f"Possibly relevant products: {'; '.join(candidate_products)}.")
    if conversation_context:
        context_lines.append("Recent conversation:\n" + "\n".join(conversation_context))
    context_block = ("\n".join(context_lines) + "\n\n") if context_lines else ""

    messages = [
        {
            "role": "user",
            "content": f"{SYSTEM_PROMPT}\n\n{context_block}User question: {user_text}",
        }
    ]
    prompt = generator.tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    output = generator(
        prompt,
        max_new_tokens=160,
        do_sample=True,
        temperature=0.7,
        top_p=0.9,
        pad_token_id=generator.tokenizer.eos_token_id,
    )
    generated_text = output[0]["generated_text"]
    reply = generated_text[len(prompt):].strip()

    nav_buttons = []
    if "[Track Your Progress]" in reply:
        nav_buttons.append({"label": "Track Your Progress", "target": "progress"})
    if "[Skin Scanning Analysis Tool]" in reply:
        nav_buttons.append({"label": "Skin Scanning Analysis Tool", "target": "progress/check-in"})

    return reply, nav_buttons
