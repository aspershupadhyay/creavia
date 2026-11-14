# 0003 · Sentry for errors in the cloud, the desktop and the engine

**Status:** accepted (2026-11-14) · **Plan item:** Phase 0, quality foundation
([../town/phases/phase-0-foundation.md](../town/phases/phase-0-foundation.md))

## Context

ENGINEERING.md asks for errors to go to Sentry from the app and the cloud, opt-in on the desktop and free of
personal content. Creavia is also self-hostable: a fork or someone else's studio must never report into the owner's
Sentry. The owner chose all three parts, and Session Replay only for sessions that hit an error (2026-11-14).

## Decision

Sentry organization `creavia` (EU region, de.sentry.io), one project per part:

| Part | Project | SDK | Where the DSN comes from | When it reports |
| --- | --- | --- | --- | --- |
| Cloud: Worker, server pages, API | `creavia` | `@sentry/nextjs/cloudflare` (Worker entry wrapped with `withSentry`, `cloud/worker.ts`); request errors via `@sentry/cloudflare` (`instrumentation.ts`) | Worker variable `SENTRY_DSN` | Whenever it is set |
| Cloud: the browser | `creavia` | `@sentry/nextjs` (`instrumentation-client.ts`) | Build variable `NEXT_PUBLIC_SENTRY_DSN` (GitHub variable `SENTRY_DSN_CLOUD`) | Whenever it is set; replays only of sessions with an error, all text, inputs and media masked |
| Desktop app (Rust and its web view) | `creavia-desktop` | `sentry` crate (`src-tauri/src/crash.rs`) | Built in at release: `CREAVIA_SENTRY_DSN` (GitHub variable `SENTRY_DSN_DESKTOP`) | Only while the person has crash reports on (This computer page); off by default; checked on every event |
| Engine | `creavia-engine` | `sentry-sdk` (`engine/crashreports.py`) | `SENTRY_DSN`: from the studio (`ENGINE_SENTRY_DSN` on the Worker, via `/api/worker-env`) for cloud GPUs; from the desktop (`CREAVIA_ENGINE_SENTRY_DSN`, GitHub variable `SENTRY_DSN_ENGINE`) on a person's computer | Cloud GPUs: whenever the studio sets it. A person's computer: only while the app's settings file says crash reports are on, read before every report |

- **No DSN, no Sentry.** Every part reads its DSN from configuration and stays off without one; nothing is committed.
  A DSN is not a secret (it can only send events), so it lives in GitHub *variables*; the source-map upload token is
  the only *secret* (`SENTRY_AUTH_TOKEN`).
- **What is never sent** (each with a test): keys, cookies and session headers; IP addresses and user fields;
  request bodies, AI prompts and answers, MCP inputs and outputs, query values; local variables in stack frames; the
  computer's name; a person's home folder in paths and messages (it becomes `~`); secret query values (`token`,
  `ticket`, `code`, presigned `X-Amz-*`…) in requests and breadcrumbs; the engine's breadcrumbs and log arguments.
  Errors say where it broke, not what someone wrote.
- **The desktop's web view never talks to Sentry.** Its uncaught errors go to Rust (`crash_report_web`), which sends
  them only if reports are on, at most 20 a run, like every other network call (CLAUDE.md: secrets stay in Rust).
- **Consent is checked on every event, not at start-up.** The desktop makes its Sentry client once at launch (so every
  thread has it) and a flag the switch flips, read in `before_send`, decides whether anything leaves; the local engine
  reads the same choice from the app's settings file (`CREAVIA_CONSENT_FILE`) before each report. So the switch takes
  effect at once, both ways, for the app and a running engine, and no other source (such as a studio linked to the
  engine) can turn reports on for someone who didn't.
- **Release builds abort on panic**, so `crash.rs` flushes the report before the abort (one hook, installed once).
- **Job failures in the engine are reported too:** the gateway catches them so the engine keeps running, and reports
  each one, tagged with the job kind.
- **Light on the Worker (measured, gzipped):** Sentry as its guide sets it up grew the Worker from 6.27 MB to 8.92 MB,
  against Cloudflare's 10 MB limit. Two causes: `instrumentation.ts` importing `@sentry/nextjs` compiles the Node SDK
  into every server chunk, and `withSentryConfig` injects more at build time. So `instrumentation.ts` reports request
  errors with `@sentry/cloudflare` (to the client `worker.ts` makes), and `next.config.ts` is not wrapped: 6.90 MB,
  +0.64 MB. The cost: `next dev` / `next start` on a laptop report nothing, and source maps are not uploaded yet.
- **Sampling:** every error; traces at 100% in development and 10% in production (cloud only); no traces from the
  desktop or the engine.

## Verified (2026-11-14)

A real error from each running part reached its project and was then resolved:

| Part | How | Issue |
| --- | --- | --- |
| Cloud, the Worker (`workerd` via `wrangler dev`) | A temporary route that throws; reports sent through a local relay, since `workerd` can't use the sandbox's proxy | CREAVIA-2, tagged with its route |
| Cloud, first set-up (Node, `next start`) | The same route, before the Node path was dropped for size | CREAVIA-1 |
| Desktop (debug build, reports turned on) | A temporary panic at start | CREAVIA-DESKTOP-1 |
| Engine (the real gateway) | A voice job asking for a voice that doesn't exist | CREAVIA-ENGINE-1 |

The events carried no cookies, keys, user, IP address or computer name. The temporary triggers were removed.

**Not verified with a real event yet:** the browser (replays) and the desktop's web view path; both are covered by
unit tests. The deployed Worker is confirmed once `SENTRY_DSN` is set on it.

## For the owner, once

1. GitHub → Settings → Secrets and variables → Actions → **Variables**: `SENTRY_ORG` = `creavia`,
   `SENTRY_PROJECT_CLOUD` = `creavia`, `SENTRY_DSN_CLOUD`, `SENTRY_DSN_DESKTOP`, `SENTRY_DSN_ENGINE` (each project's
   DSN: Sentry → Settings → Projects → the project → Client Keys).
2. On the Worker: `npx wrangler secret put SENTRY_DSN` (the cloud DSN) and `npx wrangler secret put ENGINE_SENTRY_DSN`
   (the engine DSN), from `cloud/`.

**Open, for the owner to decide:** Sentry stores the IP address each report arrives from (the code never sends one;
for browser errors it is the visitor's). Each project's setting "Prevent storing of IP addresses" stops that; it is a
change to the Sentry account, so it waits for the owner's yes.

## Next

- Readable production stack traces: upload the cloud's source maps from CI with Sentry's CLI (not `withSentryConfig`,
  see above; it needs a `SENTRY_AUTH_TOKEN` secret), and debug files for the desktop's stripped release builds.
- Releases in CI, so an issue links to the deploy and commits that caused it.

## Pre-mortem

| Risk | Guard |
| --- | --- |
| A fork reports into the owner's Sentry | No DSN in the repo; off without one (tests in all three parts) |
| Personal content leaks into an event | `dataCollection` off for bodies, AI, MCP, users, cookies; `scrubEvent` / `scrub_event` with tests |
| The desktop or its engine reports without consent | Off by default; consent checked on every event in Rust and, from the settings file, in the engine (tests) |
| A loop floods Sentry | Web view errors capped at 20 a run; traces sampled at 10% in production |
| Sentry breaks the Worker | The Workers build and the signed-out route sweep run on every pull request |
| Sentry pushes the Worker past Cloudflare's size limit | Measured (+0.64 MB gzipped); no Node SDK on the server and no build wrapper |
| A report that can't be sent breaks the app | Every send path swallows its own failure, with a comment saying why |
