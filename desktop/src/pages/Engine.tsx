// The engine on this computer: set it up once, start it, and optionally lend it to your studio as its GPU.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowsClockwise, Broadcast, Check, Play, Stop, Terminal, Warning, Wrench } from "@phosphor-icons/react";
import { PageHeader } from "@/components/ui";
import { engineInstall, engineLogs, engineStart, engineStatus, engineStop, inTauri, type EngineStatus } from "../bridge/native";
import { useConn } from "../shell/conn";
import { usePoll } from "../shell/hooks";
import { toast } from "../shell/toast";
import { Vee } from "../shell/Vee";

export default function Engine() {
  const { conn } = useConn();
  const st = usePoll<EngineStatus>(() => (inTauri() ? engineStatus() : Promise.reject(new Error("preview"))), 3000);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | "install" | "start" | "stop">(null);
  const [link, setLink] = useState(false);
  const [secret, setSecret] = useState("");
  const box = useRef<HTMLPreElement>(null);
  useEffect(() => { if (inTauri()) engineLogs().then(setLog).catch(() => null); }, []);
  useEffect(() => {
    if (!inTauri()) return;
    const t = setInterval(() => { if (st.data?.running) engineLogs().then(setLog).catch(() => null); }, 2000);
    return () => clearInterval(t);
  }, [st.data?.running]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [log]);
  const e = st.data;

  const install = async () => {
    setBusy("install"); setLog((l) => [...l, "— setting up the engine —"]);
    try { await engineInstall((line) => setLog((l) => [...l.slice(-500), line])); toast("The engine is set up", { tone: "ok" }); }
    catch (err) { toast(String((err as Error)?.message ?? err), { tone: "bad" }); }
    finally { setBusy(null); st.reload(); }
  };
  const start = async () => {
    setBusy("start");
    try { await engineStart(link, secret || undefined); setSecret(""); toast(link ? "Engine running and lent to your studio" : "Engine running", { tone: "ok" }); }
    catch (err) { toast(String((err as Error)?.message ?? err), { tone: "bad" }); }
    finally { setBusy(null); st.reload(); engineLogs().then(setLog).catch(() => null); }
  };
  const stop = async () => { setBusy("stop"); try { await engineStop(); } finally { setBusy(null); st.reload(); } };

  const state = !e ? "…" : e.healthy ? "Running" : e.running ? "Starting…" : e.installed ? "Stopped" : "Not set up";
  return (
    <div className="page">
      <PageHeader title="Engine" sub="The same engine Creavia’s cloud GPUs run, on this computer. Each model gets its own environment the first time it’s used." scene={false}
        actions={<button className="sm ghost" onClick={() => st.reload()}><ArrowsClockwise size={14} /> Refresh</button>} />
      <section className="cr-engine">
        <div className="cr-engine-state">
          <Vee size={88} mood={busy || e?.running && !e.healthy ? "working" : e?.healthy ? "happy" : "sleepy"} />
          <div>
            <span className={`cr-pill ${e?.healthy ? "ok" : e?.running ? "warn" : ""}`}><i />{state}</span>
            <h2>{e?.healthy ? (e.linked ? "Working for your studio" : "Ready on this computer") : e?.installed ? "Ready to start" : "One-time setup"}</h2>
            <p>{e?.healthy ? (e.linked ? `Your studio sends GPU jobs here${e.tunnel ? ` through ${e.tunnel.replace("https://", "")}` : ""}.` : `Listening on 127.0.0.1:${e.port}. The MCP and this app use it.`)
              : e?.installed ? "Start it to voice, clean up, transcribe and make images with the models you downloaded."
              : "Creavia installs uv and a small Python environment (about 200 MB). Model weights come from the Models page."}</p>
          </div>
        </div>
        <div className="cr-engine-actions">
          {!e?.installed && <button className="lg cr-cta" onClick={install} disabled={!!busy || !inTauri()}><Wrench size={16} /> {busy === "install" ? "Setting up…" : "Set up the engine"}</button>}
          {e?.installed && !e.running && <button className="lg cr-cta" onClick={start} disabled={!!busy}><Play size={16} weight="fill" /> {busy === "start" ? "Starting…" : "Start"}</button>}
          {e?.running && <button className="lg ghost" onClick={stop} disabled={!!busy}><Stop size={16} weight="fill" /> Stop</button>}
          {e?.installed && !e.running && <button className="sm quiet" onClick={install} disabled={!!busy}>Repair</button>}
        </div>
      </section>

      {e?.installed && !e.running && (
        <div className="cr-card cr-lend">
          <label className="cr-check big">
            <input type="checkbox" checked={link} onChange={(ev) => setLink(ev.target.checked)} disabled={conn?.mode !== "cloud"} />
            <span><b><Broadcast size={15} weight="duotone" /> Lend this GPU to my studio</b>
              <span>{conn?.mode === "cloud" ? "Your studio’s voiceovers, clean-up and images run here, like a Colab worker, through a private Cloudflare tunnel. Needs cloudflared (brew install cloudflared on a Mac)." : <>Connect a studio first (<Link to="/login">Connect</Link>).</>}</span></span>
          </label>
          {link && (
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="ws">Studio’s worker secret</label>
              <input id="ws" type="password" value={secret} onChange={(ev) => setSecret(ev.target.value)} placeholder="Saved after the first time" />
              <div className="hint">The WORKER_SECRET your studio was deployed with (docs/DEPLOY.md). Kept in this computer’s keychain.</div>
            </div>
          )}
        </div>
      )}

      {e?.last_error && <div className="cr-err" role="alert"><Warning size={14} /> {e.last_error}</div>}

      <h2 className="cr-h2"><Terminal size={16} /> Log</h2>
      <pre className="cr-log" ref={box} aria-live="polite">{log.length ? log.join("\n") : "Nothing yet."}</pre>
      {e?.engine_dir && <p className="cr-fine"><Check size={12} /> Engine files: <span className="mono">{e.engine_dir}</span></p>}
    </div>
  );
}
