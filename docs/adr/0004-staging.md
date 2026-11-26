# 0004 · A staging copy of the cloud, tested before production

**Status:** accepted (2026-11-26) · **Plan item:** Phase 0, "A Creavia cloud of its own, plus staging"
([../town/phases/phase-0-foundation.md](../town/phases/phase-0-foundation.md))

## Context

Playwright stops at the sign-in page (ADR 0002): past it the studio needs a real database and bucket, which a pull
request's CI doesn't have. Releases also went straight to production. The plan asks for Creavia's own cloud plus a
staging copy with test accounts, and never the live VoiceBox.

## Decision

- **Staging is a second Worker on the same Cloudflare account**, `creavia-cloud-staging` (wrangler.jsonc
  `env.staging`), with its own bucket `creavia-staging`, its own database (a `staging` branch of the Creavia Neon
  project, never production's) and its own secrets. It runs the same build as production.
- **Staging can't reach production's files.** Its `R2_BUCKET` names its own bucket, and `lib/store.ts` uses the R2
  binding only for a bucket wrangler.jsonc binds, so the binding and presigned links always point at the same one.
  Tests check both (`cloud/test/wrangler.test.ts`, `cloud/lib/store.test.ts`); the Guard workflow also checks the names.
- **Set up once from a terminal:** `npm run setup -- --staging` (in `cloud/`) makes the bucket, asks for the staging
  database, makes the secrets (kept in `cloud/.secrets.staging.local`, gitignored), deploys, and creates two test
  accounts through the studio's own sign-up: `owner@staging.creavia.test` and `member@staging.creavia.test`, the only
  emails on staging's list (`WORKSPACE_EMAILS`). It prints what to put in GitHub.
- **On every merge to main** (Cloud workflow): one build → deploy to staging → the signed-in end-to-end tests on
  staging (`npm run e2e:staging`, at full width and 390 px) → deploy to production only if they pass. Until staging
  exists the workflow says so and deploys production as before.
- **The signed-in tests** (`e2e/staging/`): the owner signs in with email and password and is who the studio says; a
  wrong password opens nothing; signing out ends the session; a post the owner makes is seen by the member (two people,
  one workspace), then deleted. They refuse to run against any address but the staging Worker's, because they write.
- **Errors from staging are tagged `staging` in Sentry** (the Worker's `SENTRY_ENVIRONMENT`; the browser by its address,
  since the build is shared).
- **One lockfile** (`package-lock.json`, all platforms) and `npm ci` in every workflow, so CI, staging and production
  install exactly what was tested.

## Not done here

- **Not yet run against a live staging.** The tests were written against the real routes and skip with the reason until
  `STAGING_URL` and the test accounts are set; their first run is the owner's setup below. Creating the Worker, bucket
  and Neon branch needs the owner's Cloudflare and Neon accounts.
- Live updates (`@neon/realtime` 0.2) need `NEON_REALTIME_URL` / `NEON_REALTIME_SECRET` on staging; retesting them is
  the next plan item.
- Pull-request previews (a staging per pull request) are left for later: one staging is enough while the team is small.

## For the owner, once

1. Neon: in the Creavia project, Branches → New branch `staging`; copy its connection string.
2. From `cloud/`: `npm run setup -- --staging` (signs in to Cloudflare, asks for that string).
3. GitHub → Settings → Secrets and variables → Actions: variable `STAGING_URL`; secrets `E2E_OWNER_EMAIL`,
   `E2E_OWNER_PASSWORD`, `E2E_MEMBER_EMAIL`, `E2E_MEMBER_PASSWORD` (the script prints them; the passwords are in
   `cloud/.secrets.staging.local`). The repository already deploys when `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` are set.
4. Optional: `npx wrangler secret put SENTRY_DSN --env staging` (the cloud DSN), so staging reports its errors.

## Pre-mortem

| Risk | Guard |
| --- | --- |
| Staging writes production's files | Own bucket; binding and links name the same bucket (tests); Guard checks the names |
| Staging uses production's database | Its own secrets on its own Worker; the setup asks for a staging branch, in words |
| Tests write to a real studio | They refuse any address but `https://creavia-cloud-staging.<you>.workers.dev` |
| A broken build reaches production | Production deploys only after the staging tests pass on that same build |
| Test data piles up | The test that makes a post deletes it in a `finally` |
| Anything reaches the live VoiceBox | No name of it in config or code (Guard, `cloud/test/wrangler.test.ts`) |
| CI installs something different from what was tested | `package-lock.json` and `npm ci` everywhere |
