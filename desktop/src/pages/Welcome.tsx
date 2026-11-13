// First run: hello from Vee, where the AI should run, and a starter set of models picked for this machine.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, CloudArrowUp, Cpu, Globe, HardDrives, Lightning } from "@phosphor-icons/react";
import { inTauri, modelsCatalog, saveSettings, systemInfo, type ModelEntry, type SystemInfo } from "../bridge/native";
import { useConn } from "../shell/conn";
import { startDownload } from "../shell/downloads";
import { gb } from "../shell/hooks";
import { Vee } from "../shell/Vee";

type Where = "local" | "cloud";
const bestGpu = (s: SystemInfo | null) => s?.gpus.reduce((a, g) => (g.vram_gb > (a?.vram_gb ?? 0) ? g : a), s.gpus[0]);

/** What to suggest first on this machine: small and useful, never more than its GPU holds. */
function starters(cat: ModelEntry[], s: SystemInfo | null) {
  const g = bestGpu(s);
  const nvidia = g?.vendor === "nvidia" ? g.vram_gb : 0;
  const want = ["kokoro", ...(nvidia >= 6 ? ["whisper", "qwen", "apbwe"] : []), ...(nvidia >= 12 ? ["orpheus"] : [])];
  return cat.filter((m) => want.includes(m.id));
}

export default function Welcome() {
  const nav = useNavigate();
  const { refresh } = useConn();
  const [step, setStep] = useState(0);
  const [where, setWhere] = useState<Set<Where>>(new Set(["local"]));
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [cat, setCat] = useState<ModelEntry[]>([]);
  const [pick, setPick] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!inTauri()) return;
    systemInfo().then(setSys).catch(() => null);
    modelsCatalog().then(setCat).catch(() => null);
  }, []);
  const suggested = useMemo(() => starters(cat, sys), [cat, sys]);
  useEffect(() => setPick(new Set(suggested.map((m) => m.id))), [suggested]);
  const g = bestGpu(sys);
  const toggle = (w: Where) => setWhere((s) => { const n = new Set(s); n.has(w) ? n.delete(w) : n.add(w); return n.size ? n : s; });

  const finish = async () => {
    for (const m of suggested.filter((m) => pick.has(m.id))) startDownload(m.id, m.name);
    if (inTauri()) await saveSettings({ onboarded: true }).catch(() => null);
    await refresh();
    nav(where.has("cloud") ? "/login" : "/local/models");
  };

  return (
    <div className="cr-welcome">
      <div className="cr-drag top" data-tauri-drag-region />
      <div className="cr-welcome-inner" key={step}>
        {step === 0 && (
          <section className="cr-hello">
            <Vee size={168} />
            <h1>Hi, I’m Vee.</h1>
            <p>Creavia is your studio for voiceovers in your own voice, clean-up, subtitles, images, posts and growing an audience. Let’s set it up in under a minute.</p>
            <button className="lg cr-cta" onClick={() => setStep(1)} autoFocus>Let’s go <ArrowRight size={16} weight="bold" /></button>
          </section>
        )}

        {step === 1 && (
          <section>
            <div className="cr-step">Step 1 of 2</div>
            <h1 className="cr-title">Where should the AI run?</h1>
            <p className="cr-lead">Pick one or both. You can change it any time.</p>
            <div className="cr-choices">
              <button className={`cr-choice ${where.has("local") ? "on" : ""}`} onClick={() => toggle("local")} aria-pressed={where.has("local")}>
                <span className="cr-choice-ic"><Cpu size={22} weight="duotone" /></span>
                <b>This computer</b>
                <span>Private and free. Download only the models you pick, run them on your own GPU.</span>
                <span className="cr-choice-meta">{g ? `${g.name} · ${Math.round(g.vram_gb)} GB` : sys ? "No GPU found: CPU models still work" : "Checking your machine…"}</span>
                <i className="cr-tick"><Check size={13} weight="bold" /></i>
              </button>
              <button className={`cr-choice ${where.has("cloud") ? "on" : ""}`} onClick={() => toggle("cloud")} aria-pressed={where.has("cloud")}>
                <span className="cr-choice-ic"><Globe size={22} weight="duotone" /></span>
                <b>My Creavia Cloud</b>
                <span>Your studio online: posts, files, publishing, analytics, the hosted MCP and cloud GPUs. Shared with your team.</span>
                <span className="cr-choice-meta">Sign in with your studio’s address</span>
                <i className="cr-tick"><Check size={13} weight="bold" /></i>
              </button>
            </div>
            <button className="cr-deploy-link" onClick={async () => { if (inTauri()) await saveSettings({ onboarded: true }).catch(() => null); await refresh(); nav("/local/deploy"); }}>
              <CloudArrowUp size={18} weight="duotone" /> Don’t have a cloud yet? <b>Deploy your own in one click</b> <ArrowRight size={14} />
            </button>
            <div className="cr-foot">
              <button className="quiet" onClick={() => setStep(0)}>Back</button>
              <button className="lg cr-cta" onClick={() => (where.has("local") ? setStep(2) : finish())}>Continue <ArrowRight size={16} weight="bold" /></button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <div className="cr-step">Step 2 of 2</div>
            <h1 className="cr-title">Pick your first models</h1>
            <p className="cr-lead">Nothing is bundled with Creavia. These are chosen for {g ? <b>{g.name}</b> : "this computer"}, and download in the background. More are on the Models page.</p>
            <div className="cr-starters">
              {suggested.map((m) => (
                <label key={m.id} className={`cr-starter ${pick.has(m.id) ? "on" : ""}`}>
                  <input type="checkbox" checked={pick.has(m.id)} onChange={() => setPick((s) => { const n = new Set(s); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} />
                  <span className="cr-starter-body"><b>{m.name}</b><span>{m.about}</span></span>
                  <span className="cr-starter-size">{gb(m.disk_gb * 1e9)}</span>
                </label>
              ))}
              {!suggested.length && <p className="cr-lead">Checking your machine…</p>}
            </div>
            <div className="cr-total"><HardDrives size={16} weight="duotone" /> {gb(suggested.filter((m) => pick.has(m.id)).reduce((a, m) => a + m.disk_gb * 1e9, 0))} to download · {sys ? `${Math.round(sys.disk_free_gb)} GB free` : ""}</div>
            <div className="cr-foot">
              <button className="quiet" onClick={() => setStep(1)}>Back</button>
              <button className="lg cr-cta" onClick={finish}><Lightning size={16} weight="fill" /> {pick.size ? "Download and start" : "Start"}</button>
            </div>
          </section>
        )}
      </div>
      <div className="cr-dots" aria-hidden>{[0, 1, 2].map((i) => <i key={i} className={i === step ? "on" : ""} />)}</div>
    </div>
  );
}
