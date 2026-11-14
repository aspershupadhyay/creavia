# 0002 · End-to-end tests with Playwright

**Status:** accepted (2026-11-14) · **Plan item:** Phase 0, quality foundation
([../town/phases/phase-0-foundation.md](../town/phases/phase-0-foundation.md)) · Follows
[0001](0001-quality-tooling.md)

## Context

Unit tests and the route sweep check pieces. Nothing checked what a person sees: that a page loads with no errors,
that a form says what's wrong, that the guide is reachable before signing in, and that every screen fits a phone
(CLAUDE.md asks for full width and 390 px). Sign-up and invites, the core flows the Phase 0 test names, don't exist
yet, so the suite starts with the flows that do.

## Decision

- **Playwright, Chromium**, from the repo root: `playwright.config.ts` and `e2e/`. `npm run e2e` builds and runs it;
  the `End to end` job in `checks.yml` runs it on every pull request and keeps the report when something fails.
- **Real builds, not dev servers:** the cloud's `next build` + `next start`; the desktop's Vite build, served as is.
- **Every test runs twice: full width (1280) and phone (390).** Every test also fails on an error the page throws or
  logs, and on sideways scrolling (`e2e/fixtures.ts`).
- **No outside services.** The cloud runs with a throwaway master key and no storage or database, so the suite needs
  no secrets and touches no real studio. What can't run that way waits for the staging cloud (below).
- **The desktop's web view is tested in Chromium, outside the Tauri window.** What needs Rust (the computer check,
  signing in) is covered by `--self-check` and the app-open tests in `install.yml`; these tests check that the
  screens say plainly when they need the app.
- **No retries.** A flaky test is a bug to fix (ENGINEERING.md).

## What the suite covers today

| App | Flow |
| --- | --- |
| Cloud | A signed-out visit goes to sign in and keeps where it was going |
| Cloud | The sign-in form explains a bad email or short password next to the field |
| Cloud | A wrong access token is refused, and the API stays closed |
| Cloud | The right token starts a session cookie that is HTTP-only, HTTPS-only, SameSite=Lax and never holds the key |
| Cloud | /privacy, /terms and /data-deletion are public and fit a phone |
| Desktop | Opens on Vee's welcome with no errors |
| Desktop | The setup wizard starts with goals and says the computer check needs the app |
| Desktop | Connecting a studio says plainly that it needs the app |
| Desktop | The guide opens before signing in |

## Next

- With the **staging cloud** (Phase 0): the full round trip past sign-in (the next page reads "sign out everywhere"
  from storage, so without storage it fails closed, correctly), then **sign-up, invites and two people in one
  workspace**, the Phase 0 test.
- Each new screen adds its flows here, at both widths.

## Pre-mortem

| Risk | Guard |
| --- | --- |
| A test passes whatever the page does | Each was seen failing: the connect test went red when its message changed |
| Tests pass against a stale local server | `reuseExistingServer` is off in CI: it always builds and starts fresh |
| A real studio or key is touched | The cloud runs with a made-up key and no storage, database or provider |
| Screens break on phones unnoticed | Every test runs at 390 px and fails on sideways scrolling |
| Flaky tests get retried until green | Retries are 0 |
