// First run, step by step: Vee says hello, you say what you want to make, Vee looks at this computer, you pick where
// the AI runs and your first models (picked for your goals and your GPU, no account needed), whether you want a
// studio online, and then a little celebration. Every step can go back; Enter moves on; the guide is one click away.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpenText, Broom, Check, ClosedCaptioning, CloudArrowUp, Cpu, FilmStrip, Globe, HardDrives,
  ImageSquare, Lightning, Microphone, PlugsConnected, ShieldCheck, SpeakerHigh, TrendUp, UserSound } from "@phosphor-icons/react";
import { inTauri, modelsCatalog, saveSettings, systemInfo, type ModelEntry, type SystemInfo } from "../bridge/native";
import { useConn } from "../shell/conn";
import { startDownload } from "../shell/downloads";
import { gb } from "../shell/hooks";
import { Vee } from "../shell/Vee";

type Where = "local" | "cloud";
type Goal = "voice" | "myvoice" | "subs" | "clean" | "images" | "video" | "grow";
type Next = "connect" | "deploy" | "later";
const GOALS: { id: Goal; label: string; sub: string; Icon: typeof Microphone; models: string[] }[] = [
  { id: "voice", label: "Voiceovers", sub: "Scripts into speech", Icon: SpeakerHigh, models: ["kokoro", "chatterbox"] },
  { id: "myvoice", label: "My own voice", sub: "Sound like you", Icon: UserSound, models: ["qwen"] },
  { id: "subs", label: "Subtitles", sub: "Captions with timings", Icon: ClosedCaptioning, models: ["whisper"] },
  { id: "clean", label: "Clean audio", sub: "No noise or echo", Icon: Broom, models: ["enhance", "apbwe"] },
  { id: "images", label: "Images", sub: "Thumbnails and covers", Icon: ImageSquare, models: ["zimage"] },
  { id: "video", label: "Video", sub: "Clips from text", Icon: FilmStrip, models: ["wan"] },
  { id: "grow", label: "Posts and growth", sub: "Publish and analytics", Icon: TrendUp, models: [] },
];
const STEPS = ["Hello", "Goals", "Your computer", "Where", "Models", "Online", "Ready"];
const bestGpu = (s: SystemInfo | null) => s?.gpus.reduce((a, g) => (g.vram_gb > (a?.vram_gb ?? 0) ? g : a), s.gpus[0]);

/** What to suggest: the models for the chosen goals that fit this machine, Kokoro always (it runs anywhere). */
function starters(cat: ModelEntry[], s: SystemInfo | null, goals: Set<Goal>) {
  const g = bestGpu(s);
  const vram = g?.vendor === "nvidia" ? g.vram_gb : 0;
  const want = new Set(["kokoro", ...[...goals].flatMap((id) => GOALS.find((x) => x.id === id)?.models ?? [])]);
  return cat.filter((m) => want.has(m.id) && (m.needs === "any" || (vram > 0 && m.vram_gb <= vram + 0.5)));
}

function Scan({ sys, onDone }: { sys: SystemInfo | null; onDone: () => void }) {
  const g = bestGpu(sys);
  const rows = [
    { k: "Computer", v: sys ? `${/mac/i.test(sys.os) ? "Mac" : /win/i.test(sys.os) ? "Windows" : "Linux"} · ${sys.arch}` : "" },
    { k: "Processor", v: sys ? `${sys.cores} cores` : "" },
    { k: "Memory", v: sys ? `${Math.round(sys.ram_gb)} GB` : "" },
    { k: "Graphics card", v: sys ? (g ? `${g.name} · ${Math.round(g.vram_gb)} GB` : "None found") : "" },
    { k: "Free disk", v: sys ? `${Math.round(sys.disk_free_gb)} GB` : "" },
  ];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!sys && inTauri()) return;
    if (shown >= rows.length) { const t = setTimeout(onDone, 500); return () => clearTimeout(t); }
    const t = setTimeout(() => setShown((n) => n + 1), 380);
    return () => clearTimeout(t);
  }, [shown, sys]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ul className="ob-scan">
      {rows.map((r, i) => (
        <li key={r.k} className={i < shown ? "done" : i === shown ? "now" : ""}>
          <span className="ob-scan-ic">{i < shown ? <Check size={12} weight="bold" /> : <i />}</span>
          <span>{r.k}</span><b className="mono">{i < shown ? r.v || "—" : ""}</b>
        </li>
      ))}
    </ul>
  );
}

