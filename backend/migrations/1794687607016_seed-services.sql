-- Up Migration

-- Seed the supported third-party services (idempotent).
-- Moved here from cerberus-db/002_seed_services.sql. node-pg-migrate wraps each
-- migration in a transaction, so the file's BEGIN/COMMIT are dropped.
-- ON CONFLICT relies on services.service_code being UNIQUE (baseline).

INSERT INTO services (service_name, service_code, is_active, is_automate)
VALUES
  ('Google Play Console', 'GOOGLE_PLAY_CONSOLE', true, true),
  ('Google Drive',        'GOOGLE_DRIVE',        true, true),
  ('Apple Store Connect', 'APPLE_STORE_CONNECT', true, true),
  ('Google Cloud',        'GOOGLE_CLOUD',        true, true),
  ('Discord',             'DISCORD',             true, true)
  -- Not live for the beta. To enable one later, add a NEW migration that inserts its row; do not uncomment here (this migration will already have run in production).
  -- ('Unity',               'UNITY',               true, false),
  -- ('Big Query',           'BIG_QUERY',           true, true),
  -- ('Google Analytics',    'GOOGLE_ANALYTICS',    true, true),
  -- ('Assembla',            'ASSEMBLA',            true, false),
  -- ('Firebase',            'FIREBASE',            true, true),
  -- ('Kanboard',            'KANBOARD',            true, true),
ON CONFLICT (service_code) DO NOTHING;

-- Down Migration

-- Deliberately empty for now: whether rolling back should delete these rows
-- (and what happens to user_service_access rows that reference them) is a
-- pending decision.
