-- Best-practice schema upgrade for `products` to accommodate the real
-- Sociolla catalog export (data/beauty_product.csv, ~25k rows, 328 brands,
-- 46 categories spanning makeup/skincare/haircare/fragrance/accessories).
--
-- Design notes:
--   * `sku` is the natural business key from the source catalog (always
--     present, always unique across 24,941 rows) — added as a UNIQUE
--     column alongside the existing surrogate `id UUID` PK, so FKs from
--     cart_items/saved_products keep working unchanged.
--   * `category` is free text, not an enum/CHECK constraint — the real
--     catalog spans far more than skincare (makeup brushes, fragrance,
--     accessories), so a fixed enum would be too brittle. Indexed instead.
--   * `ingredients TEXT[]` is replaced with `ingredients TEXT` (raw INCI
--     blob as scraped). The source text isn't reliably array-splittable
--     (ingredient names themselves can contain commas inside parentheses),
--     so storing it raw and parsing downstream in the RAG pipeline is
--     safer than silently mis-splitting on import.
--   * `sub_category`, `segment`, `category_path`, and
--     `bundle_derived_color_varian` are NOT imported — they are 100% (or
--     99.5%) empty across all 24,941 source rows, so modeling them would
--     just be dead weight.
--   * `weight_gram` is imported as `size_label TEXT`, not a numeric grams
--     column — the source values are inconsistently mixed units ("20 ml",
--     "45 gram", "20ml"), so forcing it into a numeric gram field would
--     silently produce wrong unit conversions.
--   * `rating` arrives as Indonesian-locale decimal text (e.g. "4,7") —
--     converted to NUMERIC(2,1) at import time.
--   * Adds a generated `search_vector tsvector` + GIN index, matching the
--     Postgres full-text-search step already specified in the RAG
--     pipeline (plan.md §4, step 3).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku VARCHAR(20),
  ADD COLUMN IF NOT EXISTS parent_sku VARCHAR(20),
  ADD COLUMN IF NOT EXISTS listed_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category VARCHAR(50),
  ADD COLUMN IF NOT EXISTS product_url TEXT,
  ADD COLUMN IF NOT EXISTS color_variant VARCHAR(10),
  ADD COLUMN IF NOT EXISTS variant_color_name VARCHAR(50),
  ADD COLUMN IF NOT EXISTS rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS total_review INTEGER,
  ADD COLUMN IF NOT EXISTS usage_instructions TEXT,
  ADD COLUMN IF NOT EXISTS size_label VARCHAR(50),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Replace the unused TEXT[] ingredients column with a raw-text version
-- (see design note above).
ALTER TABLE products DROP COLUMN IF EXISTS ingredients;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredients TEXT;

-- Natural business key from the source catalog.
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products (sku);

-- Common filter/lookup paths.
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products (brand);
CREATE INDEX IF NOT EXISTS idx_products_parent_sku ON products (parent_sku);

-- Full-text search (RAG pipeline step 3 in plan.md) over name/brand/category.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(category, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_products_search_vector ON products USING GIN (search_vector);
