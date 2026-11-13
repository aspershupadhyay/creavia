# MCP

Two ways for an AI app to use Creavia. Use either or both.

## On this computer

`http://127.0.0.1:7377/mcp` (Streamable HTTP, JSON answers). Turn it on in the app (MCP page); it starts with Creavia
from then on.

- **Auth:** `Authorization: Bearer <token>` (or `?key=`). The token is in the app; *New* replaces it.
- **Safety:** bound to 127.0.0.1 only; a request with a foreign `Origin` is refused, so a web page can't drive it.
- **Tools on this computer** (`local_*`): `local_status`, `local_models`, `local_voices`, `local_voice`, `local_job`
  (any engine job: transcribe, clean, revoice, image, video…, see API.md), `local_get_job` (waits up to 45 s; gives
  the folder with the files), `local_cancel_job`. They need the engine running (Engine page).
- **Your studio's tools:** when the app is connected to a Creavia Cloud, every hosted tool is listed too and forwarded
  to `<studio>/api/mcp` with a model key the app makes for itself ("Creavia desktop", revocable in the studio's
  Settings → Automation).

Settings for each client are on the app's MCP page (Claude Code, Claude Desktop via `mcp-remote`, Cursor, VS Code,
Gemini CLI). Code: `desktop/src-tauri/src/mcp.rs`.

## Hosted, in your studio

`https://<your studio>/api/mcp`: OAuth (each person signs in with their studio account), model keys (`vbmk_`), or the
studio's `MCP_TOKEN`. Works from claude.ai (Settings → Connectors → Add custom connector), ChatGPT and phones. The
adaptive endpoint, toolsets and the automation suite are described in AUTOMATION.md.
