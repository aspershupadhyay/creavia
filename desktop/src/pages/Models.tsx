// Models: Creavia ships none. Pick what you want and it downloads from its maker, straight into the engine's folder.
// Each card says what the model does, its size, the GPU it needs against yours, and its licence.
import { useEffect, useMemo, useState } from "react";
import { ArrowClockwise, Check, ClosedCaptioning, CloudArrowDown, DotsThree, FilmStrip, FolderOpen, HardDrives, ImageSquare,
  Key, MagnifyingGlass, MagicWand, PersonSimpleRun, SpeakerHigh, Trash, Warning, X } from "@phosphor-icons/react";
import { PageHeader } from "@/components/ui";
import { deleteModel, inTauri, modelsCatalog, modelsState, revealPath, saveSettings, systemInfo, type ModelEntry, type ModelState, type SystemInfo } from "../bridge/native";
import { useConn } from "../shell/conn";
import { startDownload, stopDownload, useDownloads } from "../shell/downloads";
import { eta, gb, usePoll } from "../shell/hooks";
import { toast } from "../shell/toast";

const KINDS = [
  { id: "all", label: "All" },
  { id: "tts", label: "Voice", Icon: SpeakerHigh, tone: "peach" },
  { id: "asr", label: "Subtitles", Icon: ClosedCaptioning, tone: "sky" },
  { id: "enhance", label: "Clean-up", Icon: MagicWand, tone: "mint" },
  { id: "image", label: "Images", Icon: ImageSquare, tone: "rose" },
  { id: "video", label: "Video", Icon: FilmStrip, tone: "lavender" },
  { id: "animate", label: "Animate", Icon: PersonSimpleRun, tone: "sand" },
] as const;
const kindOf = (k: string) => KINDS.find((x) => x.id === k) ?? KINDS[1];

type Fit = { ok: boolean; text: string };
function fitFor(m: ModelEntry, sys: SystemInfo | null): Fit {
  if (!sys) return { ok: true, text: "" };
  const g = sys.gpus.reduce<SystemInfo["gpus"][number] | undefined>((a, x) => (x.vram_gb > (a?.vram_gb ?? 0) ? x : a), undefined);
  if (m.needs === "any") return { ok: true, text: g ? `Runs here, even without the GPU` : "Runs on this computer's CPU" };
  if (!g || g.vendor !== "nvidia") return { ok: false, text: g?.vendor === "apple" ? "Needs an NVIDIA GPU (Apple Silicon support is coming)" : "Needs an NVIDIA GPU: use a cloud GPU instead" };
  if (g.vram_gb + 0.5 < m.vram_gb) return { ok: false, text: `Needs ${m.vram_gb} GB of GPU memory, your ${g.name} has ${Math.round(g.vram_gb)}` };
  return { ok: true, text: `Fits your ${g.name}` };
}

