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
  - [ ] Playwright past sign-in, then sign-up and invites (needs the staging cloud, below)
  - [ ] Sentry for errors (opt-in on the desktop). The owner's Sentry account is ready; its setup code must be made
        with "Use IP pinning" off, since setup runs in the cloud, not on the owner's network
- [ ] **A Creavia cloud of its own, plus staging:** the `creavia-cloud` Worker, the `creavia` bucket, its own Neon
      project, and a staging copy with test accounts. Never the live VoiceBox (blocked in the app and by the Guard
      workflow).
- [ ] **Retest live updates on staging:** `@neon/realtime` moved 0.1 → 0.2 (a 0.x minor can break); check the
      client and server still talk before relying on it.
- [ ] **Ports and adapters:** storage, database, realtime, queues, email, payments and AI behind `cloud/lib/ports/`, so
      Creavia stays portable ([../self-hosting.md](../self-hosting.md)) and testable.
- [ ] **Translation layer** for every user-facing string, English first.
- [ ] **Workspaces:** a `workspace_id` on every row (posts, comments, files, voices, connections, settings, jobs) and
      every R2/B2 key prefix; one place that sets it per request; Postgres row-level security as a second lock.
- [ ] **Accounts:** sign-up (email + password, Google sign-in), invites, roles (owner, member), password reset.
- [ ] **The app connects by itself:** the service address built in; "Sign in" / "Create account"; self-hosting stays
      as an advanced option.
- [ ] **Tool registry:** every existing action as a named tool with a permission level (read / make / change / act),
      grouped by house; screens move to call tools.
- [ ] **The new frame:** sidebar with the ten items, + New, the Vee panel shell, Cmd/Ctrl K, in the Creavia design
      system (Stage 5).
- [ ] **Home, today:** posting today, waiting comments/DMs, last post's result.
- [ ] **AI providers (BYOK):** the provider layer, adding a key, picking provider and model, the key test, per-task
      cost; local models via Ollama / LM Studio.
- [ ] **Tasks foundation:** the task object (brief, owner, due, status, timeline) that people and agents share.
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
