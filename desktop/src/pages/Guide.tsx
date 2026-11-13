// The guide: how to use Creavia and put a studio online, for anyone. Open before signing in (Welcome, Connect) and
// after (the sidebar). Chapters on the left, one picture and a few numbered steps each, buttons that do the step,
// arrow keys to move, and a tick for every chapter read (kept on this computer).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowSquareOut, BookOpenText, Check, Copy, Info, Key, MagnifyingGlass, Terminal, Warning, X } from "@phosphor-icons/react";
import { Logo } from "@/components/art";
import { inTauri, openExternal } from "../bridge/native";
import { Art } from "../guide/art";
import { CHAPTERS, PARTS, type Action, type Chapter, type Mock, type Step } from "../guide/content";
import { useConn } from "../shell/conn";
import { copy } from "../shell/hooks";
import { checkForUpdate } from "../shell/updates";
import { toast } from "../shell/toast";

const READ_KEY = "creavia.guide.read";
const loadRead = (): string[] => { try { return JSON.parse(localStorage.getItem(READ_KEY) ?? "[]"); } catch { return []; } };
const saveRead = (ids: string[]) => { try { localStorage.setItem(READ_KEY, JSON.stringify(ids)); } catch { /* private mode */ } };

/** **bold**, `code` and "• " bullet lines, kept in the order they're written. */
function Rich({ text }: { text: string }) {
  const inline = (str: string, k: number) => str.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith("**") ? <b key={`${k}-${i}`}>{p.slice(2, -2)}</b> : p.startsWith("`") ? <code key={`${k}-${i}`}>{p.slice(1, -1)}</code> : p);
  const blocks: (string | string[])[] = [];
  for (const l of text.split("\n")) {
    if (l.startsWith("• ")) { const last = blocks[blocks.length - 1]; if (Array.isArray(last)) last.push(l.slice(2)); else blocks.push([l.slice(2)]); }
    else blocks.push(l);
  }
  return <>{blocks.map((b, i) => Array.isArray(b) ? <ul key={i}>{b.map((l, j) => <li key={j}>{inline(l, i * 100 + j)}</li>)}</ul> : <p key={i}>{inline(b, i * 100)}</p>)}</>;
}

function CopyLine({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="gd-code">
      <span className="mono">{text}</span>
      <button className="xs ghost" aria-label="Copy" onClick={async () => { if (await copy(text)) { setOk(true); setTimeout(() => setOk(false), 1400); } }}>{ok ? <Check size={13} /> : <Copy size={13} />}{ok ? "Copied" : "Copy"}</button>
    </div>
  );
}

function MockWin({ m }: { m: Mock }) {
  return (
    <div className="gd-mock" aria-label={`Example: ${m.title}`}>
      <div className="gd-mock-bar"><i /><i /><i /><span>{m.title}</span></div>
      <div className="gd-mock-body">
        {m.rows.map((r) => (
          <div key={r.k} className={`gd-mock-row ${r.hi ? "hi" : ""}`}><span>{r.k}</span><b className="mono">{r.v}</b></div>
        ))}
        {m.button && <div className="gd-mock-btn"><span>{m.button}</span></div>}
      </div>
    </div>
  );
}

const secret = () => { const b = new Uint8Array(24); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };

function Secrets() {
  const [keys, setKeys] = useState<{ MCP_TOKEN: string; WORKER_SECRET: string } | null>(null);
  return (
    <div className="gd-secrets">
      {!keys ? (
        <button className="cr-cta" onClick={() => setKeys({ MCP_TOKEN: secret(), WORKER_SECRET: secret() })}><Key size={15} weight="duotone" /> Make my two keys</button>
      ) : (
        <>
          {(["MCP_TOKEN", "WORKER_SECRET"] as const).map((k) => (
            <div key={k} className="gd-secret"><span className="gd-secret-k">{k}</span><CopyLine text={keys[k]} /></div>
          ))}
          <p className="gd-fine">Made on this computer and never sent anywhere. Copy both now: they disappear when you leave this page.</p>
        </>
      )}
    </div>
  );
}

