# Phase 0: foundation

**Status:** in progress: the quality foundation (first item) is partly done.
**Goal:** everything the houses stand on: many workspaces safely in one service, the new Creavia look and frame, the
tool registry, Home, and the slow outside approvals started.

## What ships

- [ ] **Quality foundation (first):** test runners in every part, a linter and formatter, the shared
      workspace-isolation suite, Playwright for core flows, Sentry for errors; CI blocks merges on all of them
      (docs/ENGINEERING.md, [ADR 0001](../../adr/0001-quality-tooling.md)).
  - [x] Test runners in every part: Vitest in desktop and cloud, `cargo test`, pytest in engine
  - [x] Linters and formatters: Biome (TypeScript, CSS, JSON), ruff (engine), rustfmt and clippy (Rust)
  - [x] One `Checks` workflow on every pull request, no path filter, so it can be required
  - [x] Isolation suite, part 1: every route refuses a signed-out caller without touching storage
        (`cloud/test/routes.test.ts`); it found and fixed the MCP's 500-on-a-wrong-key bug (docs/LESSONS.md)
  - [ ] Owner: mark the three Checks jobs as required on `main` (Settings → Branches)
  - [x] Playwright: sign-in and first-run flows in the cloud and the desktop, at full width and 390 px
        (`e2e/`, [ADR 0002](../../adr/0002-end-to-end-tests.md))
  - [ ] Playwright past sign-in: written (`e2e/staging/`: sign-in, wrong password, sign-out, two people one
        workspace), runs once staging is set up (below); then sign-up and invites with the Accounts item
  - [x] Sentry for errors in the cloud, the desktop (opt-in) and the engine, a real error from each confirmed
        ([ADR 0003](../../adr/0003-sentry.md))
  - [ ] Owner: the Sentry variables and secret in GitHub and on the Worker (ADR 0003, "For the owner, once")
- [ ] **A Creavia cloud of its own, plus staging:** the `creavia-cloud` Worker, the `creavia` bucket, its own Neon
      project, and a staging copy with test accounts. Never the live VoiceBox (blocked in the app and by the Guard
      workflow).
  - [x] Staging in the repo: `env.staging` (its own Worker, bucket, database branch), `npm run setup -- --staging` with
        two test accounts, and the Cloud workflow deploying staging, testing it signed in, then production
        ([ADR 0004](../../adr/0004-staging.md)); one lockfile and `npm ci` everywhere
  - [ ] Owner: the Neon `staging` branch, `npm run setup -- --staging`, then `STAGING_URL` and the `E2E_*` secrets in
        GitHub (ADR 0004, "For the owner, once"); the first signed-in run confirms it
- [ ] **Retest live updates on staging:** `@neon/realtime` moved 0.1 → 0.2 (a 0.x minor can break); check the
      client and server still talk before relying on it.
- [ ] **Ports and adapters:** storage, database, realtime, queues, email, payments and AI behind `cloud/lib/ports/`, so
      Creavia stays portable ([../self-hosting.md](../self-hosting.md)) and testable.
- [ ] **Translation layer** for every user-facing string, English first.
- [ ] **Workspaces:** a `workspace_id` on every row (posts, comments, files, voices, connections, settings, jobs) and
      every R2/B2 key prefix; one place that sets it per request; Postgres row-level security as a second lock.
      Spec: [../prd/foundation-workspaces-accounts.md](../prd/foundation-workspaces-accounts.md) (four slices).
  - [x] Slice 1, the database: `workspaces`, `memberships`, `invites`; `workspace_id` on posts, comments, activity and
        media (today's studio backfilled as the first workspace); `lib/tenant.ts` decides the workspace, failing closed;
        every query in `lib/db.ts` scoped; the session names its workspace; isolation tests on a real Postgres in CI
  - [x] Slice 2a, stored files: every key under its workspace's prefix in `lib/store.ts` (settings and state files
        included), shared service keys, in-memory caches per workspace; isolation tests on the bucket
  - [x] Slice 2b part 1: every key, token and link names its workspace and works only there (`lib/bound.ts`); MCP,
        GPU workers, uploads and shared links run in it; cron, backup and janitor per workspace
  - [ ] Slice 2b part 2: Auto-DM (its tables, the Instagram webhook, tracked links) per workspace
  - [ ] Slice 4: row-level security and the full isolation sweep (routes, MCP tools, file links)
- [ ] **Accounts:** sign-up (email + password, Google sign-in), invites, roles (owner, member), password reset.
      Slice 3 of the same spec; needs slice 2 first (sign-up creates workspaces).
- [ ] **The app connects by itself:** the service address built in; "Sign in" / "Create account"; self-hosting stays
      as an advanced option.
- [ ] **Tool registry:** every existing action as a named tool with a permission level (read / make / change / act),
      grouped by house; screens move to call tools.
- [ ] **The new frame:** sidebar with the ten items, + New, the Vee panel shell, Cmd/Ctrl K, in the Creavia design
      system (Stage 5). The **Ask Vee box** is the front door on Home and the same box as ⌘K (stages/04-ux.md, pattern 1).
- [ ] **Onboarding, "helpful from hello":** sign up → Meet Vee → connect → a first creator profile from the last 30
      posts → three first wins → a morning brief (stages/04-ux.md, "The first ten minutes").
- [ ] **Home, today:** posting today, waiting comments/DMs, last post's result.
- [ ] **AI providers (BYOK):** the provider layer, adding a key, picking provider and model, the key test, per-task
      cost; local models via Ollama / LM Studio.
- [ ] **Tasks foundation:** the task object (brief, owner, due, status, timeline) that people and agents share; every
      result shown as a first-person outcome card waiting for OK (stages/04-ux.md, pattern 5).
- [ ] **Metering:** AI calls, GPU minutes and storage counted per workspace.
- [ ] **Outside:** domain, registered business, privacy/terms/data-deletion pages; Google verification and Meta App
      Review submitted.
- [ ] Existing VoiceBox data becomes the first workspace (in a copy; the hosted VoiceBox is untouched).

## Specs to write first (Stage 3 and 6)

- PRD: workspaces, accounts and invites · PRD: Home · tool registry spec · data model change and migration plan
  (new `cloud/db/NNN_*.sql`, idempotent) · threat model for multi-tenancy.

## Done when

- Isolation tests that try every route, tool, file link and MCP call with another workspace's ids all fail closed.
- A new person can sign up in the app, invite a teammate, and both see the same workspace and nothing else.
