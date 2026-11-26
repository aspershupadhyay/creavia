-- Roles began with slice 3a (2026-11-26): before it, everyone in the studio could manage its people. So that nobody
-- already there loses that, every member of the first workspace who joined before roles began becomes an owner, once
-- (docs/town/prd/foundation-workspaces-accounts.md, 3b). People who join later start with the role they're given. Safe
-- to run again: the marker row means it happens only the first time (the studio runs db/*.sql at every start).
CREATE TABLE IF NOT EXISTS schema_once (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now());
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM schema_once WHERE name = 'founding_owners') THEN UPDATE memberships SET role = 'owner' WHERE workspace_id = 'w_founding' AND created_at < timestamptz '2026-11-26 16:06:00+00'; INSERT INTO schema_once (name) VALUES ('founding_owners'); END IF; END $$;
