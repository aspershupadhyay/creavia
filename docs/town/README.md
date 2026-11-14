# The creator town: Creavia's product plan

Creavia is one app where a creator makes, plans, posts, answers, measures and gets paid, so 10 to 12 subscriptions
shrink to Creavia plus one or two tools they love. This folder is the plan. **Every session reads it before product
work** (CLAUDE.md says so). The same plan, with drawings, lives in the doc
[Creavia: the creator town](https://claude.ai/artifact/JuzgR5Jggu2bBVZX1amo4p); when the two differ, the newer change
wins, and the other is updated in the same session.

## What is where

| File | What it holds |
| --- | --- |
| [town-map.md](town-map.md) | The houses, every feature with its status, the UI and UX structure, plans, risks |
| [agents.md](agents.md) | Vee and the crew (Juno, Bolt, Tempo, Echo, Lens, Penny, Atlas): jobs, characters, the agent spec, guardrails |
| [connectors.md](connectors.md) | One tool registry, MCP for every AI, the marketplace, and the free / approval / paying buckets |
| [phases/](phases/) | The product roadmap: Phase 0 (foundation) to Phase 4 (expand), each with what ships and its test |
| [stages/](stages/) | How we build it, from zero to production, in 12 stages, each with deliverables and a "done when" test |

## Where we are

- **Now:** Phase 0 (foundation) has not started. VoiceBox's features exist in Creavia's `cloud/` as the studio's
  screens; the desktop app (0.1.2) ships with in-app updates.
- **Next:** Stage 1 to 3 for Phase 0 (strategy page, research plan, PRDs), then the Phase 0 build.
- Update this section whenever a phase or stage moves.

## Rules that come from this plan

1. **Build, connect or skip.** Build only what beats the leader for creators; otherwise connect to it.
2. **Every action is one tool** in the registry, used by the screens, Vee, the crew and outside AIs alike.
3. **A house opens only when it is good enough to cancel the tool it replaces.**
4. **Act-level tools (post, send, spend, delete) ask first**, whatever an agent's dial says.
5. **The hosted VoiceBox is never changed by Creavia work** (aspershupadhyay/voicebox-gpu stays as it is).
6. Plain names in the app: Home, Ask Vee, Ideas, Create, Calendar, Inbox, Analytics, Money, Files, Settings.
