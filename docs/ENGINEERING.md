# How we build every feature

Every feature in Creavia is built to this standard, by people and AI alike. The aim: few bugs, and code a person can
read and change without fear. CLAUDE.md sends every session here; a feature is not done until each step below is.

## 1. Before writing code

1. **Read the spec** (its PRD in `docs/town/prd/`) and the owner's feedback (`docs/FEEDBACK.md`). No spec, no code:
   write a short one first (stage 3 template).
2. **Pre-mortem, five minutes:** list how this could break: no internet, a slow or failing provider, an expired
   sign-in, an empty list, a huge file, a double click, two people editing at once, another workspace's id, a hostile
   message reaching an agent, Windows vs macOS vs Linux. Each item becomes a test or a guard.
3. **Plan the tests** before the code: what proves each acceptance criterion.
4. **Suggest better:** if there's a simpler or stronger way than the spec, say so to the owner before building.

## 2. Writing code a person can read

- **Plain names:** `scheduleTimeFor(post)`, not `calcT(p)`. Names say what, comments say **why**.
- **Each file starts with what it is for** (two or three lines), as the existing files do.
- **Small pieces:** a function does one thing; a file holds one idea; folders have a README when they hold a system.
- **Types everywhere:** TypeScript strict, no `any`; Rust with no `unwrap()` on anything that can fail at run time;
  Python with type hints.
- **Check data at the edges:** every request body, tool input, webhook and file is validated (zod in TypeScript, serde
  in Rust) before use. Inside, trust the types.
- **Errors are handled, never swallowed:** no empty `catch {}` without a comment on why it's safe. A failure tells the
  user what happened and how to fix it, and logs enough to debug it.
- **Every network call has a timeout, retries with backoff where safe, and an idempotency key** where repeating it would
  hurt (posting, payments, DMs, invoices).
- **No clever code.** If a reader needs a minute to see what a line does, rewrite it or explain it.
- **No dead code, no commented-out code, no TODO without an owner** (a TODO names the issue or plan item).
- **Secrets never in code, logs, the browser or a model** (CLAUDE.md).

## 3. Tests: what each change must have

| Kind | For | Tool |
| --- | --- | --- |
| Unit tests | Every piece of logic: parsing, routing, prices, schedules, permission checks | Vitest (TypeScript), `cargo test` (Rust), pytest (engine) |
| Integration tests | Every API route and tool: signed out, wrong workspace, bad input, happy path | Vitest against the route handlers |
| Workspace isolation | Every route, tool, file link and MCP call with another workspace's ids must fail closed | A shared test suite run on every route |
| End-to-end | The core flows in a real browser and the real app | Playwright; the app-open tests on Windows, macOS, Linux |
| Agent evals | Saved real tasks per agent: correct, on-brand, never beyond its dial, immune to injected instructions | An eval runner in CI |

- **Every bug fix starts with a test that fails** without the fix (see `desktop/src/bridge/fetch.test.ts`, which fails if
  the 0.1.1 Windows fix is removed).
- **Prove a test can fail:** break the code on purpose once and watch the test go red before trusting it.
- Logic in `lib/` aims for 80%+ coverage; what matters is that every acceptance criterion and pre-mortem item has a
  test.

## 4. Audit your own work before asking for review

1. Read the whole diff as a stranger: is every name clear, every branch needed, every error handled?
2. Run the review tools: `/code-review` on the diff, `/security-review` for anything touching sign-in, data, files,
   payments, MCP or agents, `/simplify` for clean-ups.
3. Run everything: `npm run check`, `npm test`, the builds, the Rust self-check, the screens at full width and 390 px.
   Look at the real app, not just the tests.
4. Fix what you find, then write in the PR what you checked and what you could not.

## 5. Debugging

- **Reproduce first**, on the same system as the report (CI runners exist for Windows, macOS, Linux). No fix before a
  reproduction or a clear explanation of why one is impossible.
- **Find the root cause**, not the symptom. Ask "why" until the answer is in our code or a known outside limit.
- **Measure, don't guess:** logs, the debugger port (`CREAVIA_WEBVIEW_DEBUG_PORT`), memory and timing numbers.
- Logs are structured (what, which workspace, which request id), never contain secrets, and are kept short.

## 6. Precautions that run on every change

- CI blocks the merge on: typecheck, unit tests, builds, the tool-registry check, isolation tests, the Rust self-check
  and, for releases, the install and app-open tests on Windows, macOS and Linux.
- Database changes are new `cloud/db/NNN_*.sql` files, idempotent, tried on a copy first; never edit a shipped one.
- Unfinished features ship behind a flag and reach testers first.
- Dependencies are pinned by the lockfile and updated on purpose, one at a time, with their changelog read.
- Rate limits, budgets and the kill switch cover every agent and outside AI.
- Backups daily, with a restore drill.

## 7. Learn

- Every bug that reached `main` or a release gets an entry in `docs/LESSONS.md`: what happened, why, the test that now
  catches it, and the rule that changed. Read it before working in the same area.
- The owner's feedback goes in `docs/FEEDBACK.md` with the change.
- After each phase: a short retro in `docs/LESSONS.md` (what went well, what to change).

## Definition of done (every feature)

- [ ] Meets its spec's acceptance criteria; pre-mortem items each have a test or guard
- [ ] Code reads plainly; every file says what it is for; no `any`, no swallowed errors
- [ ] Unit, integration and isolation tests pass; a fixed bug has its failing-first test
- [ ] Audited: diff read, review tools run, findings fixed
- [ ] Checked in the real app at full width and 390 px (and on the three systems for desktop changes)
- [ ] Its actions are registry tools with permission levels
- [ ] Docs, the in-app guide, `docs/town` status, and `docs/FEEDBACK.md` / `docs/LESSONS.md` updated