function ActionBtn({ a, primary }: { a: Action; primary: boolean }) {
  const nav = useNavigate();
  const { conn } = useConn();
  const cls = primary ? "sm cr-cta" : "sm ghost";
  if ("to" in a) {
    const locked = a.cloud && conn?.mode !== "cloud";
    return <button className={cls} onClick={() => nav(locked ? "/login" : a.to)} title={locked ? "Connect a studio first" : undefined}>{locked ? "Connect a studio first" : a.label} <ArrowRight size={14} weight="bold" /></button>;
  }
  if ("href" in a) return <button className={cls} onClick={() => (inTauri() ? openExternal(a.href) : window.open(a.href, "_blank", "noopener"))}>{a.label} <ArrowSquareOut size={14} /></button>;
  if ("copy" in a) return <button className={cls} onClick={async () => { if (await copy(a.copy)) toast("Copied", { tone: "ok" }); }}><Copy size={14} /> {a.label}</button>;
  return <button className={cls} onClick={() => (inTauri() ? checkForUpdate(true) : toast("Open the Creavia app to update"))}>{a.label}</button>;
}

function StepCard({ s, n }: { s: Step; n: number }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) { el?.classList.add("in"); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add("in"); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <li className="gd-step" ref={ref}>
      <span className="gd-num" aria-hidden>{n}</span>
      <div className="gd-step-body">
        <h3>{s.title}</h3>
        <Rich text={s.text} />
        {s.pic && <div className="gd-pic"><Art scene={s.pic} /></div>}
        {s.mock && <MockWin m={s.mock} />}
        {s.code && <div className="gd-codes"><span className="gd-codes-h"><Terminal size={13} /> Terminal</span>{s.code.map((c) => <CopyLine key={c} text={c} />)}</div>}
        {s.secrets && <Secrets />}
        {s.tip && <div className="gd-note tip"><span className="gd-note-ic" aria-hidden><Info size={15} weight="bold" /></span><div><b>Vee’s tip</b><Rich text={s.tip} /></div></div>}
        {s.warn && <div className="gd-note warn"><span className="gd-note-ic" aria-hidden><Warning size={15} weight="bold" /></span><div><b>Good to know</b><Rich text={s.warn} /></div></div>}
        {s.do && <div className="gd-do">{s.do.map((a, i) => <ActionBtn key={a.label} a={a} primary={i === 0} />)}</div>}
      </div>
    </li>
  );
}

function Search({ onPick }: { onPick: (c: Chapter, step?: number) => void }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const out: { c: Chapter; i?: number; title: string }[] = [];
    for (const c of CHAPTERS) {
      if (`${c.title} ${c.intro}`.toLowerCase().includes(t)) out.push({ c, title: c.title });
      c.steps.forEach((s, i) => { if (`${s.title} ${s.text} ${s.tip ?? ""}`.toLowerCase().includes(t)) out.push({ c, i, title: s.title }); });
    }
    return out.slice(0, 8);
  }, [q]);
  return (
    <div className="gd-search">
      <label><MagnifyingGlass size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the guide" aria-label="Search the guide" onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} />{q && <button className="quiet xs" aria-label="Clear" onClick={() => setQ("")}><X size={13} /></button>}</label>
      {q.trim().length >= 2 && (
        <div className="gd-hits" role="listbox">
          {hits.map((h, k) => (
            <button key={k} role="option" aria-selected={false} onClick={() => { onPick(h.c, h.i); setQ(""); }}>
              <b>{h.title}</b><span>{h.c.title}</span>
            </button>
          ))}
          {!hits.length && <div className="gd-nohit">Nothing found. Try “install”, “model” or “Cloudflare”.</div>}
        </div>
      )}
    </div>
  );
}

