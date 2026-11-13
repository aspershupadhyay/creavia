import { useCallback, useEffect, useRef, useState } from "react";

/** Load something now and every `every` ms while the window is visible. */
export function usePoll<T>(load: () => Promise<T>, every = 4000, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);
  const run = useCallback(() => load().then((d) => { if (live.current) { setData(d); setError(null); } }, (e) => live.current && setError(String((e as Error)?.message ?? e))), deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    live.current = true;
    run();
    const t = setInterval(() => { if (document.visibilityState === "visible") run(); }, every);
    return () => { live.current = false; clearInterval(t); };
  }, [run, every]);
  return { data, error, reload: run, setData };
}

export const gb = (bytes: number) => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 1)} GB` : bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB` : `${Math.max(0, Math.round(bytes / 1e3))} KB`;
export const eta = (left: number, rate: number) => {
  if (!rate || !isFinite(left / rate)) return "";
  const s = left / rate;
  return s > 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m left` : s > 60 ? `${Math.round(s / 60)} min left` : `${Math.max(1, Math.round(s))} s left`;
};

export async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
