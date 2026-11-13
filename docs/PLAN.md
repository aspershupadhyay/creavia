# Creavia: the plan

Creavia is VoiceBox (aspershupadhyay/voicebox-gpu) grown into a product other people can use: a native app, their own
cloud in one click, models they choose. Decisions and what's left, in order. Tick as things ship.

## Decisions (2026-11-13)

- **Name: Creavia.** Mascot: Vee, a soft gumdrop with a spark of an idea (cutemorphism, flat colours, `brand/`).
  Marigold `#FFB627` is the one accent on matte black; no purple/blue "AI" gradients.
- **Desktop: Tauri 2 + Rust.** The studio's React screens (`cloud/components`) run unchanged inside the app; Next.js
  imports are shimmed (`desktop/src/shims`). Rust does what a browser can't do well: holds the session (keychain),
  makes every request (no CORS, no key in the web view), streams media (`cloud://`), downloads models, runs the engine,
  serves the local MCP. Not Electron: ~10 MB instead of ~150 MB, native speed.
- **Models are never bundled** (like ComfyUI). A catalogue (`desktop/src-tauri/models.json`) says what each is, its
  size, GPU need and licence; downloads go straight from Hugging Face or GitHub into the engine's own cache layout, so
  the engine never downloads twice.
- **The engine is the same one the cloud GPUs run** (`engine/gateway.py`), started by the app on this computer, or lent
  to the user's studio as its GPU (`engine/launcher.py`: tunnel + heartbeat, like Colab).
- **MCP, local or hosted.** Local: `127.0.0.1:7377/mcp`, token, refuses foreign Origins; its own `local_*` tools plus
  the studio's, forwarded with a model key the app makes for itself. Hosted: the studio's `/api/mcp` with OAuth.
- **The cloud stays on Cloudflare** (Workers Paid, $5/month: a ~6 MB Worker, over the free 3 MB) + R2, Postgres on Neon. One-click deploy: the Deploy to Cloudflare
  button (`cloud/package.json` scripts, `.dev.vars.example`), or `npm run cloud:deploy` (`cloud/scripts/deploy.mjs`).
  A fresh studio makes its own tables (`lib/schema.ts` from `db/*.sql`, `ensureSchema`).

## Shipped in v0.1

- [x] Monorepo: `desktop/`, `cloud/`, `engine/`, `brand/`, `docs/`
- [x] Brand: Vee (icon, mascot, wordmark), marigold tokens, the studio's logo animates (blink, twinkle)
- [x] Desktop shell: every studio page (Create and Grow), the studio's own sidebar with a *This computer* section, a local
      frame before a studio is connected, tray, single instance, macOS overlay title bar
- [x] First run (Welcome): where the AI runs, starter models picked for this machine's GPU
- [x] Connect: sign in, new account, or access token; session kept by Rust
- [x] Models: catalogue, GPU fit, licence, resumable parallel downloads with progress, delete, folder, optional HF token
- [x] Engine: uv setup, start/stop, logs, lend to studio
- [x] MCP: local server (7 local tools + the studio's), snippets for 6 clients, token rotation
- [x] Deploy: Neon → Deploy to Cloudflare → Connect; terminal path
- [x] `creavia --self-check[=full]`: proven end to end on Linux (Kokoro downloaded, engine set up, a line voiced via MCP)
- [x] CI: desktop checks + builds for macOS (arm64, x64), Windows, Linux; cloud checks + optional deploy
- [x] Updates in the app (updater.rs, shell/updates.tsx): signed bundles from GitHub Releases, checked on launch and
      every 4 hours, one click to install and restart. The release job publishes only when every platform built.
- [x] The guide (`/guide`, pages/Guide.tsx, guide/content.ts, guide/art.tsx): 11 chapters with drawn scenes, steps
      with buttons that do the step, a key maker for hosting, search, read ticks; open before and after sign-in
- [x] Onboarding: goals → a look at the machine → where AI runs → models for those goals and that GPU → online or
      not → done
- [x] Downloads need no token: public models only, SHA-256 checked against the maker's record, busy servers waited
      out; the token is an optional Advanced setting

## Next, in order

1. **Signing.** v0.1.0 is out unsigned (macOS ad-hoc: right-click → Open; Windows: More info → Run anyway). Add the
   updater key as the `TAURI_SIGNING_PRIVATE_KEY` secret so every later tag ships signed updates (the public half is in
   tauri.conf.json; lose the private half and installed apps can't update). Then an Apple Developer ID + notarisation
   (`APPLE_*` secrets) and a Windows code-signing certificate, to drop the first-launch warnings.
2. **Multi-user studios.** Today a studio is one team (the founder and the emails they allow). For a public service:
   a workspace id on every row and R2 prefix, sign-up with plans and limits (GPU minutes, storage), per-workspace
   YouTube/Instagram connections (Google and Meta app review), per-workspace keys. Until then, everyone deploys their
   own studio (one click), which is the privacy-first default anyway.
3. **Local-only studio:** the cloud's routes served by the app itself (Rust or a bundled Workers runtime with local R2
   and Postgres), so posts, files and the workspace work with no cloud at all.
4. **Engine everywhere:** Apple Silicon (MLX / Metal builds of the voice engines), Windows without WSL (the gateway's
   `resource` use, process groups), a bundled `cloudflared`.
5. **Native file paths for big uploads:** drag a 2 GB file in and Rust streams it from disk with real progress, instead
   of reading it into the web view.
6. **Linux keychain** (Secret Service) instead of the 0600 file; launch at login; deep links (`creavia://`) for OAuth.
7. **A smaller Worker** (split rarely used routes, lazy-load heavy libraries) to fit the free plan's 3 MB.
8. **Commit a lockfile** (`npm install` at the root, from a machine that reaches cdn.sheetjs.com): OpenNext finds the
   workspace root by it; CI and Cloudflare make one on install meanwhile.
9. **Port the cron jobs** (VoiceBox's `sweep.yml`, the live timer) to Cloudflare Cron Triggers so a one-click studio
   needs no GitHub Actions.
