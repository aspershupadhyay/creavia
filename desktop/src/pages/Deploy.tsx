// Deploy your own Creavia Cloud: one click to Cloudflare (free plan), a free Postgres database, then connect.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, CloudArrowUp, Copy, Database, GithubLogo, Plugs, Terminal } from "@phosphor-icons/react";
import { PageHeader } from "@/components/ui";
import { openExternal } from "../bridge/native";
import { copy } from "../shell/hooks";
import { Vee } from "../shell/Vee";

export const REPO = "https://github.com/aspershupadhyay/creavia";
const DEPLOY = `https://deploy.workers.cloudflare.com/?url=${encodeURIComponent(`${REPO}/tree/main/cloud`)}`;

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className={`cr-stepcard ${done ? "done" : ""}`}>
      <span className="cr-stepn">{done ? <Check size={14} weight="bold" /> : n}</span>
      <div><h3>{title}</h3>{children}</div>
    </li>
  );
}

const CLI = `git clone ${REPO}\ncd creavia && npm install\nnpm run cloud:deploy`;

export default function Deploy() {
  const [clicked, setClicked] = useState({ cf: false, db: false });
  const [ok, setOk] = useState(false);
  return (
    <div className="page">
      <PageHeader title="Deploy a cloud" sub="Your own Creavia Cloud on your Cloudflare account: posts, files, voices, publishing, analytics and the hosted MCP, for you and your team. Cloudflare Workers Paid ($5 a month); storage and the database start free." scene={false} />
      <div className="cr-deploy">
        <ol className="cr-steps">
          <Step n={1} title="Make a free database" done={clicked.db}>
            <p>Creavia keeps posts, files and accounts in Postgres. Neon’s free plan is plenty. Create a project and copy its connection string (it starts with <span className="mono">postgres://</span>).</p>
            <button className="sm ghost" onClick={() => { openExternal("https://console.neon.tech/signup"); setClicked((c) => ({ ...c, db: true })); }}><Database size={15} /> Open Neon</button>
          </Step>
          <Step n={2} title="Deploy to Cloudflare" done={clicked.cf}>
            <p>One click copies Creavia into your GitHub, makes the storage bucket and deploys it (Workers Paid plan, $5 a month). When it asks, paste the database string and choose two long random secrets (it explains each). Updates then deploy by themselves.</p>
            <button className="cr-cf" onClick={() => { openExternal(DEPLOY); setClicked((c) => ({ ...c, cf: true })); }}><CloudArrowUp size={18} weight="fill" /> Deploy to Cloudflare</button>
          </Step>
          <Step n={3} title="Connect this app">
            <p>Cloudflare shows your studio’s address when it’s done. Open it once to create your account (the first one founds the studio), then connect here.</p>
            <Link to="/login" className="btn sm"><Plugs size={15} /> Connect my studio <ArrowRight size={14} /></Link>
          </Step>
        </ol>
        <aside className="cr-deploy-side">
          <Vee size={110} mood="happy" />
          <h3>What you get</h3>
          <ul className="cr-list">
            <li>Your studio at your own address, on every device</li>
            <li>Posts board, calendar, files (up to 2 GB each), comments</li>
            <li>Publishing to YouTube and Instagram, and analytics</li>
            <li>A hosted MCP for claude.ai, ChatGPT and Gemini</li>
            <li>Cloud GPUs when you want them: Colab, Kaggle, Modal, or this computer</li>
          </ul>
          <div className="cr-card cr-cli">
            <b><Terminal size={15} /> Prefer a terminal?</b>
            <pre className="mono">{CLI}</pre>
            <button className="xs ghost" onClick={async () => { if (await copy(CLI)) { setOk(true); setTimeout(() => setOk(false), 1400); } }}>{ok ? <Check size={13} /> : <Copy size={13} />} {ok ? "Copied" : "Copy"}</button>
            <span className="cr-fine">It asks the same questions, then deploys with Wrangler. <button className="linkish" onClick={() => openExternal(`${REPO}/blob/main/docs/DEPLOY.md`)}><GithubLogo size={12} /> docs/DEPLOY.md</button></span>
          </div>
        </aside>
      </div>
    </div>
  );
}
