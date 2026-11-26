# The creator town: Creavia's product plan

Creavia is one app where a creator makes, plans, posts, answers, measures and gets paid, so 10 to 12 subscriptions
shrink to Creavia plus one or two tools they love. This folder is the plan. **Every session reads it before product
work** (CLAUDE.md says so). The same plan, with drawings, lives in the doc
[Creavia: the creator town](https://claude.ai/artifact/JuzgR5Jggu2bBVZX1amo4p). **This folder is the source of truth;**
the doc is the readable view, refreshed from here when a phase or stage changes.

## What is where

| File | What it holds |
| --- | --- |
| [town-map.md](town-map.md) | The houses, every feature with its status, the UI and UX structure, plans, risks |
| [agents.md](agents.md) | Vee and the crew (Juno, Bolt, Tempo, Echo, Lens, Penny, Atlas): jobs, characters, the agent spec, guardrails |
| [connectors.md](connectors.md) | One tool registry, MCP for every AI, the marketplace, and the free / approval / paying buckets |
| [self-hosting.md](self-hosting.md) | Hosting Creavia Cloud anywhere: what ties it to Cloudflare today, and the plan |
| [phases/](phases/) | The product roadmap: Phase 0 (foundation) to Phase 4 (expand), each with what ships and its test |
| [stages/](stages/) | How we build it, from zero to production, in 12 stages, each with deliverables and a "done when" test |

## Where we are

- **Ready to build (2026-11-14):** the plan, the engineering standard (docs/ENGINEERING.md), the lessons log, CI with
  tests, Guard (secrets, VoiceBox separation), CodeQL and Dependabot (minor and patch only) are in place. `main` is the
  default branch and is protected: every change is a pull request that passes the required checks. The desktop app
  (0.1.2) ships with in-app updates; VoiceBox's UI still runs in `cloud/components` until the new screens replace it.
- **Phase 0 started (2026-11-14):** the quality foundation's first part is in: tests in every part (Vitest in cloud
  and desktop, `cargo test`, pytest), Biome, ruff, rustfmt and clippy, one `Checks` workflow on every pull request, and
  a sweep that calls every cloud route signed out ([ADR 0001](../adr/0001-quality-tooling.md)).
- **Playwright is in** (2026-11-14): sign-in and first-run flows in the cloud and the desktop, at full width and
  390 px, on every pull request ([ADR 0002](../adr/0002-end-to-end-tests.md)).
- **Sentry is in** (2026-11-14): errors from the cloud, the desktop (only if the person turns it on) and the engine,
  with nothing personal sent; a real error from each was confirmed ([ADR 0003](../adr/0003-sentry.md)).
- **Staging is in the repo** (2026-11-26): a second Worker with its own bucket, database and test accounts; every
  merge to main is tested there signed in before production ([ADR 0004](../adr/0004-staging.md)). It goes live with
  the owner's one-time setup.
- **Workspaces, slice 1 is in** (2026-11-26): every post, comment, activity and file row belongs to a workspace, one
  place decides which, and tests on a real Postgres prove one workspace can't reach another's rows
  ([prd/foundation-workspaces-accounts.md](prd/foundation-workspaces-accounts.md)).
- **Stored files are per workspace too** (slice 2a, 2026-11-26): every settings, state and media file lives under its
  workspace, and tests prove one workspace can't read, list or delete another's.
- **Keys, links and scheduled work too** (slice 2b part 1, 2026-11-26): MCP keys, GPU keys, upload and share links
  each name their workspace and work only there; scheduled work runs once per workspace. Auto-DM too (slice 2b part 2):
  each Instagram account belongs to one workspace, and its comments, DMs, inbox and link clicks stay there.
- **UX direction set** (2026-11-26): handled the way Town handles its assistant, as Creavia's own
  ([stages/04-ux.md](stages/04-ux.md)).
- **Accounts begun** (slice 3a, 2026-11-26): with `OPEN_SIGNUP` on, anyone can sign up into a workspace of their own;
  owners invite people by a one-time link, set roles and remove people; a person switches between workspaces. API only.
- **Email and Google** (slice 3b part 1, 2026-11-26): password reset by email, Google sign-in, and open sign-up checks the
  email before the workspace can be used. Everyone already in the studio stays an owner.
- **Each workspace runs itself** (slice 3b part 2, 2026-11-26): its own sign-in log, "sign out everywhere" and GPU worker
  key, so Colab works in every workspace.
- **A second lock** (slice 4, 2026-11-26): Postgres itself keeps each workspace's rows to that workspace (row-level
  security), and a sweep calls every MCP tool with another workspace's ids. Workspaces and accounts are done.
- **Account screens** (2026-11-26): sign in, sign up, check your email, reset a password and accept an invite on
  `/login`; workspaces, people, roles and invites on `/account`. The first screens in Creavia's own design
  (`cloud/creavia/`), not VoiceBox's.
- **Next:** "The app connects by itself" (the desktop signs in to the service with these screens' accounts) and the
  new frame; the owner's setup of
  staging and retesting live updates run alongside (see
  [phases/phase-0-foundation.md](phases/phase-0-foundation.md)), then Stage 1 to 3 for Phase 0 (strategy page,
  research plan, PRDs), then the Phase 0 build.
- Update this section whenever a phase or stage moves.

## Rules that come from this plan

1. **Build, connect or skip.** Build only what beats the leader for creators; otherwise connect to it.
2. **Every action is one tool** in the registry, used by the screens, Vee, the crew and outside AIs alike.
3. **A house opens only when it is good enough to cancel the tool it replaces.**
4. **Act-level tools (post, send, spend, delete) ask first**, whatever an agent's dial says.
5. **The hosted VoiceBox is never changed by Creavia work** (aspershupadhyay/voicebox-gpu stays as it is).
6. **No VoiceBox UI.** Every screen is designed new (stages 4 and 5); VoiceBox's back end may sit behind new screens,
   but none of its components, layouts or styles are reused.
7. **Bring any AI.** Every AI feature runs on the provider and model the creator picks with their own key, or a local
   model, like opencode; Creavia's own AI is just one more provider.
8. **Agents work like employees:** tasks are assigned, briefed, tracked and reported ([agents.md](agents.md)).
9. Plain names in the app: Home, Ask Vee, Ideas, Create, Calendar, Inbox, Analytics, Money, Files, Settings.
