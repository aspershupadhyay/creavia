# PRD · Workspaces and accounts (Phase 0)

**Status:** slices 1, 2 and 3a done (2026-11-26); 3b (password reset, Google, per-workspace sign-in log, worker keys) next · **Plan:** [../phases/phase-0-foundation.md](../phases/phase-0-foundation.md),
"Workspaces" and "Accounts"

## 1. Problem

The cloud is one studio for one team: every row, file and setting belongs to "the" studio, and who may sign in is one
list. Creavia is a service for many creators and teams, so each team needs its own workspace that no other can see,
and people need to sign up, invite teammates and belong to more than one workspace.

## 2. Who

A creator (or a small team: creator, editor, manager) who signs up, invites the others, and works in one workspace;
an editor who works for two creators and switches between their workspaces.

## 3. Goals and non-goals

- **Goals:** a workspace on every row and every stored file; one place that sets it per request, failing closed; roles
  owner and member; sign-up, invites, password reset, Google sign-in; the existing studio's data becomes the first
  workspace, untouched.
- **Non-goals (now):** billing and plans, custom roles, SSO beyond Google, moving a workspace between accounts.

## 4. Stories and acceptance

1. **As anyone, I can't see another workspace.** Done when the isolation tests that try every route, MCP tool and file
   link with another workspace's ids all fail closed (404, never the row), and a read with no workspace set throws.
2. **As a new person, I can sign up and get my own workspace,** where I'm the owner. Done when sign-up with email and
   password (or Google) lands me in an empty workspace of my own. On a self-hosted studio sign-up stays invite-only.
3. **As an owner, I can invite a teammate** by email; the link works once, for that email, for 7 days. Done when the
   invitee signs up or signs in through it and sees the same workspace and nothing else.
4. **As a member of two workspaces, I can switch** between them; each request works in exactly one.
5. **As an owner, I can remove someone;** they lose access within a minute, like today.
6. **As anyone, I can reset a forgotten password** by email (a one-time link, 1 hour).
7. **As the studio that exists today,** everything keeps working: its posts, files, voices and connections are the
   first workspace, its people its members, the oldest its owner.

## 5. Objects

- `workspaces` (id, name, key prefix for stored files), `memberships` (workspace, person, role), `invites` (workspace,
  email, role, hashed token, expiry). People (`users`) stay global: one person, many workspaces.
- Every workspace table gets `workspace_id`, with no default (a write that forgets it fails instead of landing in the
  wrong workspace). Stored files: keys under `w/<id>/`; the first workspace keeps its existing keys (prefix ""), so no
  file is copied or moved. No key written today starts with `w/`, so the two can't collide (a test checks).
- The session ticket names the workspace; each request checks the person is still a member of it (cached a minute).
- Background work (cron, GPU callbacks, Instagram webhooks) runs inside an explicit workspace taken from the job or
  the connected account, never from "the current one".

## 6. Agent behaviour

None yet; Vee and the crew act inside the workspace of the request that started them (tool registry, later).

## 7. Edge cases and threat model

| Case | Answer |
| --- | --- |
| Code reads with no workspace set | Throws; never a default workspace (tests) |
| A request names another workspace's row id | Every query is `… and workspace_id = $w`: 404 |
| A session for a workspace the person was removed from | Refused within a minute (membership check, like the list today) |
| An old session ticket from before workspaces | Taken as the first workspace, only if the person is a member of it |
| The master key (`MCP_TOKEN`) | The first workspace only; it is the self-hoster's key, not a key to every workspace |
| An invite link forwarded to someone else | Works only for the invited email; one use; 7 days; stored hashed |
| Sign-up spam on the hosted service | The existing lockout per address; email check before the workspace is used (with Accounts) |
| A file key from another workspace in a request | Keys are built from the workspace's prefix on the server; a client-sent key outside it is refused |
| A webhook or cron with no person | Runs in the workspace of the account or job it is for (explicit), or not at all |
| Postgres bug in our filter | Row-level security as a second lock (slice 4) |

## 8. Metrics

Sign-ups, invites sent and accepted, workspaces with 2+ members, isolation test count (must only grow).

## 9. Slices (each its own pull request)

1. **Database workspaces:** the tables, `workspace_id` on posts, comments, activity and media with the first workspace
   backfilled, one place that resolves the workspace (`lib/tenant.ts`), every query in `lib/db.ts` scoped, the session
   naming its workspace, members per workspace, isolation tests against a real Postgres.
