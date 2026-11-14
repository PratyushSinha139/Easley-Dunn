-- Up Migration

-- Server-side session store for express-session / connect-pg-simple.
-- Until now this table was created by hand from sql/001_create_session_table.sql,
-- so a database built only from migrations had no session table and sign-in
-- failed. IF NOT EXISTS keeps this a no-op on databases that already have it.

CREATE TABLE IF NOT EXISTS session (
  sid    varchar PRIMARY KEY,
  sess   jsonb NOT NULL,
  expire timestamptz(6) NOT NULL
);

-- connect-pg-simple prunes expired rows on an interval; this makes that cheap.
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

-- Not part of connect-pg-simple's stock schema. Added so that revoking every
-- session for a user (on role revoke, deactivation, or password change) is an
-- index lookup rather than a full scan.
CREATE INDEX IF NOT EXISTS idx_session_user ON session ((sess->>'userId'));

-- Down Migration

-- Deliberately empty. On databases where the table was created by hand before
-- this migration existed, dropping it here would sign everyone out and break
-- sign-in. Drop it manually if it is really meant to go.
