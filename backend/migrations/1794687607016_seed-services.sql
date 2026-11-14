-- Up Migration

-- Seed the supported third-party services (idempotent).
-- Moved here from cerberus-db/002_seed_services.sql. node-pg-migrate wraps each
-- migration in a transaction, so the file's BEGIN/COMMIT are dropped.
-- ON CONFLICT relies on services.service_code being UNIQUE (baseline).

INSERT INTO services (service_name, service_code, is_active, is_automate)
VALUES
  ('Google Play Console', 'GOOGLE_PLAY_CONSOLE', true, true),
  -- ('Unity',               'UNITY',               true, false),
  -- ('Big Query',           'BIG_QUERY',           true, true),
  ('Google Drive',        'GOOGLE_DRIVE',        true, true),
  -- ('Google Analytics',    'GOOGLE_ANALYTICS',    true, true),
  ('Apple Store Connect', 'APPLE_STORE_CONNECT', true, true),
  -- ('Assembla',            'ASSEMBLA',            true, false),
  ('Google Cloud',        'GOOGLE_CLOUD',        true, true),
  -- ('Firebase',            'FIREBASE',            true, true),
  -- ('Kanboard',            'KANBOARD',            true, true),
  ('Discord',             'DISCORD',             true, true)
ON CONFLICT (service_code) DO NOTHING;

-- Down Migration

-- Deliberately empty for now: whether rolling back should delete these rows
-- (and what happens to user_service_access rows that reference them) is a
-- pending decision.
