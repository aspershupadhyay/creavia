// Toasts from anywhere (the bridge, Rust events), drawn bottom-right. The studio's own screens keep their Dialog toasts.
import { useEffect, useState } from "react";

type Toast = { id: number; text: string; tone?: "bad" | "ok"; action?: string; run?: () => void };
let items: Toast[] = [];
let seq = 0;
const subs = new Set<(t: Toast[]) => void>();
const emit = () => subs.forEach((f) => f(items));

export function toast(text: string, o: { tone?: "bad" | "ok"; action?: string; run?: () => void } = {}) {
  const t = { id: ++seq, text, ...o };
  items = [...items.slice(-3), t];
  emit();
  setTimeout(() => { items = items.filter((x) => x.id !== t.id); emit(); }, o.action ? 8000 : 4200);
}

export function Toaster() {
  const [list, setList] = useState<Toast[]>(items);
  useEffect(() => { subs.add(setList); return () => { subs.delete(setList); }; }, []);
  return (
    <div className="cr-toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`cr-toast ${t.tone ?? ""}`}>
          <span>{t.text}</span>
          {t.action && <button className="xs ghost" onClick={() => { t.run?.(); items = items.filter((x) => x.id !== t.id); emit(); }}>{t.action}</button>}
        </div>
      ))}
    </div>
  );
}