function ModelCard({ m, st, sys, onChange }: { m: ModelEntry; st?: ModelState; sys: SystemInfo | null; onChange: () => void }) {
  const dl = useDownloads()[m.id];
  const [menu, setMenu] = useState(false);
  const k = kindOf(m.kind);
  const Icon = "Icon" in k ? k.Icon : SpeakerHigh;
  const fit = fitFor(m, sys);
  const running = dl && (dl.state === "starting" || dl.state === "running");
  const pct = dl && dl.total ? Math.min(100, (dl.done / dl.total) * 100) : 0;
  const complete = st?.complete && !running;
  const partial = st?.installed && !st.complete && !running;
  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent | MouseEvent) => { if (e instanceof MouseEvent || e.key === "Escape") setMenu(false); };
    setTimeout(() => { addEventListener("click", close); addEventListener("keydown", close); }, 0);
    return () => { removeEventListener("click", close); removeEventListener("keydown", close); };
  }, [menu]);
  const remove = async () => {
    try { await deleteModel(m.id); toast(`${m.name} removed`); onChange(); } catch (e) { toast(String((e as Error)?.message ?? e), { tone: "bad" }); }
  };
  return (
    <article className={`cr-model ${complete ? "have" : ""} ${running ? "busy" : ""}`}>
      <header>
        <span className={`cr-kind t-${"tone" in k ? k.tone : "peach"}`}><Icon size={20} weight="duotone" /></span>
        <div className="cr-model-n">
          <h3>{m.name}</h3>
          <span>{m.maker}</span>
        </div>
        {complete && (
          <div className="cr-model-menu">
            <button className="quiet xs" aria-label={`More for ${m.name}`} aria-expanded={menu} onClick={() => setMenu((x) => !x)}><DotsThree size={18} weight="bold" /></button>
            {menu && (
              <div className="cr-pop" role="menu">
                <button role="menuitem" onClick={() => st && revealPath(st.path)}><FolderOpen size={15} /> Show in folder</button>
                <button role="menuitem" className="bad" onClick={remove}><Trash size={15} /> Delete ({gb(st?.bytes ?? 0)})</button>
              </div>
            )}
          </div>
        )}
      </header>
      <p className="cr-model-about">{m.about}</p>
      <div className="cr-chips">
        <span className="cr-chip"><HardDrives size={13} /> {gb(m.disk_gb * 1e9)}</span>
        {m.vram_gb > 0 ? <span className="cr-chip">{m.vram_gb} GB GPU</span> : <span className="cr-chip">CPU</span>}
        <span className={`cr-chip ${m.commercial ? "ok" : "warn"}`} title={m.license}>{m.commercial ? "Commercial use" : "Non-commercial"}</span>
        {m.languages && <span className="cr-chip ellipsis" title={m.languages}>{m.languages}</span>}
      </div>
      {fit.text && <div className={`cr-fit ${fit.ok ? "ok" : "no"}`}>{fit.ok ? <Check size={13} weight="bold" /> : <Warning size={13} weight="bold" />}{fit.text}</div>}
      <footer>
        {running ? (
          <div className="cr-progress">
            <div className="cr-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`Downloading ${m.name}`}>
              <i style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
            <div className="cr-progress-row">
              <span className="mono">{dl.total ? `${gb(dl.done)} of ${gb(dl.total)}` : "Preparing…"}</span>
              <span className="mono dim">{dl.rate > 0 ? `${gb(dl.rate)}/s · ${eta(dl.total - dl.done, dl.rate)}` : ""}</span>
              <button className="quiet xs" onClick={() => stopDownload(m.id)} aria-label={`Cancel ${m.name}`}><X size={14} /> Cancel</button>
            </div>
          </div>
        ) : complete ? (
          <div className="cr-have"><span className="cr-ok-dot"><Check size={12} weight="bold" /></span> Downloaded <span className="dim mono">{gb(st?.bytes ?? 0)}</span></div>
        ) : (
          <>
            {dl?.state === "error" && <div className="cr-err sm" role="alert">{dl.error}</div>}
            <button className={`sm ${fit.ok ? "" : "ghost"}`} onClick={() => startDownload(m.id, m.name, onChange)} disabled={!inTauri()}>
              {partial || dl?.state === "error" || dl?.state === "cancelled" ? <><ArrowClockwise size={15} /> Resume</> : <><CloudArrowDown size={15} /> Download {gb(m.disk_gb * 1e9)}</>}
            </button>
          </>
        )}
      </footer>
    </article>
  );
}

function HfToken() {
  const [open, setOpen] = useState(false);
  const { settings, refresh } = useConn();
  const [v, setV] = useState("");
  const save = async (val: string) => {
    try { await saveSettings({ hf_token: val }); setV(""); await refresh(); toast(val ? "Hugging Face token saved" : "Token removed", { tone: "ok" }); }
    catch (e) { toast(String((e as Error)?.message ?? e), { tone: "bad" }); }
  };
  return (
    <div className="cr-card cr-setting">
      <div className="cr-setting-head"><Key size={18} weight="duotone" /><div><b>Advanced: Hugging Face token</b><span>Not needed: every model here downloads without an account. Add one only if Hugging Face asks you to slow down, or a maker starts asking people to accept terms. Kept in this computer’s keychain.</span></div></div>
      {!open && !settings?.hf_token_set ? <button className="sm ghost" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(true)}>Add a token</button> : (
      <div className="cr-row">
        <input type="password" aria-label="Hugging Face token" placeholder={settings?.hf_token_set ? "A token is saved" : "hf_…"} value={v} onChange={(e) => setV(e.target.value)} />
        <button className="sm" disabled={!v.trim()} onClick={() => save(v.trim())}>Save</button>
        {settings?.hf_token_set && <button className="sm ghost" onClick={() => save("")}>Remove</button>}
      </div>)}
    </div>
  );
}

