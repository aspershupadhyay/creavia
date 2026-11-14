# Host Creavia anywhere (self-hosting)

**Goal:** anyone can run Creavia Cloud wherever they like: their own server, a home machine, Railway, Render, Fly.io,
DigitalOcean, AWS, or Cloudflare as today. Free to self-host; Creavia's hosted cloud is the paid convenience.

## What ties it to Cloudflare today

| Piece | Today | Why it blocks other hosts |
| --- | --- | --- |
| Runtime | Next.js built for Cloudflare Workers (OpenNext) | Workers-only APIs and bindings |
| Files | R2 through the Worker's `BUCKET` binding; B2 for big media | Bindings exist only on Cloudflare |
| Database | Neon's serverless driver | Fine on Neon; other Postgres needs the standard driver |
| Live updates | Neon Realtime | Neon-only |
| Timers and queues | Cloudflare timers, GitHub Actions crons | Platform-specific |
| Sign-in to YouTube, Instagram… | OAuth apps approved for one domain | Each deployment needs its own approved apps, or a relay |
| GPU | Modal, Kaggle, Colab, or the desktop engine | Already portable (a URL and a secret) |

## What we do (one codebase, many hosts)

1. **Ports and adapters (Phase 0, the rule from docs/ENGINEERING.md):** storage, database, realtime, queues and
   timers, email, payments and AI sit behind small interfaces in `cloud/lib/ports/`, with one adapter per vendor.
   | Port | Adapters |
   | --- | --- |
   | Storage | S3 API (covers R2, B2, AWS S3, MinIO, Wasabi), the R2 binding on Cloudflare |
   | Database | Standard Postgres driver (any Postgres 15+: Neon, Supabase, RDS, your own), Neon's driver on Workers |
   | Realtime | Postgres LISTEN/NOTIFY with server-sent events on Node; Neon Realtime or Durable Objects on Cloudflare |
   | Queues and timers | Postgres-backed jobs (pg-boss) on Node, so no extra service; Queues and Workflows on Cloudflare |
   | Email | SMTP, or a provider's API |
2. **Two runtimes from the same code:** Cloudflare Workers (OpenNext, as today) and Node (Next.js standalone). CI builds
   and tests both.
3. **Packaging:**
   - An official Docker image (amd64 and arm64), versioned with each release.
   - `docker compose up`: Creavia, Postgres and MinIO, with an `.env` template; optional engine container for an NVIDIA
     GPU.
   - Start-up checks every setting and runs safe migrations; a first-run screen makes the owner's account; sign-up is
     closed by default.
   - A health endpoint, and a `creavia doctor` command that checks the database, storage, keys and connections.
4. **One-click templates:** Cloudflare (the Deploy button, exists), Railway, Render, Fly.io, DigitalOcean, and Coolify
   for your own server; a Helm chart for Kubernetes later.
5. **Social sign-in, the hard part:** YouTube, Instagram and TikTok need OAuth apps approved for a domain.
   - Personal use: the self-hoster makes their own Google and Meta apps (a step-by-step guide in the app); in Meta's
     development mode an app works for its own accounts and testers without review.
   - Later, **Creavia Connect**: our approved apps handle the sign-in and hand the tokens to the self-hosted studio, as
     an opt-in, clearly explained (it means trusting Creavia with that step).
6. **Updates:** versioned images and plain release notes; back up before an upgrade; migrations that run while the old
   version still serves; a way back.
7. **Security for self-hosters:** TLS required, secrets from the environment, a hardening checklist, backups guide;
   the same isolation and security tests run against the Docker build in CI.
8. **The desktop app** already connects to any studio address; nothing changes there.
9. **Testing:** CI runs the integration and isolation suite on both runtimes and with both storage adapters; a nightly
   `docker compose up` with the end-to-end flows.

## Decisions for the owner

- [ ] **Licence:** open source (for example AGPL-3.0, which keeps hosted copies open) or source-available (for example
      FSL or BSL, which stops others selling it as a service). Decide before the code is public as self-hostable.
- [ ] **When:** the ports-and-adapters rule starts now (Phase 0), so nothing new locks in; Docker and compose in
      Phase 1 or 2; templates and the Connect relay in Phase 4.
- [ ] **Support:** community help for self-hosters (a forum or Discord) vs paid support.

## Done when

- `docker compose up` on a clean Linux server gives a working studio that posts to YouTube with the owner's own app,
  passes the isolation and end-to-end suites, and upgrades to the next version without losing data.
