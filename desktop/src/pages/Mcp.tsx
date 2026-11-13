// MCP: let your AI apps use Creavia. Two ways in, pick either or both:
//  - on this computer: http://127.0.0.1:<port>/mcp, a token, the local engine's tools plus (when connected) the studio's;
//  - hosted: your studio's own /api/mcp, signed in with OAuth, reachable from claude.ai, ChatGPT and phones.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowsClockwise, Check, Copy, Desktop, Eye, EyeSlash, Globe, Power } from "@phosphor-icons/react";
import { PageHeader } from "@/components/ui";
import { inTauri, mcpRotate, mcpStart, mcpStatus, mcpStop, type McpStatus } from "../bridge/native";
import { useConn } from "../shell/conn";
import { copy, usePoll } from "../shell/hooks";
import { toast } from "../shell/toast";

const CLIENTS = ["Claude Code", "Claude Desktop", "Cursor", "VS Code", "Gemini CLI", "Other"] as const;
type Client = (typeof CLIENTS)[number];

function snippet(c: Client, url: string, token: string) {
  const h = `Authorization: Bearer ${token}`;
  const j = (o: unknown) => JSON.stringify(o, null, 2);
  switch (c) {
    case "Claude Code": return { where: "Run in a terminal", code: `claude mcp add --transport http creavia ${url} --header "${h}"` };
    case "Claude Desktop": return { where: "Settings → Developer → Edit config (claude_desktop_config.json)", code: j({ mcpServers: { creavia: { command: "npx", args: ["-y", "mcp-remote", url, "--header", h] } } }) };
    case "Cursor": return { where: "~/.cursor/mcp.json", code: j({ mcpServers: { creavia: { url, headers: { Authorization: `Bearer ${token}` } } } }) };
    case "VS Code": return { where: ".vscode/mcp.json (or your user settings)", code: j({ servers: { creavia: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } }) };
    case "Gemini CLI": return { where: "~/.gemini/settings.json", code: j({ mcpServers: { creavia: { httpUrl: url, headers: { Authorization: `Bearer ${token}` } } } }) };
    default: return { where: "Any client that speaks Streamable HTTP", code: `URL:    ${url}\nHeader: ${h}` };
  }
}

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return <button className="xs ghost" onClick={async () => { if (await copy(text)) { setOk(true); setTimeout(() => setOk(false), 1400); } }}>{ok ? <Check size={13} /> : <Copy size={13} />}{ok ? "Copied" : label}</button>;
}

export default function Mcp() {
  const { conn } = useConn();
  const st = usePoll<McpStatus>(() => (inTauri() ? mcpStatus() : Promise.reject(new Error("preview"))), 4000);
  const [client, setClient] = useState<Client>("Claude Code");
  const [reveal, setReveal] = useState(false);
  const s = st.data;
  const token = s?.token ?? "crv_mcp_…";
  const url = s?.url ?? "http://127.0.0.1:7377/mcp";
  const snip = useMemo(() => snippet(client, url, token), [client, url, token]);
  const masked = reveal ? token : `${token.slice(0, 12)}${"•".repeat(10)}`;
  const toggle = async () => {
    try { s?.running ? await mcpStop() : await mcpStart(); st.reload(); }
    catch (e) { toast(String((e as Error)?.message ?? e), { tone: "bad" }); }
  };

  return (
    <div className="page">
      <PageHeader title="MCP" sub="Let Claude, Cursor, Gemini and any other AI app work in Creavia: voice scripts, clean audio, make images, plan and publish posts." scene={false} />
      <div className="cr-mcp-modes">
        <section className={`cr-card cr-mode ${s?.running ? "on" : ""}`}>
          <header><span className="cr-tile-ic t-sky"><Desktop size={20} weight="duotone" /></span><div><b>On this computer</b><span>Private, no account needed. Your local engine’s tools{conn?.mode === "cloud" ? ", plus all of your studio’s" : ""}.</span></div>
            <button className={`sm ${s?.running ? "ghost" : ""}`} onClick={toggle} disabled={!inTauri()}><Power size={14} /> {s?.running ? "Turn off" : "Turn on"}</button></header>
          <dl className="cr-kv">
            <dt>Address</dt><dd><span className="mono">{url}</span><CopyBtn text={url} /></dd>
            <dt>Token</dt><dd><span className="mono">{masked}</span>
              <button className="xs quiet" onClick={() => setReveal((r) => !r)} aria-label={reveal ? "Hide token" : "Show token"}>{reveal ? <EyeSlash size={13} /> : <Eye size={13} />}</button>
              <CopyBtn text={token} />
              <button className="xs quiet" onClick={async () => { await mcpRotate(); st.reload(); toast("New token made: update your apps' settings"); }}><ArrowsClockwise size={13} /> New</button></dd>
            <dt>Tools</dt><dd>{s ? `${s.tools} available` : "—"}</dd>
          </dl>
        </section>
        <section className="cr-card cr-mode">
          <header><span className="cr-tile-ic t-lavender"><Globe size={20} weight="duotone" /></span><div><b>Hosted, in your studio</b><span>Works from claude.ai, ChatGPT and your phone. Each person signs in with their own account (OAuth).</span></div></header>
          {s?.hosted_url ? (
            <dl className="cr-kv">
              <dt>Address</dt><dd><span className="mono">{s.hosted_url}</span><CopyBtn text={s.hosted_url} /></dd>
              <dt>claude.ai</dt><dd>Settings → Connectors → Add custom connector → paste the address</dd>
              <dt>ChatGPT</dt><dd>Settings → Connectors → Create → paste the address (OAuth)</dd>
            </dl>
          ) : <p className="cr-lead sm">Connect a studio to get its address (<Link to="/login">Connect</Link>), or <Link to="/local/deploy">deploy one</Link>.</p>}
        </section>
      </div>

      <h2 className="cr-h2">Add Creavia to your app</h2>
      <div className="cr-card cr-snippets">
        <div className="seg" role="tablist" aria-label="App">
          {CLIENTS.map((c) => <button key={c} role="tab" aria-selected={client === c} className={client === c ? "on" : ""} onClick={() => setClient(c)}>{c}</button>)}
        </div>
        <div className="cr-snip-where">{snip.where}</div>
        <div className="cr-code"><pre className="mono">{reveal ? snip.code : snip.code.replaceAll(token, masked)}</pre><CopyBtn text={snip.code} label="Copy with token" /></div>
        {!s?.running && <p className="cr-fine">Turn the local MCP on first. It starts with Creavia from then on.</p>}
      </div>
    </div>
  );
}
