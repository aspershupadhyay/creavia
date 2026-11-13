// Model downloads, followed app-wide: start one anywhere (Welcome, Models, the tray) and every page sees its progress.
import { useEffect, useState } from "react";
import { cancelDownload, downloadModel, type DownloadEvent } from "../bridge/native";
import { toast } from "./toast";

export type Live = { id: string; name: string; done: number; total: number; rate: number; state: "starting" | "running" | "done" | "error" | "cancelled"; error?: string };
let live: Record<string, Live> = {};
const subs = new Set<(l: Record<string, Live>) => void>();
const set = (id: string, patch: Partial<Live>) => { live = { ...live, [id]: { ...live[id], ...patch } as Live }; subs.forEach((f) => f(live)); };

export function startDownload(id: string, name: string, onDone?: () => void) {
  if (live[id] && ["starting", "running"].includes(live[id].state)) return;
  set(id, { id, name, done: 0, total: 0, rate: 0, state: "starting", error: undefined });
  downloadModel(id, (e: DownloadEvent) => {
    if (e.kind === "plan") set(id, { total: e.bytes, state: "running" });
    else if (e.kind === "progress") set(id, { done: e.done, total: e.total, rate: e.rate, state: "running" });
    else if (e.kind === "done") { set(id, { state: "done", done: live[id].total }); toast(`${name} is ready`, { tone: "ok" }); onDone?.(); }
    else if (e.kind === "cancelled") set(id, { state: "cancelled" });
    else if (e.kind === "error") set(id, { state: "error", error: e.message });
  }).catch((err) => { if (live[id]?.state !== "error") set(id, { state: "error", error: String((err as Error)?.message ?? err) }); });
}

export const stopDownload = (id: string) => cancelDownload(id);

export function useDownloads() {
  const [l, setL] = useState(live);
  useEffect(() => { subs.add(setL); return () => { subs.delete(setL); }; }, []);
  return l;
}
