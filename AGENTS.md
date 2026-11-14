# Instructions for AI coding agents

This file is for any AI coding agent (Codex, Gemini CLI, Antigravity, Cursor, Claude Code and others). The full rules
are in [CLAUDE.md](CLAUDE.md); follow them exactly, whichever agent you are.

In short:

1. **Start with the plan:** `docs/town/README.md` (the creator town, the crew of agents, phases, stages) and its
   "Where we are". Continue the first unticked item of the current phase; tick items as they land.
2. **Build to `docs/ENGINEERING.md`** (tests, self-audit, readable code) and read `docs/LESSONS.md`.
3. **Read `docs/FEEDBACK.md`** (the owner's feedback, newest first; it wins) and `docs/DESIGN.md` before any screen.
4. **Work only in this repo.** aspershupadhyay/voicebox-gpu (the live VoiceBox) is a read-only reference.
5. **Never commit secrets or model weights.** Secrets stay in Rust (the keychain) or on the Worker.
6. **Checks before pushing** and **shipping** as CLAUDE.md lists them.

Note: "agents" in `docs/town/agents.md` means Creavia's in-app crew (Vee, Juno, Bolt…), not you.
