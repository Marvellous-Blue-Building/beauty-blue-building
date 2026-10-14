-- Chat bot messages can now surface up to 6 closest-matching products as a
-- full-width list below the bubble (services/matching-service's
-- /chat/understand ChatUnderstanding.candidates), superseding the older
-- single-product recommendation_product_id/recommendation_badge columns
-- (left in place, unused, rather than risk a destructive column drop).
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS recommended_product_ids UUID[];
