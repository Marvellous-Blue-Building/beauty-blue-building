-- Persist the as-is step-13 Structured Understanding Object (the exact
-- services/matching-service POST /chat/understand ChatUnderstanding JSON
-- that produced this bot reply) alongside the message. Stored verbatim as
-- TEXT — not jsonb — so the pipeline's own serialization is preserved
-- byte-for-byte for the planned as-is learning from real chat history
-- (nothing here is re-derived, re-ranked or normalized on the way in).
-- Null for messages with no such object (the pinned greeting, user rows,
-- or any turn where /chat/understand was unreachable).
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS raw_json_text TEXT;
