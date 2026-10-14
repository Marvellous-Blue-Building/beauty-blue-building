"""Raw DB row -> frontend-facing Product mapping — ported from
apps/web/lib/rag/product-row.ts + image-url.ts + the parseIngredients half of
sensitivity-flags.ts. Tags/compatibility are computed here since the real
catalog has no structured columns for them."""

from typing import Optional

import asyncpg

from app.dictionaries import detect_ethical_tags
from app.schemas import CompatibilityNote, InciIngredient, Product


def extract_image_url(raw: Optional[str]) -> Optional[str]:
    """The real catalog's image_url column wraps a dead Cloudflare resize
    proxy around the still-live real origin URL — extract that origin."""
    if not raw:
        return None
    second_https_index = raw.find("https://", 8)
    return raw[second_https_index:] if second_https_index != -1 else raw


def parse_ingredients(raw: Optional[str], limit: int = 8) -> list[str]:
    if not raw:
        return []
    parts = [p.strip() for p in raw.replace(";", ",").split(",")]
    return [p for p in parts if p][:limit]


def _build_compatibility(category: Optional[str], ingredients: Optional[str]) -> list[CompatibilityNote]:
    lower = (ingredients or "").lower()
    cat = category or ""

    if cat == "cleanser":
        return [CompatibilityNote(label="Safe as first step in your routine", ok=True)]
    if cat == "sun-care":
        return [CompatibilityNote(label="Always apply last in your AM routine", ok=True)]
    if cat == "moisturizer":
        return [CompatibilityNote(label="Safe after any serum", ok=True)]
    if "retinol" in lower or "retinal" in lower:
        return [
            CompatibilityNote(label="PM use only", ok=True),
            CompatibilityNote(label="Avoid combining with BHA/AHA the same night", ok=False),
        ]
    if "salicylic" in lower or "glycolic" in lower:
        return [
            CompatibilityNote(label="Wait ~20 minutes after cleansing before applying", ok=True),
            CompatibilityNote(label="Avoid combining with Retinol the same night", ok=False),
        ]
    return [CompatibilityNote(label="Follow the product's usage instructions", ok=True)]


def to_product(row: asyncpg.Record, match_percent: Optional[float] = None) -> Product:
    description = row["description"] or ""
    ingredients = row["ingredients"]
    tags_detected = detect_ethical_tags(f"{row['name']} {description}", ingredients)
    tags = [
        *(["Vegan"] if tags_detected["vegan"] else []),
        *(["Cruelty-Free"] if tags_detected["crueltyFree"] else []),
        *(["Fragrance-Free"] if tags_detected["fragranceFree"] else []),
    ]

    return Product(
        id=str(row["id"]),
        sku=row["sku"] or "",
        parentSku=row["parent_sku"] or row["sku"] or str(row["id"]),
        name=row["name"],
        brand=row["brand"] or "Unbranded",
        imageUrl=extract_image_url(row["image_url"]),
        sizeLabel=row["size_label"],
        price=float(row["price"]),
        listedPrice=float(row["listed_price"]) if row["listed_price"] is not None else None,
        variantCount=int(row["variant_count"]),
        rating=float(row["rating"]) if row["rating"] is not None else None,
        totalReview=row["total_review"],
        category=row["category"] or "uncategorized",
        stockQuantity=int(row["stock_quantity"]),
        tags=tags,
        matchPercent=match_percent,
        description=description,
        inci=[InciIngredient(name=n) for n in parse_ingredients(ingredients)],
        compatibility=_build_compatibility(row["category"], ingredients),
        colorHex=row["color_variant"],
        colorName=row["variant_color_name"],
        colorPalette=list(row["color_palette"]) if row["color_palette"] else [],
    )
