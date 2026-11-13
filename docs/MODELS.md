# Models

Creavia ships **no model weights**. The app's Models page lists what it can run (from
`desktop/src-tauri/models.json`) and downloads the ones you pick, straight from their makers.

| | |
|---|---|
| Where they go | `<models folder>/hf/<engine>/hub/models--<org>--<name>/snapshots/<commit>/…`, Hugging Face's own cache layout, which is exactly where `engine/gateway.py` looks (`HF_HOME` per engine). Kokoro's two files go in `hf/kokoro/`. |
| Models folder | Settings in the app (Models → Storage). Default: the app's data folder. Video models are 20–85 GB each. |
| Resuming | Each file downloads to `.part` and resumes by byte range; four files at a time; retries with backoff. |
| Finished | `<engine folder>/.creavia/<id>.done`. A model is "partly downloaded" until then. |
| Gated models | Add a Hugging Face token (kept in the keychain) and accept the model's terms on huggingface.co. |
| Licences | Each card says whether commercial use is allowed. Qwen-Image is non-commercial. Read the licence before you publish. |
| GPU fit | Compared with your GPU's memory. Everything but Kokoro needs an NVIDIA GPU today (Apple Silicon is on the plan). |

## Adding a model

1. The engine must support it: `engine/config.py` (`ENGINES`) and an `engine/engines/<name>.py`.
2. Add an entry to `desktop/src-tauri/models.json`: `id`, `engine` (the engine folder it fills), `sources` (Hugging
   Face repos as `{ "hf": "org/name" }`, or `{ "url": …, "to": "file" }`), `disk_gb`, `vram_gb`, `needs`
   (`any` or `nvidia`), `license`, `commercial`.
3. `creavia --self-check` checks the catalogue parses.
