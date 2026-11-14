# The owner's feedback

Every piece of design and product feedback, newest first. It wins over older rules. Add new feedback here in the same
pull request as the change. (VoiceBox's own feedback history lives in aspershupadhyay/voicebox-gpu docs/FEEDBACK.md;
its design rules carried over in DESIGN.md.)

## 2026-11-14: build every feature to an elite standard

- **Robust and elite, every feature:** bring suggestions and creativity, audit your own work and learn from it, debug
  properly, unit tests for each feature, and every precaution against bugs. Human-readable code and project, best
  practices throughout. Saved as `docs/ENGINEERING.md` (the standard), `docs/LESSONS.md` (bugs we learned from) and the
  PR template, and CLAUDE.md / AGENTS.md point every session to them.

## 2026-11-14: a new UI, a company of agents, any AI key

- **Not a single piece of VoiceBox's UI.** Every screen of Creavia is designed from scratch: modern, perfectly
  crafted, easy for anyone, no clutter. VoiceBox's back end (APIs, engine, publishing) may be reused behind new screens;
  its components, layouts and styles may not.
- **Agents work like employees in a company:** you assign a task to a crew member (or to Vee), it has a brief, a due
  date and a status, they report back, hand off to each other, and show their work.
- **BYOK like opencode:** anyone brings any provider's key (or a local model), picks the provider and model, and it
  works at once. Per agent, if they want.

## 2026-11-14: the creator town

- **Creavia is a creator town:** one app that replaces most of a creator's tools (voice, design, calendar, DMs like
  ManyChat, analytics, deals, invoices, link in bio), with a free option. Plan it like a product company (specs, UX
  with no AI slop, tech stack, every stage to production), not biased by VoiceBox's current UI.
- **Plain names like the Claude app** (Home, Ask Vee, Ideas, Create, Calendar, Inbox, Analytics, Money, Files,
  Settings).
- **Connectors like Claude's marketplace**, and every tool open to any AI (Claude, ChatGPT, Gemini, Antigravity, BYOK).
- **Each house has its own agent with a cool name and a character** (Juno, Bolt, Tempo, Echo, Lens, Penny, Atlas, led
  by Vee), robust at its job; character art drafted with Nano Banana Pro.
- **The plan lives in the repo** (`docs/town/`, a file per phase and stage) and CLAUDE.md / AGENTS.md point to it, so
  any new session picks it up.

## 2026-11-14: Windows didn't open (0.1.2)

- **"In Windows the app didn't even open"** ("This page is having a problem · Out of Memory"). The bridge sent Tauri's
  own `http://ipc.localhost` calls through Rust, forever. Fixed in 0.1.2, and every Windows release is now opened for
  real in CI (the page must show something and stay small), not only `--self-check`, which never opens a window.
- **Asked how signing in to a cloud gives the exact VoiceBox studio:** the app carries the studio's own screens
  (`cloud/components`, grown out of VoiceBox) and talks to whatever studio address you sign in to. Signing in to
  voiceboxstudio.pages.dev shows that studio's data in those screens.

## 2026-11-13: README, no paid certificates

- **No Apple or Microsoft developer accounts for now.** Say so in the README, and show calmly, per system, what to do
  the first time (macOS: Open Anyway or the quarantine command; Windows: Run anyway; Linux: chmod, FUSE, apt/dnf).
- **A real diagram, not ASCII art**, and a neat, calm, pretty README.

## 2026-11-13: Creavia, release 0.1

- **Updates without reinstalling.** A new release reaches installed apps by itself: one click, it restarts.
- **A guide in the app that a child can follow**: pictures, animation, clear navigation, reachable before signing in
  and after. How to use the app, and how to host it online, step by step.
- **A premium onboarding**, not a two-step form.
- **Model downloads just work, like ComfyUI:** never ask for a Hugging Face account or token.

## 2026-11-13: Creavia

- **The name is Creavia**, not VoiceBox: the product is more than voices (create, publish, grow).
- **A native app for other people too:** Tauri and Rust, elite performance, every tab crafted, modern UI.
- **Never ship models in the app.** Users download the ones they want, like ComfyUI.
- **All of VoiceBox's functionality comes along.** MCP either local or hosted (if they host a cloud).
- **One-click deployment** to Cloudflare and hosting: the setup must be easy.
- **The logo:** creative cutemorphism, a character like Grok's bot, Dot or Claude's mascot. **No "AI slop" colours**
  (no purple/blue AI gradients). Hence Vee, flat, marigold on matte black.