function verdict(sys: SystemInfo | null) {
  const g = bestGpu(sys);
  if (!sys) return "Open the Creavia app to look at this computer.";
  if (g?.vendor === "nvidia" && g.vram_gb >= 20) return `Your ${g.name} is a powerhouse: it runs voices, subtitles, clean-up, images and video.`;
  if (g?.vendor === "nvidia" && g.vram_gb >= 6) return `Your ${g.name} runs voices, your own voice, subtitles and clean-up. Images and video can use a cloud GPU.`;
  if (g?.vendor === "nvidia") return `Your ${g.name} runs the lighter models. Bigger ones can use a cloud GPU.`;
  return "Kokoro voices run right here. The bigger models can use a free cloud GPU from your studio.";
}

export default function Welcome() {
  const nav = useNavigate();
  const { refresh } = useConn();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [goals, setGoals] = useState<Set<Goal>>(new Set(["voice", "subs"]));
  const [where, setWhere] = useState<Set<Where>>(new Set(["local"]));
  const [next, setNext] = useState<Next>("later");
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [cat, setCat] = useState<ModelEntry[]>([]);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [scanned, setScanned] = useState(false);
  useEffect(() => {
    if (!inTauri()) return;
    systemInfo().then(setSys).catch(() => null);
    modelsCatalog().then(setCat).catch(() => null);
  }, []);
  const suggested = useMemo(() => starters(cat, sys, goals), [cat, sys, goals]);
  useEffect(() => setPick(new Set(suggested.map((m) => m.id))), [suggested]);
  const chosen = suggested.filter((m) => pick.has(m.id));
  const local = where.has("local");
  const order = [0, 1, 2, 3, ...(local ? [4] : []), 5, 6];
  const pos = order.indexOf(step);
  const go = (d: 1 | -1) => { setDir(d); setStep(order[Math.min(order.length - 1, Math.max(0, pos + d))]); };
  const toggle = <T,>(set: (f: (s: Set<T>) => Set<T>) => void, v: T, keepOne = false) =>
    set((s) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return keepOne && !n.size ? s : n; });

  const finish = async () => {
    if (local) for (const m of chosen) startDownload(m.id, m.name);
    if (inTauri()) await saveSettings({ onboarded: true }).catch(() => null);
    await refresh();
    nav(next === "connect" ? "/login" : next === "deploy" ? "/guide/host" : local ? "/local/models" : "/local", next === "deploy" ? { state: { from: "/local" } } : undefined);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || (e.target as HTMLElement)?.closest("button, input, a")) return;
      if (step === 6) finish(); else if (step !== 2 || scanned) go(1);
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  });

  const g = bestGpu(sys);
  return (
    <div className="ob">
      <div className="cr-drag top" data-tauri-drag-region />
      <div className="ob-sky" aria-hidden>{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, animationDelay: `${(i % 7) * 0.6}s` }} />)}</div>
      {step > 0 && (
        <ol className="ob-steps" aria-label="Setup steps">
          {order.slice(1).map((s, i) => <li key={s} className={s === step ? "on" : order.indexOf(s) < pos ? "done" : ""}><i />{STEPS[s]}{i < order.length - 2 && <em />}</li>)}
        </ol>
      )}
      <div className={`ob-stage d${dir}`} key={step}>
        {step === 0 && (
          <section className="ob-hello">
            <div className="ob-vee"><Vee size={176} mood="happy" /><span className="ob-burst" aria-hidden>{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ transform: `rotate(${i * 45}deg) translateY(-112px)` }} />)}</span></div>
            <h1>Hi, I’m <span className="ob-name">Vee</span>.</h1>
            <p>Welcome to Creavia, your studio for voiceovers in your own voice, subtitles, clean audio, images and posts. Let’s set it up together. It takes about a minute.</p>
            <div className="ob-row">
              <button className="lg cr-cta" onClick={() => go(1)} autoFocus>Let’s set it up <ArrowRight size={16} weight="bold" /></button>
              <Link to="/guide/meet" state={{ from: "/welcome" }} className="ob-ghost"><BookOpenText size={16} weight="duotone" /> Read the guide first</Link>
            </div>
            <div className="ob-trust"><span><ShieldCheck size={14} weight="duotone" /> Private: runs on your computer</span><span><HardDrives size={14} weight="duotone" /> No models bundled: you choose</span><span><Lightning size={14} weight="duotone" /> Free to use here</span></div>
          </section>
        )}

        {step === 1 && (
          <section>
            <h1 className="ob-title">What do you want to make?</h1>
            <p className="ob-lead">Pick as many as you like. Vee picks your first models from this.</p>
            <div className="ob-goals">
              {GOALS.map(({ id, label, sub, Icon }, i) => (
                <button key={id} className={`ob-goal ${goals.has(id) ? "on" : ""}`} style={{ animationDelay: `${i * 45}ms` }} aria-pressed={goals.has(id)} onClick={() => toggle(setGoals, id)}>
                  <span className="ob-goal-ic"><Icon size={22} weight="duotone" /></span><b>{label}</b><span>{sub}</span>
                  <i className="cr-tick"><Check size={12} weight="bold" /></i>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="ob-center">
            <div className="ob-vee sm"><Vee size={104} mood={scanned ? "happy" : "working"} /></div>
            <h1 className="ob-title">{scanned ? "Here’s your computer" : "Let me look at your computer…"}</h1>
            <Scan sys={sys} onDone={() => setScanned(true)} />
            <p className={`ob-verdict ${scanned ? "in" : ""}`}>{verdict(sys)}</p>
          </section>
        )}

        {step === 3 && (
          <section>
            <h1 className="ob-title">Where should the AI run?</h1>
            <p className="ob-lead">Pick one or both. You can change it any time.</p>
            <div className="cr-choices">
              <button className={`cr-choice ${local ? "on" : ""}`} onClick={() => toggle(setWhere, "local", true)} aria-pressed={local}>
                <span className="cr-choice-ic"><Cpu size={22} weight="duotone" /></span>
                <b>This computer</b>
                <span>Private and free. Download only the models you pick and run them on your own machine.</span>
                <span className="cr-choice-meta">{g ? `${g.name} · ${Math.round(g.vram_gb)} GB` : sys ? "No graphics card: Kokoro still works" : "This computer"}</span>
                <i className="cr-tick"><Check size={13} weight="bold" /></i>
              </button>
              <button className={`cr-choice ${where.has("cloud") ? "on" : ""}`} onClick={() => toggle(setWhere, "cloud", true)} aria-pressed={where.has("cloud")}>
                <span className="cr-choice-ic"><Globe size={22} weight="duotone" /></span>
                <b>My studio online</b>
                <span>Posts, files, publishing, analytics and cloud GPUs, from any browser and shared with your team.</span>
                <span className="cr-choice-meta">On your own Cloudflare account</span>
                <i className="cr-tick"><Check size={13} weight="bold" /></i>
              </button>
            </div>
          </section>
        )}

        {step === 4 && (
          <section>
            <h1 className="ob-title">Your first models</h1>
            <p className="ob-lead">Picked for what you want to make{g ? <> and your <b>{g.name}</b></> : ""}. They download in the background, straight from their makers. <b>No account or token needed.</b></p>
            <div className="cr-starters">
              {suggested.map((m, i) => (
                <label key={m.id} className={`cr-starter ${pick.has(m.id) ? "on" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
                  <input type="checkbox" checked={pick.has(m.id)} onChange={() => toggle(setPick, m.id)} />
                  <span className="cr-starter-body"><b>{m.name}</b><span>{m.about}</span></span>
                  <span className="cr-starter-size">{gb(m.disk_gb * 1e9)}</span>
                </label>
              ))}
              {!suggested.length && <p className="ob-lead">{inTauri() ? "Looking at the catalogue…" : "Open the Creavia app to pick models."}</p>}
            </div>
            <div className="cr-total"><HardDrives size={16} weight="duotone" /> {gb(chosen.reduce((a, m) => a + m.disk_gb * 1e9, 0))} to download{sys ? ` · ${Math.round(sys.disk_free_gb)} GB free` : ""} · more on the Models page</div>
          </section>
        )}

        {step === 5 && (
          <section>
            <h1 className="ob-title">Want your studio online?</h1>
            <p className="ob-lead">It’s optional. Your studio online lets you publish to YouTube and Instagram, see analytics, and work from any browser.</p>
            <div className="ob-next">
              {([
                { id: "connect", Icon: PlugsConnected, t: "I have one", s: "Connect it now with its address" },
                { id: "deploy", Icon: CloudArrowUp, t: "Show me how", s: "A step-by-step guide, about 10 minutes" },
                { id: "later", Icon: Cpu, t: "Not now", s: "Use Creavia on this computer" },
              ] as const).map(({ id, Icon, t, s }) => (
                <button key={id} className={`ob-opt ${next === id ? "on" : ""}`} aria-pressed={next === id} onClick={() => setNext(id)}>
                  <span className="ob-goal-ic"><Icon size={20} weight="duotone" /></span><span><b>{t}</b><span>{s}</span></span>
                  <i className="ob-radio" />
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 6 && (
          <section className="ob-center ob-done">
            <div className="ob-vee"><Vee size={150} mood="happy" /><span className="ob-burst big" aria-hidden>{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ transform: `rotate(${i * 30}deg) translateY(-100px)` }} />)}</span></div>
            <h1 className="ob-title">You’re all set!</h1>
            <ul className="ob-summary">
              {local && chosen.length > 0 && <li><Check size={14} weight="bold" /> {chosen.length} model{chosen.length > 1 ? "s" : ""} will download ({gb(chosen.reduce((a, m) => a + m.disk_gb * 1e9, 0))})</li>}
              {local && <li><Check size={14} weight="bold" /> Next: turn on the engine on the Engine page</li>}
              {next === "connect" && <li><Check size={14} weight="bold" /> Then connect your studio</li>}
              {next === "deploy" && <li><Check size={14} weight="bold" /> Then the guide to put your studio online</li>}
              <li><Check size={14} weight="bold" /> Updates install themselves: no reinstalling</li>
            </ul>
            <button className="lg cr-cta" onClick={finish} autoFocus><Lightning size={16} weight="fill" /> Open Creavia</button>
          </section>
        )}
      </div>

      {step > 0 && step < 6 && (
        <div className="ob-foot">
          <button className="quiet" onClick={() => go(-1)}><ArrowLeft size={14} /> Back</button>
          <Link to={`/guide/${step === 5 ? "host" : step === 4 ? "models" : "meet"}`} state={{ from: "/welcome" }} className="ob-help"><BookOpenText size={14} /> Guide</Link>
          <button className="lg cr-cta" onClick={() => go(1)} disabled={step === 2 && !scanned && inTauri()}>Continue <ArrowRight size={16} weight="bold" /></button>
        </div>
      )}
    </div>
  );
}