function Folder({ sys, onChange }: { sys: SystemInfo | null; onChange: () => void }) {
  const { refresh } = useConn();
  const [dir, setDir] = useState("");
  useEffect(() => { if (sys) setDir(sys.models_dir); }, [sys]);
  return (
    <div className="cr-card cr-setting">
      <div className="cr-setting-head"><FolderOpen size={18} weight="duotone" /><div><b>Models folder</b><span>Where weights go. Put it on your biggest disk: video models are 20 to 85 GB each. Moving it doesn’t move what’s there.</span></div></div>
      <div className="cr-row">
        <input aria-label="Models folder" value={dir} onChange={(e) => setDir(e.target.value)} spellCheck={false} className="mono" />
        <button className="sm ghost" onClick={() => sys && revealPath(sys.models_dir)}>Open</button>
        <button className="sm" disabled={!sys || dir === sys.models_dir} onClick={async () => {
          try { await saveSettings({ models_dir: dir }); await refresh(); onChange(); toast("Models folder changed", { tone: "ok" }); }
          catch (e) { toast(String((e as Error)?.message ?? e), { tone: "bad" }); }
        }}>Save</button>
      </div>
    </div>
  );
}

export default function Models() {
  const [cat, setCat] = useState<ModelEntry[]>([]);
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [kind, setKind] = useState<string>("all");
  const [q, setQ] = useState("");
  const [fitsOnly, setFitsOnly] = useState(false);
  const dls = useDownloads();
  const states = usePoll(() => (inTauri() ? modelsState() : Promise.resolve([] as ModelState[])), 5000);
  useEffect(() => {
    if (!inTauri()) return;
    modelsCatalog().then(setCat).catch(() => null);
    systemInfo().then(setSys).catch(() => null);
  }, []);
  const byId = useMemo(() => Object.fromEntries((states.data ?? []).map((s) => [s.id, s])), [states.data]);
  const list = cat.filter((m) => (kind === "all" || m.kind === kind)
    && (!q.trim() || `${m.name} ${m.maker} ${m.about} ${m.tags.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()))
    && (!fitsOnly || fitFor(m, sys).ok));
  const have = (states.data ?? []).filter((s) => s.complete);
  const used = (states.data ?? []).reduce((a, s) => a + s.bytes, 0);
  const g = sys?.gpus[0];
  const active = Object.values(dls).filter((d) => d.state === "running" || d.state === "starting").length;

  return (
    <div className="page">
      <PageHeader title="Models" sub="Nothing comes bundled. Download the models you want, straight from their makers: no account, no token. They run on this computer." scene={false} />
      <div className="cr-stats">
        <div className="cr-stat"><span>Downloaded</span><b className="mono">{have.length}<em>/{cat.length || "—"}</em></b>{active > 0 && <i className="cr-live">{active} downloading</i>}</div>
        <div className="cr-stat"><span>Disk used</span><b className="mono">{gb(used)}</b><i>{sys ? `${Math.round(sys.disk_free_gb)} GB free` : ""}</i></div>
        <div className="cr-stat"><span>GPU</span><b className="ellipsis">{g ? g.name.replace(/^NVIDIA /, "") : sys ? "None found" : "—"}</b><i>{g ? `${Math.round(g.vram_gb)} GB` : sys ? "CPU models only" : ""}</i></div>
      </div>
      <div className="cr-toolbar">
        <div className="seg" role="tablist" aria-label="Kind">
          {KINDS.map((k) => <button key={k.id} role="tab" aria-selected={kind === k.id} className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)}>{k.label}</button>)}
        </div>
        <label className="cr-search"><MagnifyingGlass size={15} /><input placeholder="Search models" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search models" /></label>
        <label className="cr-check"><input type="checkbox" checked={fitsOnly} onChange={(e) => setFitsOnly(e.target.checked)} /> Fits my computer</label>
      </div>
      <div className="cr-models">
        {list.map((m) => <ModelCard key={m.id} m={m} st={byId[m.id]} sys={sys} onChange={states.reload} />)}
        {!list.length && <div className="cr-empty">{cat.length ? "No model matches." : inTauri() ? "Loading…" : "Open the Creavia app to manage models."}</div>}
      </div>
      <h2 className="cr-h2">Storage and access</h2>
      <div className="cr-settings-grid">
        <Folder sys={sys} onChange={states.reload} />
        <HfToken />
      </div>
    </div>
  );
}
