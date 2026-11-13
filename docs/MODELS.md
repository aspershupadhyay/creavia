# Models

Creavia ships **no model weights**. The app's Models page lists what it can run (from
`desktop/src-tauri/models.json`) and downloads the ones you pick, straight from their makers.

| | |
|---|---|
| Where they go | `<models folder>/hf/<engine>/hub/models--<org>--<name>/snapshots/<commit>/…`, Hugging Face's own cache layout, which is exactly where `engine/gateway.py` looks (`HF_HOME` per engine). Kokoro's two files go in `hf/kokoro/`. |
| Models folder | Settings in the app (Models → Storage). Default: the app's data folder. Video models are 20–85 GB each. |
| Resuming | Each file downloads to `.part` and resumes by byte range; four files at a time; retries with backoff. |
| Finished | `<engine folder>/.creavia/<id>.done`. A model is "partly downloaded" until then. |
| No account | Like ComfyUI, downloads need no account or token: every model in the catalogue is public (ungated). A busy Hugging Face (429) is waited out, not turned into a question. |
| Checked | Every big file is compared with the SHA-256 its maker published (Hugging Face's LFS record) and fetched once more if it doesn't match. |
| Token (optional) | Models → Advanced. Only if Hugging Face rate-limits you or a maker later gates a model. Kept in the keychain. |
| Licences | Each card says whether commercial use is allowed. Qwen-Image is non-commercial. Read the licence before you publish. |
| GPU fit | Compared with your GPU's memory. Everything but Kokoro needs an NVIDIA GPU today (Apple Silicon is on the plan). |

## Adding a model

1. The engine must support it: `engine/config.py` (`ENGINES`) and an `engine/engines/<name>.py`.
2. Add an entry to `desktop/src-tauri/models.json`: `id`, `engine` (the engine folder it fills), `sources` (Hugging
   Face repos as `{ "hf": "org/name" }`, or `{ "url": …, "to": "file" }`), `disk_gb`, `vram_gb`, `needs`
   (`any` or `nvidia`), `license`, `commercial`. **Only ungated repos**: if the maker's repo asks people to accept
   terms, use a public mirror of the same weights (as Orpheus uses `unsloth/orpheus-3b-0.1-ft`), so nobody needs a token.
3. `creavia --self-check` checks the catalogue parses.
