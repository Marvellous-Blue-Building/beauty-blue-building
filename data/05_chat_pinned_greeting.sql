-- The permanent "Hello, AI Advisor here..." greeting is now a real, pinned
-- message (inserted once when a user's first conversation is created) so it
-- shows up in Conversation History too — but it must survive "Clear Chat",
-- which only deletes non-pinned rows.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;
