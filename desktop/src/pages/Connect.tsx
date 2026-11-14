// Connect the app to a Creavia Cloud: your studio's address, then your email and password (or an access token, or a
// new account on a studio that's just been deployed). The session stays in Rust (the keychain), never in the web view.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CloudArrowUp, Eye, EyeSlash, Key, SignIn, UserPlus, BookOpenText } from "@phosphor-icons/react";
import { inTauri, signIn, signOutCloud, useToken } from "../bridge/native";
import { useConn } from "../shell/conn";
import { Vee } from "../shell/Vee";

type Tab = "signin" | "signup" | "token";

export default function Connect() {
  const nav = useNavigate();
  const { conn, refresh } = useConn();
  const [tab, setTab] = useState<Tab>("signin");
  const [url, setUrl] = useState(conn?.url ?? "");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!inTauri()) { setErr("Open the Creavia app to connect."); return; }
    setBusy(true);
    try {
      // biome-ignore lint/correctness/useHookAtTopLevel: useToken signs in with a token; it is not a React hook
      if (tab === "token") await useToken(url, token);
      else await signIn(url, email, password, tab === "signup" ? name : undefined);
      await refresh();
      nav("/home", { replace: true });
    } catch (e2) { setErr(String((e2 as Error)?.message ?? e2)); }
    finally { setBusy(false); }
  };

  return (
    <div className="cr-connect">
      <div className="cr-drag top" data-tauri-drag-region />
      <aside className="cr-connect-art">
        <Link to="/local" className="cr-back"><ArrowLeft size={14} /> This computer</Link>
        <Vee size={150} mood={busy ? "working" : err ? "sleepy" : "idle"} />
        <h1>Connect your studio</h1>
        <p>Your Creavia Cloud keeps posts, files, voices, publishing and analytics, for you and your team, on any device. Its MCP lets Claude, ChatGPT and Gemini work in it.</p>
        <Link to="/local/deploy" className="cr-mini-card"><CloudArrowUp size={18} weight="duotone" /><span><b>No cloud yet?</b> Deploy one to your Cloudflare account in one click.</span><ArrowRight size={14} /></Link>
        <Link to="/guide/host" state={{ from: "/login" }} className="cr-mini-card"><BookOpenText size={18} weight="duotone" /><span><b>New to this?</b> The guide shows every step, with pictures.</span><ArrowRight size={14} /></Link>
      </aside>

      <form className="cr-connect-form" onSubmit={go}>
        {conn?.mode === "cloud" && (
          <div className="cr-connected">Connected to <b>{conn.url?.replace(/^https?:\/\//, "")}</b> as {conn.who}.
            <button type="button" className="xs ghost" onClick={async () => { await signOutCloud(); await refresh(); }}>Sign out</button></div>
        )}
        <div className="seg cr-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "signin"} className={tab === "signin" ? "on" : ""} onClick={() => setTab("signin")}><SignIn size={14} /> Sign in</button>
          <button type="button" role="tab" aria-selected={tab === "signup"} className={tab === "signup" ? "on" : ""} onClick={() => setTab("signup")}><UserPlus size={14} /> New account</button>
          <button type="button" role="tab" aria-selected={tab === "token"} className={tab === "token" ? "on" : ""} onClick={() => setTab("token")}><Key size={14} /> Access token</button>
        </div>

        <div className="field">
          <label htmlFor="cr-url">Studio address</label>
          <input id="cr-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="studio.example.com" autoComplete="url" required spellCheck={false} />
          <div className="hint">The address you open your studio at. https:// is added for you.</div>
        </div>
        {tab === "signup" && (
          <div className="field">
            <label htmlFor="cr-name">Your name</label>
            <input id="cr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" autoComplete="name" required />
          </div>
        )}
        {tab !== "token" ? (
          <>
            <div className="field">
              <label htmlFor="cr-email">Email</label>
              <input id="cr-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="cr-pw">Password</label>
              <div className="cr-pw">
                <input id="cr-pw" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={tab === "signup" ? "new-password" : "current-password"} required minLength={tab === "signup" ? 10 : undefined} />
                <button type="button" className="quiet xs" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeSlash size={15} /> : <Eye size={15} />}</button>
              </div>
              {tab === "signup" && <div className="hint">A brand-new studio: the first account founds it. Otherwise your email must be on the studio’s list.</div>}
            </div>
          </>
        ) : (
          <div className="field">
            <label htmlFor="cr-token">Access token</label>
            <input id="cr-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="The studio's MCP_TOKEN" required />
            <div className="hint">For a studio you run alone. It signs in as the studio, not as a person.</div>
          </div>
        )}
        {err && <div className="cr-err" role="alert">{err}</div>}
        <button className="lg block cr-cta" disabled={busy}>{busy ? "Connecting…" : tab === "signup" ? "Create account and connect" : "Connect"}</button>
        <p className="cr-fine">Creavia keeps your session in this computer’s keychain. Sign out here or from the studio’s Settings → Security.</p>
      </form>
    </div>
  );
}
