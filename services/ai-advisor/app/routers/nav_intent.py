from fastapi import APIRouter

from app.schemas import NavIntentRequest, NavIntentResponse
from app.skin_intent_detector import SkinAnalysisIntentDetector

router = APIRouter()

_detector = SkinAnalysisIntentDetector()

SCAN_BUTTON = {"label": "Skin Scanning Analysis Tool", "target": "progress/check-in"}
PROGRESS_BUTTON = {"label": "Track Your Progress", "target": "progress"}

# Maps SkinAnalysisIntentDetector's intent ids to the nav button(s) each one
# calls for. SKIN_PROGRESS_COMPARE and SKIN_PROGRESS_TREND always surface
# both buttons — comparing scans or asking about a trend is meaningless
# without both a history to look back on (Track Your Progress) and a way to
# add a fresh data point (Skin Scanning Analysis Tool).
_INTENT_NAV_BUTTONS = {
    "FACE_SCAN_START": [SCAN_BUTTON],
    "SKIN_PROGRESS_VIEW": [PROGRESS_BUTTON],
    "SKIN_PROGRESS_COMPARE": [SCAN_BUTTON, PROGRESS_BUTTON],
    "SKIN_PROGRESS_TREND": [SCAN_BUTTON, PROGRESS_BUTTON],
}


@router.post("/detect-nav-intent", response_model=NavIntentResponse)
def detect_nav_intent(payload: NavIntentRequest):
    """Classifies whether a chat message calls for a nav button (skin scan,
    progress tracking) — the same real detector used nowhere until now
    (skin_intent_detector.py). Lets apps/web's deterministic-reply branch
    (lib/chat/bot-reply.ts) surface nav buttons without its own keyword
    regex, matching the honesty tier of this service (see gemma.py's
    SYSTEM_PROMPT, which does the equivalent for the Gemma fallback).

    Uses detect_all rather than detect's single best match — a message
    naming both a scan ("scan kulit") and a progress check ("lihat
    progress") in the same breath isn't ambiguous, it's asking for both, so
    this surfaces every intent with a real keyword match instead of
    discarding all but the highest-scoring one."""
    matches = _detector.detect_all(payload.message)
    nav_buttons: list[dict[str, str]] = []
    seen_targets: set[str] = set()
    for intent, _confidence in matches:
        for button in _INTENT_NAV_BUTTONS.get(intent, []):
            if button["target"] not in seen_targets:
                seen_targets.add(button["target"])
                nav_buttons.append(button)
    return NavIntentResponse(navButtons=nav_buttons)
