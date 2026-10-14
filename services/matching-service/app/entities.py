"""Synonym canonicalization + ingredient facts for free-text chat messages —
the chat-pipeline equivalent of app/dictionaries.py's quiz-enum vocabulary,
steps 6 and 2 of docs/plan.md SS4."""

SYNONYM_CANONICALIZATION: dict[str, str] = {
    "vit c": "vitamin c",
    "vitc": "vitamin c",
    "ascorbic acid": "vitamin c",
    "bha": "salicylic acid",
    "aha": "glycolic acid",
    "ha": "hyaluronic acid",
    "niacinimide": "niacinamide",
    "niacinamide": "niacinamide",
    "retin a": "retinol",
    "tret": "tretinoin",
    "spf": "sunscreen",
    "sun screen": "sunscreen",
    "cica": "centella",
    "centella asiatica": "centella",
}

# Bahasa Indonesia concern-name phrases -> the English CONCERN_KEYWORDS /
# GOAL_KEYWORDS category key they correspond to (app/dictionaries.py) — the
# chat pipeline's _concern_goal_phrase_map() expands these the same way it
# already does for the English category names, so "cari obat jerawat murah"
# recognizes "jerawat" -> the Acne & Breakouts ingredient vocabulary just
# like a quiz user selecting "Acne & Breakouts" would.
ID_CONCERN_PHRASES: dict[str, str] = {
    "jerawat": "Acne & Breakouts",
    "berjerawat": "Acne & Breakouts",
    "bruntusan": "Acne & Breakouts",
    "garis halus": "Fine Lines & Aging",
    "kerutan": "Fine Lines & Aging",
    "penuaan": "Fine Lines & Aging",
    "noda hitam": "Dark Spots / Hyperpigmentation",
    "flek hitam": "Dark Spots / Hyperpigmentation",
    "bekas jerawat": "Dark Spots / Hyperpigmentation",
    "kering": "Dryness & Dehydration",
    "dehidrasi": "Dryness & Dehydration",
    "kemerahan": "Redness & Irritation",
    "iritasi": "Redness & Irritation",
    "sensitif": "Redness & Irritation",
    "pori besar": "Large Pores",
    "pori pori besar": "Large Pores",
}

# Ported from the old apps/web/lib/chat/bot-reply.ts RULES, now in Bahasa
# Indonesia (the AI Advisor always responds in Indonesian — see
# services/ai-advisor's SYSTEM_PROMPT for the Gemma side of this same
# rule) — same honesty tier as the rest of this service: real skincare
# knowledge, not a fabricated LLM claim. Keyed by the canonical term
# recognized_entities produces (see chat_pipeline.py), so this is the
# single source of truth for that content instead of duplicated regex in
# the Next.js app.
INGREDIENT_FACTS: dict[str, str] = {
    "retinol": (
        "Retinoid itu ampuh untuk tekstur dan garis halus, tapi perkenalkan secara bertahap — "
        "mulai 2-3 malam seminggu dan selalu pakai SPF di pagi harinya."
    ),
    "retinal": (
        "Retinoid itu ampuh untuk tekstur dan garis halus, tapi perkenalkan secara bertahap — "
        "mulai 2-3 malam seminggu dan selalu pakai SPF di pagi harinya."
    ),
    "tretinoin": (
        "Retinoid itu ampuh untuk tekstur dan garis halus, tapi perkenalkan secara bertahap — "
        "mulai 2-3 malam seminggu dan selalu pakai SPF di pagi harinya."
    ),
    "salicylic acid": (
        "Untuk kulit berjerawat, salicylic acid dan niacinamide pilihan yang solid — "
        "membantu membersihkan pori tanpa bikin kulit terlalu kering."
    ),
    "niacinamide": (
        "Untuk kulit berjerawat, salicylic acid dan niacinamide pilihan yang solid — "
        "membantu membersihkan pori tanpa bikin kulit terlalu kering."
    ),
    "vitamin c": (
        "Vitamin C dan niacinamide membantu memudarkan noda hitam seiring waktu. "
        "Konsistensi dan SPF harian adalah kuncinya."
    ),
    "hyaluronic acid": (
        "Hyaluronic acid dan ceramide mengunci kelembapan dengan baik — "
        "aplikasikan ke kulit yang masih lembap untuk hasil terbaik."
    ),
    "ceramide": (
        "Hyaluronic acid dan ceramide mengunci kelembapan dengan baik — "
        "aplikasikan ke kulit yang masih lembap untuk hasil terbaik."
    ),
    "centella": (
        "Untuk kulit sensitif atau mudah iritasi, formula bebas pewangi dengan centella "
        "atau panthenol cenderung lebih lembut."
    ),
    "panthenol": (
        "Untuk kulit sensitif atau mudah iritasi, formula bebas pewangi dengan centella "
        "atau panthenol cenderung lebih lembut."
    ),
    "sunscreen": (
        "SPF 30+ broad-spectrum setiap pagi itu wajib, bahkan di dalam ruangan atau saat mendung."
    ),
}


def canonicalize(term: str) -> str:
    return SYNONYM_CANONICALIZATION.get(term.lower().strip(), term.lower().strip())
