-- Workspaces (docs/town/prd/foundation-workspaces-accounts.md, slice 1): many teams in one service, each seeing only its
-- own. People stay global (users); memberships say who is in which workspace and as what; invites wait for slice 3.
-- The studio that exists today becomes the first workspace, w_founding: its rows are backfilled, its people become its
-- members (the oldest its owner), and its stored files keep their keys (key_prefix ''). New workspaces get 'w/<id>/'.
-- workspace_id has no default once backfilled, so a write that forgets it fails instead of landing in the wrong
-- workspace. Safe to run again.

CREATE TABLE IF NOT EXISTS workspaces (
  id         text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  name       varchar(120) NOT NULL,
  key_prefix varchar(64) NOT NULL UNIQUE
);
INSERT INTO workspaces (id, name, key_prefix) VALUES ('w_founding', 'Studio', '') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS memberships (
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_by_user ON memberships (user_id);

-- today's team (users.member) joins the first workspace, the oldest account as its owner. Once only: the studio makes
-- its tables at every start (lib/db.ts ensureSchema), and an account made later must never join this workspace by itself.
INSERT INTO memberships (workspace_id, user_id, role)
  SELECT 'w_founding', id, CASE WHEN id = (SELECT id FROM users WHERE member ORDER BY created_at, id LIMIT 1) THEN 'owner' ELSE 'member' END
  FROM users WHERE member AND NOT EXISTS (SELECT 1 FROM memberships)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS invites (
  id           text PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now(),
  workspace_id text NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  email        varchar(320) NOT NULL,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  token_hash   text NOT NULL UNIQUE,
  invited_by   text REFERENCES users (id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS invites_by_workspace ON invites (workspace_id, created_at DESC);

-- a workspace on every workspace row: added with the first workspace as the default (backfilling what exists), then
-- the default is dropped (below)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'w_founding' REFERENCES workspaces (id);
ALTER TABLE comments ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'w_founding' REFERENCES workspaces (id);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'w_founding' REFERENCES workspaces (id);
ALTER TABLE media ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'w_founding' REFERENCES workspaces (id);

-- dropped only while a default is still there: the studio runs this file at every start, and ALTER takes a lock (one
-- line, so gen-schema keeps it one statement)
DO $$ DECLARE t text; BEGIN FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'workspace_id' AND column_default IS NOT NULL AND table_name IN ('posts', 'comments', 'activity', 'media') LOOP EXECUTE format('ALTER TABLE %I ALTER COLUMN workspace_id DROP DEFAULT', t); END LOOP; END $$;

CREATE INDEX IF NOT EXISTS posts_by_workspace ON posts (workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS comments_by_workspace ON comments (workspace_id, post_id);
CREATE INDEX IF NOT EXISTS activity_by_workspace ON activity (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS media_by_workspace ON media (workspace_id, post_id);
