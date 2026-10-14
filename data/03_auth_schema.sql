-- Auth/session system schema additions.
--
-- `users.firebase_uid` (from the original plan.md schema) is reused to store
-- Google's OAuth `sub` claim — both serve the identical purpose (a unique,
-- stable external identity-provider id), so no new column was needed.
--
-- `preferences` and `day_streak` extend the users table to cover profile
-- fields the frontend needs that weren't in the original schema (ethical
-- preference toggles, streak counter). `skin_type`/`concern`/`goal` are
-- intentionally NOT duplicated here — those are derived at read time from
-- the user's latest `questionnaires` row, since that's the real source of
-- truth and duplicating it would let the two drift out of sync.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{"vegan":false,"crueltyFree":false,"fragranceFree":false}'::jsonb,
  ADD COLUMN IF NOT EXISTS day_streak INTEGER NOT NULL DEFAULT 0;

-- Session audit/tracking table (separate from the Redis flag, which is the
-- fast-path "is this session currently valid" check). This table is the
-- durable record of login sessions: when PK, who, and whether/when it was
-- explicitly logged out.
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    session_token VARCHAR(128) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    logged_out_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions (session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id);
