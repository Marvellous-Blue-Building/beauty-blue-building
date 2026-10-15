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
# like a quiz user selecting "Acne & Breakouts" would. This is the
# semantic user-input translation layer: users write Indonesian, but the
# catalog, the ingredient vocabulary and the embedding model are all
# English, so every phrase here is translated to the English concept it
# means before it can become a search term.
ID_CONCERN_PHRASES: dict[str, str] = {
    "jerawat": "Acne & Breakouts",
    "berjerawat": "Acne & Breakouts",
    "bruntusan": "Acne & Breakouts",
    "beruntusan": "Acne & Breakouts",
    "komedo": "Acne & Breakouts",
    "jerawat batu": "Acne & Breakouts",
    "berminyak": "Acne & Breakouts",
    "kulit berminyak": "Acne & Breakouts",
    "minyak berlebih": "Acne & Breakouts",
    "garis halus": "Fine Lines & Aging",
    "kerutan": "Fine Lines & Aging",
    "keriput": "Fine Lines & Aging",
    "penuaan": "Fine Lines & Aging",
    "kendur": "Fine Lines & Aging",
    "kendor": "Fine Lines & Aging",
    "noda hitam": "Dark Spots / Hyperpigmentation",
    "flek hitam": "Dark Spots / Hyperpigmentation",
    "bekas jerawat": "Dark Spots / Hyperpigmentation",
    "belang": "Dark Spots / Hyperpigmentation",
    "kusam": "Dark Spots / Hyperpigmentation",
    "mencerahkan": "Dark Spots / Hyperpigmentation",
    "cerah": "Dark Spots / Hyperpigmentation",
    "kering": "Dryness & Dehydration",
    "dehidrasi": "Dryness & Dehydration",
    "kemerahan": "Redness & Irritation",
    "iritasi": "Redness & Irritation",
    "sensitif": "Redness & Irritation",
    "sensitiv": "Redness & Irritation",
    "gatal": "Redness & Irritation",
    "pori besar": "Large Pores",
    "pori pori besar": "Large Pores",
}

# Bahasa Indonesia product-type phrases -> the canonical English product-type
# phrase in BEAUTY_PRODUCT_ONTOLOGY (app/dictionaries.py) they mean. Same
# translation role as ID_CONCERN_PHRASES, for messages that name what KIND of
# product someone wants in Indonesian ("sabun cuci muka", "tabir surya")
# rather than an ingredient/concern — without this, "sabun cuci muka terbaik
# apa aja" would only recognize the single generic word "sabun".
ID_PRODUCT_PHRASES: dict[str, str] = {
    "tabir surya": "sunscreen",
    "sunblock": "sunblock",
    "pelindung matahari": "sunscreen",
    "sabun cuci muka": "facial cleanser",
    "sabun muka": "facial cleanser",
    "pembersih wajah": "facial cleanser",
    "pembersih muka": "facial cleanser",
    "pelembap wajah": "facial moisturizer",
    "pelembap muka": "facial moisturizer",
    "krim mata": "eye cream",
    "cream mata": "eye cream",
    "masker wajah": "face mask",
    "masker muka": "face mask",
    "serum wajah": "facial serum",
    "serum muka": "facial serum",
    "toner wajah": "facial toner",
    "pelembap bibir": "lip balm",
    "sampo": "shampoo",
    "serum rambut": "hair serum",
    "sabun badan": "body soap",
    "sabun mandi": "body wash",
    "losion badan": "body lotion",
    "masker rambut": "hair mask",
    "kondisioner": "conditioner",
    "parfum": "perfume",
    "deodoran": "deodorant",
}

