# 0001 · Quality tooling: tests, linters and formatters in every part

**Status:** accepted (2026-11-14) · **Plan item:** Phase 0, quality foundation
([../town/phases/phase-0-foundation.md](../town/phases/phase-0-foundation.md))

## Context

docs/ENGINEERING.md asks for unit, integration and isolation tests in every part, a linter and a formatter, and CI that
blocks merges on them. Before this, only the desktop had tests (Vitest, one file) and Rust had a few `cargo test`s;
the cloud, where every security rule lives, had none, and nothing linted or formatted anything. Most of the code was
written before any of this, and much of the cloud's UI (`cloud/components`) is VoiceBox's, due to be replaced by the
new screens, not polished.

## Decision

| Part | Tests | Lint | Format |
| --- | --- | --- | --- |
| cloud (Next.js) | Vitest (`cloud/vitest.config.ts`); unit tests beside the code as `*.test.ts`, service-wide sweeps in `cloud/test/` | Biome | Biome |
| desktop web view | Vitest (already there) | Biome | Biome |
| desktop Rust | `cargo test --lib` | clippy, warnings are errors | rustfmt (`rustfmt.toml`: 120 columns) |
| engine (Python) | pytest (`engine/tests/`), no GPU, models or network | ruff: Pyflakes and syntax errors | ruff format |

- **One CI workflow, `checks.yml`, runs all of it on every pull request** with no path filter, so branch protection can
  require it. Builds and the self-check stay in `cloud.yml` and `desktop.yml`.
- **Biome, not ESLint + Prettier:** one fast tool, one config (`biome.jsonc`), no plugin tree to keep in step.
- **No test reaches the network.** `cloud/test/setup.ts` makes `fetch` and `WebSocket` throw in every test unless the
  test stubs them; the engine tests import only pure modules.
- **The signed-out sweep** (`cloud/test/routes.test.ts`) calls every route in `cloud/app`, by every method, as a
  stranger and with a made-up key. Each must refuse (4xx, 503, or a redirect to /login) without touching the network;
  only methods `cloud/test/route-guards.ts` marks open, with a reason, may answer. A route missing from that list fails
  the test. This is the first part of the workspace-isolation suite: when `workspace_id` lands, the same sweep calls
  every route with another workspace's ids.
- **Code written before the tools keeps its layout.** Reformatting 300 files at once would bury real changes and every
  open branch. So:
  - Biome: files that existed on 2026-11-14 are listed in `biome.legacy.jsonc`, with formatting off and a lower lint
    floor (correctness and security; accessibility and style off, since the old screens are being replaced). Every
    other file, including every new one, gets all recommended rules and must be formatted. Rewriting a listed file
    takes it off the list in the same change.
  - ruff: the same, with the list in `engine/ruff.toml`. `engine/qwen_ft/` is the Qwen team's code and is not linted.
  - Rust: Creavia's own and small (eleven files), so it was formatted once, in its own commit (listed in
    `.git-blame-ignore-revs`, so `git blame` skips it), and is fully checked from now on.
- **Each false positive is silenced where it is**, with a `biome-ignore` or `noqa` comment saying why, never by turning a
  rule off for everyone.

## Not in this change (still on the Phase 0 item)

- **Playwright** for the core flows, in a real browser and the real app: needs the flows (sign-up, invite) to exist.
- **Sentry** for errors: needs an account and a DSN from the owner; opt-in on the desktop (ENGINEERING.md).
- **Pages in the sweep:** it calls `route.ts` handlers; server pages (`requireLogin`) and server actions get the same
  treatment with the workspace part of the isolation suite.
- **Coverage numbers** in CI: once there is enough `lib/` logic under test for a threshold to mean something.

## Pre-mortem: how this could go wrong, and what guards it

| Risk | Guard |
| --- | --- |
| A test quietly talks to R2, Neon or a provider | `fetch` and `WebSocket` throw in every cloud test (`test/setup.ts`) |
| A new route ships with no auth check | The sweep fails until the route is listed in `route-guards.ts`, and then it must refuse a stranger |
| A route "refuses" by crashing (500), after doing half the work | The sweep counts a 500 as a failure (it found one: docs/LESSONS.md) |
| A test that can never fail | Each security test was checked by breaking the code on purpose and watching it go red |
| The legacy lists keep growing | Their headers say never to add a file; review rejects it |
| A formatter run hides a logic change | Legacy files are not reformatted; the Rust format commit has no other change |
| Tools drift between laptops and CI | Biome, ruff and pytest are pinned to exact versions |

## Consequences

- `npm run lint` and `npm test` (plus `npm run test:engine`) run what CI runs; `npm run format` fixes formatting.
- New code meets the full rules from its first line; old code meets them as it is rewritten.
- The owner should mark the three **Checks** jobs as required on `main` (Settings → Branches).