export default function Guide() {
  const { chapter } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const { settings, conn } = useConn();
  const idx = Math.max(0, CHAPTERS.findIndex((c) => c.id === chapter));
  const c = CHAPTERS[idx];
  const [read, setRead] = useState<string[]>(loadRead);
  const main = useRef<HTMLDivElement>(null);
  const back = (loc.state as { from?: string } | null)?.from ?? (!settings?.onboarded ? "/welcome" : conn?.mode === "cloud" ? "/home" : "/local");
  const go = (i: number, step?: number) => {
    const to = CHAPTERS[Math.min(CHAPTERS.length - 1, Math.max(0, i))];
    nav(`/guide/${to.id}`, { replace: true, state: loc.state });
    requestAnimationFrame(() => {
      if (step == null) main.current?.scrollTo({ top: 0, behavior: "smooth" });
      else main.current?.querySelectorAll(".gd-step")[step]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };
  useEffect(() => {
    const t = setTimeout(() => setRead((r) => { if (r.includes(c.id)) return r; const n = [...r, c.id]; saveRead(n); return n; }), 2500);
    return () => clearTimeout(t);
  }, [c.id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea")) return;
      if (e.key === "ArrowRight") go(idx + 1);
      if (e.key === "ArrowLeft") go(idx - 1);
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  });
  const pct = Math.round((read.length / CHAPTERS.length) * 100);
  const next = CHAPTERS[idx + 1];
  const prev = CHAPTERS[idx - 1];

  const rail: ReactNode = PARTS.map((p) => (
    <div key={p} className="gd-part">
      <div className="gd-part-h">{p}</div>
      {CHAPTERS.map((x, i) => x.part === p && (
        <button key={x.id} className={`gd-ch ${i === idx ? "on" : ""}`} aria-current={i === idx ? "page" : undefined} onClick={() => go(i)}>
          <span className={`gd-ch-n ${read.includes(x.id) ? "done" : ""}`}>{read.includes(x.id) ? <Check size={11} weight="bold" /> : i + 1}</span>
          <span className="gd-ch-t"><b>{x.title}</b><span>{x.short}</span></span>
        </button>
      ))}
    </div>
  ));

  return (
    <div className="gd">
      <header className="gd-top" data-tauri-drag-region>
        <Link to={back} className="gd-back"><ArrowLeft size={15} /> Back</Link>
        <div className="gd-brand"><Logo size={22} /><b>Creavia</b><span>Guide</span></div>
        <Search onPick={(x, step) => go(CHAPTERS.indexOf(x), step)} />
      </header>
      <div className="gd-body">
        <nav className="gd-rail" aria-label="Chapters">
          <div className="gd-progress"><span><BookOpenText size={15} weight="duotone" /> {read.length} of {CHAPTERS.length} read</span><div className="cr-bar"><i style={{ width: `${pct}%` }} /></div></div>
          {rail}
        </nav>
        <div className="gd-chips" role="tablist" aria-label="Chapters">
          {CHAPTERS.map((x, i) => <button key={x.id} role="tab" aria-selected={i === idx} className={i === idx ? "on" : ""} onClick={() => go(i)}>{read.includes(x.id) && <Check size={11} weight="bold" />}{x.title}</button>)}
        </div>
        <main className="gd-main" ref={main}>
          <article key={c.id} className="gd-chapter">
            <div className="gd-hero">
              <div className="gd-hero-art"><Art scene={c.scene} /></div>
              <div className="gd-hero-t">
                <div className="gd-kicker">Chapter {idx + 1} · {c.mins} min</div>
                <h1>{c.title}</h1>
                <p>{c.intro}</p>
              </div>
            </div>
            <ol className="gd-steps">{c.steps.map((s, i) => <StepCard key={`${c.id}-${i}`} s={s} n={i + 1} />)}</ol>
            <nav className="gd-pager" aria-label="Chapter">
              {prev ? <button className="gd-pg" onClick={() => go(idx - 1)}><span><ArrowLeft size={13} /> Back</span><b>{prev.title}</b></button> : <span />}
              {next ? <button className="gd-pg next" onClick={() => go(idx + 1)}><span>Next <ArrowRight size={13} /></span><b>{next.title}</b></button>
                : <Link className="gd-pg next" to={back}><span>All done <Check size={13} weight="bold" /></span><b>Back to Creavia</b></Link>}
            </nav>
            <p className="gd-keys">Tip: use the <kbd>←</kbd> <kbd>→</kbd> keys to move between chapters.</p>
          </article>
        </main>
      </div>
    </div>
  );
}
