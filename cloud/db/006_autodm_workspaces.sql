-- Auto-DM per workspace (docs/town/prd/foundation-workspaces-accounts.md, slice 2b part 2). Each Instagram account
-- belongs to one workspace (account_owners), so the webhook, which has nobody signed in, answers each delivery inside
-- the workspace that connected that account. Every Auto-DM row carries its workspace: the first workspace's rows are
-- backfilled, then the default is dropped, so a write that forgets it fails. The "answered at most once" keys and the
-- inbox's keys include the workspace. Safe to run again (the studio runs db/*.sql at every start).

-- the inbox tables were made by lib/publish/dmstore.ts on first use: made here too, so the lines below find them
CREATE TABLE IF NOT EXISTS autodm_messages (
  id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), account text NOT NULL, psid text NOT NULL,
  dir text NOT NULL, text text, mid text NOT NULL, by text, kind text, UNIQUE (account, mid)
);
CREATE INDEX IF NOT EXISTS autodm_messages_thread ON autodm_messages (account, psid, id DESC);
CREATE TABLE IF NOT EXISTS autodm_people (
  account text NOT NULL, psid text NOT NULL, username text, name text, avatar text, tags text[] NOT NULL DEFAULT '{}',
  notes text, bot_off_until timestamptz, state text NOT NULL DEFAULT 'open', unread integer NOT NULL DEFAULT 0,
  last_in timestamptz, last_out timestamptz, last_text text, last_dir text, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account, psid)
);

-- which workspace each connected Instagram account belongs to: one only, so a delivery has exactly one place to go
CREATE TABLE IF NOT EXISTS account_owners (
  network      text NOT NULL,
  account      text NOT NULL,
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  claimed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network, account)
);

ALTER TABLE autodm_events ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'w_founding' REFERENCES workspaces (id);
ALTER TABLE autodm_leads ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'w_founding' REFERENCES workspaces (id);
ALTER TABLE autodm_messages ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'w_founding' REFERENCES workspaces (id);
ALTER TABLE autodm_people ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'w_founding' REFERENCES workspaces (id);

-- the backfill default goes once it has done its job (one line, so gen-schema keeps it one statement)
DO $$ DECLARE t text; BEGIN FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'workspace_id' AND column_default IS NOT NULL AND table_name IN ('autodm_events', 'autodm_leads', 'autodm_messages', 'autodm_people') LOOP EXECUTE format('ALTER TABLE %I ALTER COLUMN workspace_id DROP DEFAULT', t); END LOOP; END $$;

-- the keys, with the workspace in them: an account that moves to another workspace starts clean there
CREATE UNIQUE INDEX IF NOT EXISTS autodm_events_once ON autodm_events (workspace_id, account, kind, ref);
CREATE UNIQUE INDEX IF NOT EXISTS autodm_leads_once ON autodm_leads (workspace_id, account, from_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS autodm_messages_once ON autodm_messages (workspace_id, account, mid);
ALTER TABLE autodm_events DROP CONSTRAINT IF EXISTS autodm_events_account_kind_ref_key;
ALTER TABLE autodm_leads DROP CONSTRAINT IF EXISTS autodm_leads_account_from_id_email_key;
ALTER TABLE autodm_messages DROP CONSTRAINT IF EXISTS autodm_messages_account_mid_key;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'autodm_people_pkey' AND pg_get_constraintdef(oid) LIKE '%workspace_id%') THEN ALTER TABLE autodm_people DROP CONSTRAINT IF EXISTS autodm_people_pkey; ALTER TABLE autodm_people ADD PRIMARY KEY (workspace_id, account, psid); END IF; END $$;

CREATE INDEX IF NOT EXISTS autodm_events_by_workspace ON autodm_events (workspace_id, at DESC);
CREATE INDEX IF NOT EXISTS autodm_leads_by_workspace ON autodm_leads (workspace_id, at DESC);
CREATE INDEX IF NOT EXISTS autodm_people_by_workspace ON autodm_people (workspace_id, updated_at DESC);
