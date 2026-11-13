// This computer at a glance: the machine, the engine, the models, the MCP and the studio connection, with the next
// step for each.
import { Link } from "react-router-dom";
import { ArrowRight, CloudArrowUp, Cpu, Globe, HardDrives, Memory, Plugs, Sparkle } from "@phosphor-icons/react";
import { PageHeader } from "@/components/ui";
import { engineStatus, inTauri, mcpStatus, modelsState, systemInfo, type EngineStatus, type McpStatus, type ModelState, type SystemInfo } from "../bridge/native";
import { useConn } from "../shell/conn";
import { useDownloads } from "../shell/downloads";
import { gb, usePoll } from "../shell/hooks";
import { Vee } from "../shell/Vee";

const off = <T,>() => Promise.reject<T>(new Error("preview"));

export default function ThisComputer() {
  const { conn } = useConn();
  const sys = usePoll<SystemInfo>(() => (inTauri() ? systemInfo() : off()), 30_000);
  const eng = usePoll<EngineStatus>(() => (inTauri() ? engineStatus() : off()), 5000);
  const mcp = usePoll<McpStatus>(() => (inTauri() ? mcpStatus() : off()), 5000);
  const models = usePoll<ModelState[]>(() => (inTauri() ? modelsState() : off()), 6000);
  const dls = useDownloads();
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
