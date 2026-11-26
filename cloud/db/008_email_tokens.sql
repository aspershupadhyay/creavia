-- Email for accounts (docs/town/prd/foundation-workspaces-accounts.md, 3b): one-time links for a password reset (an
-- hour) and for checking a new account's email (a day), stored only as hashes, each used once. email_verified: an
-- account from open sign-up can't sign in until its link is opened; every account before it, and every account made
-- from the studio's list or an invite, counts as checked. sessions_after: a password reset voids that person's older
-- sign-ins. Safe to run again.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_after timestamptz;
CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash text PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('reset', 'verify')),
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX IF NOT EXISTS email_tokens_by_user ON email_tokens (user_id, kind);