2. **Stored files and background work**, in two pull requests:
   - **2a, stored files (done):** `lib/store.ts` puts every key under its workspace's prefix where it becomes a bucket
     address, and lists hand keys back without it, so every settings and state file is per workspace with no caller
     changed. Service keys (`SHARED`: sign-in lockouts, backups, GPU build caches) stay shared; a key spelled `w/…`
     is refused; the first workspace never lists the others' files. Every in-memory cache of workspace data is kept
     per workspace. The sign-in list names the first workspace itself, since it is read while a session is checked.
   - **2b part 1, credentials that name their workspace (done):** `lib/bound.ts`. Every key, token and link a caller
     with no signed-in person brings names its workspace and is checked only there: model, cloud-GPU and upload keys
     read `prefix_<workspace>~secret`; OAuth tokens and code-mode run keys carry claim `w` under their signature;
     Files links, upload tickets and share links put the workspace under their signature or look themselves up only
     in it. The first workspace's credentials keep their exact old form, so nothing handed out breaks; changing the
     workspace part makes a credential fail, never opens another workspace. MCP, worker, upload-key, Files, upload-link
     and ticket routes run inside the workspace the credential names (`scoped`). Cron runs once per workspace, sharing
     its time (`lib/workspaces.ts`); the backup copies every workspace's models under their own place; the janitor
     cleans each workspace's files against its own rows. Colab, Kaggle and GitHub-run GPU deploys sign in with
     `WORKER_SECRET`, the studio's own: they stay in the first workspace (saying so elsewhere) until workspaces get
     their own worker keys (slice 3).
   - **2b part 2, Auto-DM (done):** `db/006_autodm_workspaces.sql`. All four Auto-DM tables (events, leads, the
     inbox's messages and people) carry `workspace_id`, the first workspace's rows backfilled and no default after;
     their "answered at most once" and inbox keys include it, and every query in `lib/publish/dmstore.ts` is scoped.
     An Instagram account belongs to one workspace (`account_owners`, `lib/publish/owners.ts`): connecting it in a
     second is refused until the first disconnects it, and an account connected before is claimed where its connection
     is stored. The webhook answers each account's entries inside its owner's workspace and leaves accounts nobody
     connected alone. Tracked links (`/l/…`) name their workspace under the signature (the first workspace's keep their
     old form) and count the open only there. Tests: `test/autodm-workspaces.test.ts`.
3. **Accounts**, in two pull requests:
   - **3a, sign-up, invites, roles, switching (API, done):** tests in `test/accounts.test.ts` and `lib/session.test.ts`.
     - *Sign-up:* an email on the studio's list joins the first workspace, as today. Anyone else gets a workspace of
       their own, as its owner, only when `OPEN_SIGNUP=1` (the hosted service). Off, which is the default and every
       self-hosted studio, sign-up stays invite-only. Accounts made this way are not on the studio's list
       (`users.member` false), so they never see the first workspace.
     - *Invites* (`lib/invites.ts`): an owner invites an email as owner or member. The link carries a random token,
       stored only as its hash, valid 7 days, once, and only for that email. Accepting signs up or signs in and joins
       that workspace; an invite into the first workspace also puts the person on the studio's list. No email is
       sent yet: the owner gets the link to pass on (the email port comes with password reset, 3b).
     - *Roles in the API:* only an owner invites, removes people, changes roles or the studio's list; the last owner
       can't be removed or made a member. The master key and GitHub sign-ins are the first workspace's owners.
     - *Switching:* a person lists their workspaces and switches; the new ticket names the workspace, checked as
       before.
     - *Sessions:* the studio's list still gates the first workspace. In any other workspace the membership (checked
       every minute) is the gate. The master key, its sign-in and GitHub sign-ins always work in the first
       workspace, so they keep working once a second workspace exists.
     - *Not here:* screens (Creavia's own, Phase 0 UX), password reset, Google, per-workspace sign-in log and "sign
       out everywhere", worker keys.
   - **3b:** password reset (email port), Google sign-in, the sign-in log and "sign out everywhere" per workspace
     (shared under `auth/` today), a worker key per workspace so Colab, Kaggle and GPU deploys work in every one.
4. **Second lock and the full sweep:** row-level security, and the isolation sweep over every route, MCP tool and file
   link with another workspace's ids.
