-- Widens full-text search to cover description and usage instructions
-- ("how to"), not just name/brand/category — so when the AI advisor's chat
-- pipeline recognizes a user's keyword/ontology term, it actually finds
-- products that mention that term in their description or how-to copy
-- even when it's absent from the name/brand/category fields. Used by
-- services/matching-service/app/chat_pipeline.py's candidate retrieval and
-- app/routers/match_routine.py's product matching (both query this same
-- generated column).
--
-- A GENERATED column's expression can't be ALTERed in place — drop and
-- recreate it. The dependent GIN index is dropped automatically with the
-- column and rebuilt below.
ALTER TABLE products DROP COLUMN IF EXISTS search_vector;

ALTER TABLE products
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(category, '') || ' ' ||
      coalesce(description, '') || ' ' || coalesce(usage_instructions, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_products_search_vector ON products USING GIN (search_vector);
