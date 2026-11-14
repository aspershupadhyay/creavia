# Lessons

Every bug that reached `main` or a release: what happened, why, what now catches it, and the rule that changed.
Newest first. Read the entries for an area before working in it (docs/ENGINEERING.md, step 7).

## 2026-11-14 · Desktop: a studio address typed as "HTTPS://…" became "https://https"

- **What:** `normalize_url` checked for `https://` in lower case only, so a capitalised scheme got a second one added
  and the host became `https`. Found by the new tests for the live-VoiceBox block, before any user hit it.
- **Now caught by:** `net::tests::the_scheme_is_read_in_any_case` (`cargo test --lib`, run in CI).
- **Rule:** URL handling is tested with odd spellings (case, trailing dots and slashes, ports, subdomains).

## 2026-11-14 · Windows: the app crashed on open with "Out of Memory" (0.1.1)

- **What:** on Windows the page used over 3 GB within seconds and WebView2 killed it.
- **Why:** the network bridge treated Tauri's own `http://ipc.localhost` as a web address and sent it through Rust,
  which called `ipc.localhost` again, forever. macOS and Linux use `ipc://`, so only Windows broke.
- **Now caught by:** `desktop/src/bridge/fetch.test.ts` (fails without the fix) and the Windows app-open test in
  `.github/workflows/install.yml`.
- **Rule:** a desktop change is tested by opening the real window on Windows, macOS and Linux; `--self-check` alone
  never draws the page.

## 2026-11-13 · install.sh: the AppImage install failed on its icon

- **What:** copying the AppImage's top-level icon failed. **Why:** it is a symlink inside the image.
- **Now caught by:** the AppImage job in the Install workflow. **Rule:** extract real files (`usr/share/icons/*`), and a
  missing icon never stops an install.

## 2026-11-13 · macOS builds failed: "failed to import the signing certificate"

- **What:** an empty `APPLE_CERTIFICATE` secret was passed to the build. **Why:** the step set the variables whether
  or not the secret existed.
- **Rule:** optional secrets are exported only when present.

## 2026-11-13 · 0.1.0 shipped without update files

- **What:** no `latest.json`. **Why:** the signing key was added after the builds had started.
- **Rule:** check required secrets before starting a release.

## 2026-11-13 · The engine deleted other models to free disk (on a user's computer)

- **What:** the 12 GB disk guard, made for cloud GPUs, removed weights and the Hugging Face cache.
- **Rule:** cloud-only behaviour is switched off on a person's computer (`CREAVIA_LOCAL=1`); nothing outside Creavia's
  folders is ever deleted.
