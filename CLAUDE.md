# Working in this repo

Creavia: a creator studio. `desktop/` (Tauri 2 + Rust + the studio's React screens), `cloud/` (Next.js on Cloudflare
Workers via OpenNext: the hosted studio, its API and MCP), `engine/` (the Python GPU worker), `brand/`, `docs/`.
It grew out of aspershupadhyay/voicebox-gpu; read docs/PLAN.md for the decisions and what's next.

## Read first

- `docs/FEEDBACK.md`: the owner's feedback, newest first; it wins over older rules. Add new feedback there in the same
  pull request as the change.
- `docs/DESIGN.md` for any screen (matte black, flat, Geist, marigold the one accent, Vee the mascot, no AI gradients).

## Rules

- **Never bundle model weights** in the app or the repo. New models go in `desktop/src-tauri/models.json` (docs/MODELS.md).
- **Secrets never reach the web view or git.** The desktop's session, tokens and keys stay in Rust (`store.rs`:
  keychain, or a 0600 file on Linux). The cloud's live on the Worker (`.dev.vars.example` lists them).
- **The studio's screens stay shared:** `cloud/components` runs in the web studio and the app. Desktop-only pages go in
  `desktop/src/pages`; a hook for the host goes through `ShellHost` (`cloud/components/Shell.tsx`), not a fork.
- **Security of the cloud** is unchanged from VoiceBox: every route checks `isAuthed(req)` (cloud/lib/session.ts);
  never loosen the allow-list, the same-origin check or the session expiry. The desktop reaches the cloud through Rust,
  which sends no Origin, so it needs no exception.
- **The local MCP** binds to 127.0.0.1, needs its token, and refuses foreign Origins. Keep all three.
- A DB change: a new `cloud/db/NNN_*.sql` (idempotent, IF NOT EXISTS), then `npm run schema -w cloud`.

## Checks before pushing

- `npm run check` (typecheck cloud and desktop) and `npm run build -w desktop`
- `cd desktop/src-tauri && cargo build && ./target/debug/creavia --self-check` (add `=full` to download Kokoro, run the
  engine and voice a line); build with `CARGO_BUILD_JOBS=4` on small machines
- `npm run build:worker -w cloud` (OpenNext) for anything runtime-sensitive: Workers forbid code generated at run time and
  native modules
- `cd cloud && npx -y tsx scripts/check-register.mts` for any MCP tool change
- `python3 -m py_compile engine/*.py` for engine changes
- Screens: check them at full width and at 390 px.

## Shipping

Commit, push the branch, open a pull request to `main`, merge once checks pass.

A release (.github/workflows/desktop.yml): bump the version in `desktop/src-tauri/tauri.conf.json` and `Cargo.toml`,
merge, then Actions → Desktop → Run workflow on `main` with `release` = `v0.2.0` (or push a `v0.2.0` tag). It builds
every installer, publishes the release, and installed apps offer the update themselves (signed with the
`TAURI_SIGNING_PRIVATE_KEY` secret; never commit that key).
