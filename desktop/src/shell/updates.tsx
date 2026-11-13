// Updates without reinstalling. On launch (after a short wait) and every four hours the app asks for a newer signed
// release; if there is one, a small card offers it. "Update" downloads it, installs it and restarts in seconds.
// Models, settings and the sign-in live outside the app, so they're all still there afterwards.
import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { ArrowsClockwise, Sparkle, X } from "@phosphor-icons/react";
import { appVersion, inTauri, updateCheck, updateInstall, type UpdateInfo } from "../bridge/native";
import { gb } from "./hooks";
import { toast } from "./toast";

type State =
  | { phase: "idle"; checked: number | null; error?: string }
  | { phase: "checking" }
  | { phase: "ready"; info: UpdateInfo; later?: boolean }
  | { phase: "installing"; info: UpdateInfo; done: number; total: number | null; applying?: boolean };

let state: State = { phase: "idle", checked: null };
let version = "";
const subs = new Set<() => void>();
const set = (s: State) => { state = s; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useUpdate = () => useSyncExternalStore(subscribe, () => state);
export const useAppVersion = () => useSyncExternalStore(subscribe, () => version);

/** Ask for a newer version. `loud` tells the person the answer even when there's nothing new. */
export async function checkForUpdate(loud = false) {
  if (!inTauri() || state.phase === "checking" || state.phase === "installing") return;
  set({ phase: "checking" });
  try {
    const info = await updateCheck();
    if (info) set({ phase: "ready", info });
    else { set({ phase: "idle", checked: Date.now() }); if (loud) toast(`You have the newest Creavia (${version})`, { tone: "ok" }); }
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    set({ phase: "idle", checked: Date.now(), error: loud ? msg : undefined }); // quiet checks stay quiet (no release yet, offline)
    if (loud) toast(`Couldn't check for updates: ${msg}`, { tone: "bad" });
  }
}

export async function installUpdate() {
  if (state.phase !== "ready") return;
  const info = state.info;
  set({ phase: "installing", info, done: 0, total: null });
  try {
    await updateInstall((e) => {
      if (state.phase !== "installing") return;
      if (e.kind === "started") set({ ...state, total: e.total });
      else if (e.kind === "chunk") set({ ...state, done: e.done });
      else set({ ...state, applying: true });
    });
  } catch (e) {
    set({ phase: "ready", info });
    toast(`The update didn't install: ${String((e as Error)?.message ?? e)}`, { tone: "bad" });
  }
}

/** Starts the checks; mount once. */
export function useUpdateChecks() {
  useEffect(() => {
    if (!inTauri()) return;
    appVersion().then((v) => { version = v; subs.forEach((f) => f()); }).catch(() => null);
    const first = setTimeout(() => checkForUpdate(), 8000);
    const every = setInterval(() => checkForUpdate(), 4 * 60 * 60 * 1000);
    return () => { clearTimeout(first); clearInterval(every); };
  }, []);
}

/** The little card in the corner when a new version is ready. */
export function UpdateCard() {
  const s = useUpdate();
  const first = useLocation().pathname.startsWith("/welcome"); // not over the first-run setup: it waits until after
  if (first && s.phase !== "installing") return null;
  if (s.phase === "ready" && !s.later) {
    return (
      <aside className="cr-update" role="status" aria-live="polite">
        <span className="cr-update-ic"><Sparkle size={18} weight="fill" /></span>
        <div className="cr-update-t">
          <b>Creavia {s.info.version} is ready</b>
          <span>Installs in seconds. Your models and settings stay.</span>
        </div>
        <button className="sm cr-cta" onClick={installUpdate}><ArrowsClockwise size={14} weight="bold" /> Update</button>
        <button className="quiet xs" aria-label="Later" onClick={() => set({ ...s, later: true })}><X size={14} /></button>
      </aside>
    );
  }
  if (s.phase === "installing") {
    const pct = s.total ? Math.min(100, (s.done / s.total) * 100) : 0;
    return (
      <aside className="cr-update" role="status" aria-live="polite">
        <span className="cr-update-ic spin"><ArrowsClockwise size={18} weight="bold" /></span>
        <div className="cr-update-t">
          <b>{s.applying ? "Installing… Creavia restarts by itself" : `Getting Creavia ${s.info.version}`}</b>
          <div className="cr-bar" role="progressbar" aria-label="Update download" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${s.applying ? 100 : Math.max(3, pct)}%` }} /></div>
          <span className="mono">{s.total ? `${gb(s.done)} of ${gb(s.total)}` : s.done ? gb(s.done) : "Starting…"}</span>
        </div>
      </aside>
    );
  }
  return null;
}
