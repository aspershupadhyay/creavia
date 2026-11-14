# Stage 6: technical design

**Status:** not started. **Done when:** a review confirms every PRD can be built on the design, and the threat model
has an answer for each threat. Keep what runs today; add only what multi-user service and agents need.

## Tech stack

| Layer | Choice | Status |
| --- | --- | --- |
| Desktop app | Tauri 2 + Rust: keychain sign-in, all network calls, model downloads, local engine, local MCP, updates | In use (`desktop/`) |
| Screens | React 19, TypeScript, Vite; one set for app and web | In use (`cloud/components`) |
| Web and API | Next.js on Cloudflare Workers (OpenNext) | In use (`cloud/`) |
| Database | Postgres on Neon; `workspace_id` on every row; row-level security as a second lock | In use; workspaces to add |
| Live updates | Neon Realtime; Durable Objects if outgrown | In use |
| Files | Cloudflare R2; Backblaze B2 for large media | In use |
| Models we run | Python engine (`engine/`) on the creator's computer, or Modal, Kaggle, Colab | In use |
| Outside AI | Claude, OpenAI, Gemini… via Creavia's keys or the creator's own | To add |
| Agents | Task queue and durable workflows (Cloudflare Queues and Workflows), one runtime, registry tools | To add |
| Memory and search | Postgres full-text; vectors (pgvector or Cloudflare Vectorize) | To add |
| MCP | Adaptive endpoint, OAuth, per-AI keys; local MCP in the app | In use |
| Payments | Stripe, Razorpay | To add |
| Email | A sending service (e.g. Resend or Postmark) | To add |
| Analytics and errors | PostHog, Sentry | To add |
| CI and releases | GitHub Actions; signed installers; in-app updates | In use |
| Phone | Tauri 2 mobile or React Native, decided in Phase 4 | Later |

## Core data model

Workspace (members with roles, connections, settings, plan, usage) · Project (ideas, scripts, files, posts, deal) ·
Post (platform, time, status, results) · Person (messages, deals) · Deal (deliverables, reports, invoices) · Task (agent
job: steps, log, cost, approvals) · Memory (facts and style notes per workspace) · Audit log (every action by a person,
an agent or an outside AI).

## Security design

- One check sets the workspace on every request; isolation tests on every route.
- Tokens and keys sealed on the server or in the keychain; never to the browser or a model.
- Agents treat comments, DMs, emails and pages as data, never instructions; act-level tools always pass the permission
  check.
- Rate limits per workspace, tool and AI key; the kill switch.
- Encryption in transit and at rest; daily backups with a tested restore.
- The existing rules in CLAUDE.md (isAuthed on every route, allow-list, same-origin, session expiry) stay.

## Costs, designed in

Every AI call, GPU minute and gigabyte metered per workspace from day one.

**Deliverables:** architecture diagram, data model, tool registry spec, agent runtime spec, threat model, decision
records in `docs/adr/` (one short note per big choice).
