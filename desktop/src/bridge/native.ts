// The desktop's native side (src-tauri): typed calls into Rust. Outside Tauri (a plain browser, for previews) every
// call fails softly, so the screens still render.
import { Channel, invoke } from "@tauri-apps/api/core";

export const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inTauri()) throw new Error("Creavia's native side isn't available in a browser preview");
  return invoke<T>(cmd, args);
}

export function channel<T>(on: (m: T) => void) {
  const c = new Channel<T>();
  c.onmessage = on;
  return c;
}

export async function openExternal(url: string) {
  if (!inTauri()) { window.open(url, "_blank", "noopener"); return; }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export async function revealPath(path: string) {
  if (!inTauri()) return;
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

// ── the studio connection ────────────────────────────────────────────────────────────────────────────────────────
export type Connection = { mode: "none" | "cloud"; url: string | null; how: "password" | "token" | null; who: string | null };
export const connection = () => call<Connection>("cloud_get");
export const signIn = (url: string, email: string, password: string, name?: string) => call<Connection>("cloud_login", { url, email, password, name: name ?? null });
export const useToken = (url: string, token: string) => call<Connection>("cloud_use_token", { url, token });
export const signOutCloud = () => call<Connection>("cloud_logout");

// ── this computer ─────────────────────────────────────────────────────────────────────────────────────────────────
export type Gpu = { name: string; vram_gb: number; vendor: string };
export type SystemInfo = {
  os: string; arch: string; cpu: string; cores: number; ram_gb: number; gpus: Gpu[];
  data_dir: string; models_dir: string; disk_free_gb: number; uv: string | null; python: string | null; version: string;
};
export const systemInfo = () => call<SystemInfo>("system_info");

// ── models (downloaded on demand, never shipped) ───────────────────────────────────────────────────────────────────
export type ModelEntry = {
  id: string; name: string; maker: string; kind: "tts" | "asr" | "enhance" | "image" | "video" | "animate";
  about: string; license: string; commercial: boolean; repos: string[]; disk_gb: number; vram_gb: number;
  languages?: string; tags: string[]; engine: string; needs: "any" | "nvidia";
};
export type ModelState = { id: string; installed: boolean; bytes: number; complete: boolean; path: string; downloading: boolean };
export type DownloadEvent =
  | { kind: "plan"; files: number; bytes: number }
  | { kind: "progress"; done: number; total: number; file: string; rate: number }
  | { kind: "done" } | { kind: "error"; message: string } | { kind: "cancelled" };
export const modelsCatalog = () => call<ModelEntry[]>("models_catalog");
export const modelsState = () => call<ModelState[]>("models_state");
export const downloadModel = (id: string, on: (e: DownloadEvent) => void) => call<void>("model_download", { id, onEvent: channel(on) });
export const cancelDownload = (id: string) => call<void>("model_cancel", { id });
export const deleteModel = (id: string) => call<void>("model_delete", { id });

// ── the engine on this computer ───────────────────────────────────────────────────────────────────────────────────
export type EngineStatus = { installed: boolean; running: boolean; healthy: boolean; port: number; linked: boolean;
  tunnel: string | null; pid: number | null; engine_dir: string | null; last_error: string | null };
export const engineStatus = () => call<EngineStatus>("engine_status");
export const engineInstall = (on: (line: string) => void) => call<void>("engine_install", { onLog: channel(on) });
export const engineStart = (linkCloud: boolean, workerSecret?: string) => call<EngineStatus>("engine_start", { linkCloud, workerSecret: workerSecret ?? null });
export const engineStop = () => call<EngineStatus>("engine_stop");
export const engineLogs = () => call<string[]>("engine_logs");

// ── MCP ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export type McpStatus = { running: boolean; port: number; url: string; token: string; tools: number;
  hosted_url: string | null };
export const mcpStatus = () => call<McpStatus>("mcp_status");
export const mcpStart = (port?: number) => call<McpStatus>("mcp_start", { port: port ?? null });
export const mcpStop = () => call<McpStatus>("mcp_stop");
export const mcpRotate = () => call<McpStatus>("mcp_rotate");

// ── settings kept by the app ──────────────────────────────────────────────────────────────────────────────────────
export type AppSettings = { hf_token_set: boolean; models_dir: string; mcp_autostart: boolean; engine_autostart: boolean;
  onboarded: boolean; launch_at_login: boolean };
export const appSettings = () => call<AppSettings>("settings_get");
export const saveSettings = (patch: Partial<AppSettings> & { hf_token?: string }) => call<AppSettings>("settings_set", { patch });