# Product-type ontology phrases (app/dictionaries.py's BEAUTY_PRODUCT_ONTOLOGY)
# split into FACIAL skin-care vs everything else. A recognized entity in
# FACIAL_PRODUCT_PHRASES (plus any facial concern/active) marks a message as
# facial-concern-driven; a recognized entity in NON_FACIAL_PRODUCT_PHRASES
# marks it as an explicit non-facial request that must NOT be scoped away.
# See chat_pipeline.py's category scoping.
FACIAL_PRODUCT_PHRASES: set[str] = {
    "facial cleanser", "cleansing oil", "cleansing balm", "micellar water",
    "facial toner", "hydrating toner", "exfoliating toner", "facial essence",
    "facial serum", "ampoule", "facial moisturizer", "face cream",
    "gel moisturizer", "facial lotion", "face oil", "sunscreen", "sunblock",
    "sunscreen stick", "sunscreen spray", "sunscreen serum", "eye cream",
    "eye serum", "eye patches", "face mask", "sheet mask", "sleeping mask",
    "clay mask", "peel-off mask", "exfoliating scrub", "chemical exfoliant",
    "acne treatment", "spot treatment", "pore strips", "blackhead remover",
    "facial mist", "makeup remover", "lip balm", "lip scrub", "neck cream",
    "facial treatment pads", "anti-aging cream", "retinol treatment",
    "vitamin c serum", "niacinamide serum", "hyaluronic acid serum",
    "ceramide cream", "barrier repair cream", "sensitive skin moisturizer",
    "rosacea-compatible skincare", "hyperpigmentation treatment",
    "dark spot corrector", "scar care gel", "keratosis pilaris treatment",
    "eczema-compatible moisturizer", "men's facial cleanser", "men's moisturizer",
}

NON_FACIAL_PRODUCT_PHRASES: set[str] = {
    # Hair & scalp
    "shampoo", "conditioner", "hair mask", "hair treatment", "hair serum",
    "hair oil", "leave-in conditioner", "hair milk", "hair tonic",
    "scalp serum", "scalp scrub", "scalp treatment", "anti-dandruff shampoo",
    "hair growth treatment", "heat protectant", "hair spray", "hair gel",
    "hair wax", "hair clay", "hair pomade", "hair mousse", "dry shampoo",
    "hair perfume", "hair dye", "hair bleach", "hair color conditioner",
    "hair straightening treatment", "curl cream", "hair detangler",
    "hair styling cream",
    # Body
    "body wash", "shower gel", "body soap", "body scrub", "body exfoliator",
    "body lotion", "body cream", "body butter", "body oil", "body serum",
    "body moisturizer", "body sunscreen", "hand cream", "foot cream",
    "heel balm", "elbow cream", "body acne treatment", "stretch mark cream",
    "firming lotion", "cellulite cream", "after-sun lotion", "body mist",
    "deodorant", "antiperspirant", "body powder", "foot spray",
    "hand sanitizer", "cuticle oil",
    # Oral / dental
    "toothpaste", "tooth whitening strips", "mouthwash", "dental floss",
    "toothbrush", "tongue cleaner", "breath spray",
    # Intimate / feminine care
    "feminine wash", "intimate moisturizer", "intimate wipes",
    "menstrual pads", "pantyliners", "tampons", "menstrual cup",
    # Hair removal / shaving
    "shaving cream", "aftershave balm", "hair removal cream",
    "waxing strips", "depilatory wax", "razor",
    # General hygiene
    "hand wash", "body wipes", "wet wipes", "antibacterial soap",
    # Fragrance
    "perfume", "eau de parfum", "eau de toilette", "eau de cologne",
    "perfume oil", "solid perfume", "deodorant spray", "fragrance lotion",
    "fragrance gift set",
    # Nails
    "nail polish", "gel nail polish", "nail strengthener", "nail treatment",
    "base coat", "top coat", "nail polish remover", "cuticle remover",
    "nail serum", "nail glue", "press-on nails", "nail art stickers",
    "nail hardener", "nail repair cream",
    # Men's grooming (non-facial)
    "beard oil", "beard balm", "beard shampoo", "beard conditioner",
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
