<p align="center"><img src="brand/wordmark.svg" width="360" alt="Creavia"></p>

<p align="center"><b>Create, publish and grow.</b> Voiceovers in your own voice, clean-up, subtitles, images, posts,
publishing and analytics, on your computer or your own cloud.</p>

---

Creavia is a creator studio in three parts:

| Part | What it is | Where it runs |
|---|---|---|
| **Desktop** (`desktop/`) | The app: a Tauri 2 window with a Rust core. Every studio screen, plus *This computer*: models, the engine, the MCP, deploying a cloud | macOS, Windows, Linux |
| **Cloud** (`cloud/`) | Your studio online: posts, calendar, files, voices, publishing to YouTube and Instagram, analytics, Auto-DM, the hosted MCP, the automation suite | Your Cloudflare account (Workers + R2), Postgres on Neon |
| **Engine** (`engine/`) | The AI: voices (Kokoro, Chatterbox, Qwen3-TTS, Orpheus, CosyVoice, your own trained voice), Whisper, clean-up, images, video | This computer, or a cloud GPU (Colab, Kaggle, Modal, Cerebrium) |

```
 Creavia app (Tauri) ──Rust: session in the keychain, every request──▶ Your Creavia Cloud (Cloudflare Worker)
   │  ├─ Models: downloaded on demand, never bundled                      │   ▲
   │  ├─ Engine: engine/gateway.py on this computer ◀─ lend this GPU ──────┘   │ heartbeat
   │  └─ MCP: 127.0.0.1:7377/mcp ── local tools + the cloud's, forwarded       │
   └────────────────────────────────────────────────────────────── Colab / Kaggle / Modal GPU
 Claude, ChatGPT, Gemini ──OAuth──▶ <your studio>/api/mcp (hosted MCP)
```

## Start

**Use the app:** download Creavia from [Releases](https://github.com/aspershupadhyay/creavia/releases), open it, and Vee
(the little one with the spark) walks you through it: run the AI on this computer, connect a studio, or both.

**Your own cloud, one click:**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/aspershupadhyay/creavia/tree/main/cloud)

or from a terminal:

```bash
git clone https://github.com/aspershupadhyay/creavia && cd creavia && npm install
```

```bash
npm run cloud:deploy
```

[docs/DEPLOY.md](docs/DEPLOY.md) covers both, and the optional extras (R2 keys, YouTube, Instagram, cloud GPUs).

## Models are never shipped

Like ComfyUI, Creavia ships no model weights. The Models page lists what each model does, its size, the GPU it needs
against yours, and its licence; you download the ones you want, straight from their makers, into a folder you choose.
The engine finds them there. [docs/MODELS.md](docs/MODELS.md).

## MCP, local or hosted

- **On this computer:** `http://127.0.0.1:7377/mcp` with a token. The engine's tools, plus every tool of your studio
  when the app is connected. Copy-paste settings for Claude Code, Claude Desktop, Cursor, VS Code and Gemini CLI are on
  the app's MCP page.
- **Hosted:** `https://<your studio>/api/mcp`, OAuth, for claude.ai, ChatGPT and phones.

[docs/MCP.md](docs/MCP.md).

## Develop

```bash
npm install
```

```bash
npm run desktop
```

`npm run desktop` starts the app with hot reload (Rust and the screens). The cloud alone: `npm run cloud:dev`.
Checks: `npm run check`, and `desktop/src-tauri/target/debug/creavia --self-check=full` tests the Rust side end to end
(downloads Kokoro, sets up and starts the engine, voices a line through the MCP).

The plan and what's next: [docs/PLAN.md](docs/PLAN.md). Design: [docs/DESIGN.md](docs/DESIGN.md).
