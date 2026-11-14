// This computer at a glance: the machine, the engine, the models, the MCP and the studio connection, with the next
// step for each.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowsClockwise, BookOpenText, CloudArrowUp, Cpu, Globe, HardDrives, Memory, Plugs, ShieldCheck, Sparkle } from "@phosphor-icons/react";
import { PageHeader } from "@/components/ui";
import { engineStatus, inTauri, mcpStatus, saveSettings, modelsState, systemInfo, type EngineStatus, type McpStatus, type ModelState, type SystemInfo } from "../bridge/native";
import { useConn } from "../shell/conn";
import { useDownloads } from "../shell/downloads";
import { gb, usePoll } from "../shell/hooks";
import { Vee } from "../shell/Vee";
import { checkForUpdate, installUpdate, useUpdate } from "../shell/updates";

const off = <T,>() => Promise.reject<T>(new Error("preview"));

export default function ThisComputer() {
  const { conn, settings, refresh } = useConn();
  const sys = usePoll<SystemInfo>(() => (inTauri() ? systemInfo() : off()), 30_000);
  const eng = usePoll<EngineStatus>(() => (inTauri() ? engineStatus() : off()), 5000);
  const mcp = usePoll<McpStatus>(() => (inTauri() ? mcpStatus() : off()), 5000);
  const models = usePoll<ModelState[]>(() => (inTauri() ? modelsState() : off()), 6000);
  const dls = useDownloads();
  const up = useUpdate();
  // the crash-report switch: one change at a time, and a failure is said, not swallowed
  const [reportsBusy, setReportsBusy] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const toggleReports = async (on: boolean) => {
    setReportsBusy(true);
    setReportsError(null);
    try {
      await saveSettings({ crash_reports: on });
      await refresh();
    } catch (e) {
      setReportsError(`Couldn’t save that: ${(e as Error).message}`);
    } finally {
      setReportsBusy(false);
    }
  };
  const s = sys.data, g = s?.gpus[0];
  const have = (models.data ?? []).filter((m) => m.complete).length;
  const busy = Object.values(dls).some((d) => d.state === "running") || !!eng.data?.running;
  const greeting = eng.data?.healthy ? "Your engine is running." : have ? "Your models are ready when you are." : "Let’s get your first model.";

  return (
    <div className="page">
      <PageHeader title="This computer" sub="Run Creavia’s AI on your own machine: private, free, and only the models you choose." scene={false} />
      <section className="cr-hero">
        <Vee size={96} mood={busy ? "working" : "idle"} />
        <div>
          <h2>{greeting}</h2>
          <p>{s ? <>{s.cpu || s.os} · {Math.round(s.ram_gb)} GB memory · {g ? `${g.name}, ${Math.round(g.vram_gb)} GB` : "no GPU found"}</> : "Checking your machine…"}</p>
        </div>
      </section>

      <div className="cr-tiles">
        <Link to="/local/models" className="cr-tile">
          <span className="cr-tile-ic t-peach"><HardDrives size={20} weight="duotone" /></span>
          <b>Models</b>
          <span>{have ? `${have} downloaded` : "None yet"} · {gb((models.data ?? []).reduce((a, m) => a + m.bytes, 0))} on disk</span>
          <em>{have ? "Manage" : "Pick your first"} <ArrowRight size={13} /></em>
        </Link>
        <Link to="/local/engine" className="cr-tile">
          <span className="cr-tile-ic t-mint"><Sparkle size={20} weight="duotone" /></span>
          <b>Engine</b>
          <span className={eng.data?.healthy ? "ok" : ""}>{eng.data?.healthy ? (eng.data.linked ? "Running, lent to your studio" : "Running") : eng.data?.installed ? "Ready to start" : "Not set up yet"}</span>
          <em>{eng.data?.installed ? "Open" : "Set up"} <ArrowRight size={13} /></em>
        </Link>
        <Link to="/local/mcp" className="cr-tile">
          <span className="cr-tile-ic t-sky"><Plugs size={20} weight="duotone" /></span>
          <b>MCP for your AI apps</b>
          <span className={mcp.data?.running ? "ok" : ""}>{mcp.data?.running ? `On at port ${mcp.data.port}` : "Off"}</span>
          <em>Connect Claude, Cursor… <ArrowRight size={13} /></em>
        </Link>
        <Link to={conn?.mode === "cloud" ? "/home" : "/login"} className="cr-tile">
          <span className="cr-tile-ic t-lavender"><Globe size={20} weight="duotone" /></span>
          <b>Studio</b>
          <span className={conn?.mode === "cloud" ? "ok" : ""}>{conn?.mode === "cloud" ? conn.url?.replace(/^https?:\/\//, "") : "Not connected"}</span>
          <em>{conn?.mode === "cloud" ? "Open" : "Connect"} <ArrowRight size={13} /></em>
        </Link>
      </div>

      <h2 className="cr-h2">The machine</h2>
      <div className="cr-specs">
        <div><Cpu size={16} weight="duotone" /><span>Processor</span><b>{s ? `${s.cpu || "—"} (${s.cores} threads)` : "—"}</b></div>
        <div><Memory size={16} weight="duotone" /><span>Memory</span><b>{s ? `${Math.round(s.ram_gb)} GB` : "—"}</b></div>
        <div><Sparkle size={16} weight="duotone" /><span>GPU</span><b>{s ? (s.gpus.length ? s.gpus.map((x) => `${x.name} (${Math.round(x.vram_gb)} GB)`).join(", ") : "None found") : "—"}</b></div>
        <div><HardDrives size={16} weight="duotone" /><span>Free disk</span><b>{s ? `${Math.round(s.disk_free_gb)} GB` : "—"}</b></div>
        <div><span className="cr-dotlabel">uv</span><span>Python manager</span><b className="mono">{s ? s.uv ?? "Installed for you at setup" : "—"}</b></div>
        <div><span className="cr-dotlabel">v</span><span>Creavia</span><b className="mono">{s?.version ?? "—"} · {s?.os}</b></div>
      </div>

      <div className="cr-twin">
        <div className="cr-card cr-upd">
          <span className="cr-upd-ic"><ArrowsClockwise size={18} weight="bold" className={up.phase === "checking" || up.phase === "installing" ? "spin" : ""} /></span>
          <div>
            <b>{up.phase === "ready" ? `Creavia ${up.info.version} is ready` : up.phase === "installing" ? "Updating…" : "Updates install themselves"}</b>
            <span>{up.phase === "ready" ? "One click: it installs and restarts in seconds." : up.phase === "idle" && up.error ? "Couldn’t check just now. It tries again by itself." : "Creavia checks for new versions on its own. No reinstalling, ever."}</span>
          </div>
          {up.phase === "ready" ? <button className="sm cr-cta" onClick={installUpdate}>Update</button>
            : <button className="sm ghost" disabled={up.phase !== "idle" || !inTauri()} onClick={() => checkForUpdate(true)}>{up.phase === "checking" ? "Checking…" : "Check now"}</button>}
        </div>
        <Link to="/guide" state={{ from: "/local" }} className="cr-card cr-upd cr-guide-card">
          <span className="cr-upd-ic"><BookOpenText size={18} weight="duotone" /></span>
          <div><b>The Creavia guide</b><span>Every step with pictures: models, the engine, voiceovers, putting your studio online.</span></div>
          <ArrowRight size={16} />
        </Link>
      </div>

      {settings?.crash_reports_available && (
        <div className="cr-card cr-upd" style={{ marginTop: 12 }}>
          <span className="cr-upd-ic"><ShieldCheck size={18} weight="duotone" /></span>
          <div>
            <b>{settings.crash_reports ? "Crash reports are on" : "Help fix crashes"}</b>
            <span>When Creavia or its engine hits an error, send what broke and where, with the app version. Never your files, your studio, your name or this computer&rsquo;s name.</span>
            {reportsError && <span role="alert" className="err">{reportsError}</span>}
          </div>
          <button type="button" className={settings.crash_reports ? "sm ghost" : "sm cr-cta"} aria-pressed={settings.crash_reports}
            disabled={reportsBusy} onClick={() => toggleReports(!settings.crash_reports)}>
            {settings.crash_reports ? "Turn off" : "Turn on"}
          </button>
        </div>
      )}

      {conn?.mode !== "cloud" && (
        <Link to="/local/deploy" className="cr-banner">
          <CloudArrowUp size={22} weight="duotone" />
          <div><b>Want your studio everywhere?</b><span>Deploy your own Creavia Cloud to Cloudflare in one click: posts, files, publishing and analytics, on any device, for your team.</span></div>
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
