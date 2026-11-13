// The frame before a studio is connected: this computer's pages, and the studio's pages waiting behind "Connect".
// Once connected, the studio's own frame (cloud/components/Shell.tsx) takes over, with these pages in its sidebar.
import { Link, useLocation } from "react-router-dom";
import { BookOpenText, ChartLineUp, Cpu, CloudArrowUp, Globe, HardDrives, Lock, MagicWand, Plugs, Sparkle } from "@phosphor-icons/react";
import { Logo } from "@/components/art";

export const LOCAL_NAV = [
  { href: "/local", name: "This computer", Icon: Cpu, mv: "chip" },
  { href: "/local/models", name: "Models", Icon: HardDrives, mv: "files" },
  { href: "/local/engine", name: "Engine", Icon: Sparkle, mv: "wand" },
  { href: "/local/mcp", name: "MCP", Icon: Plugs, mv: "gear" },
  { href: "/local/deploy", name: "Deploy a cloud", Icon: CloudArrowUp, mv: "files" },
  { href: "/guide", name: "Guide", Icon: BookOpenText, mv: "files" },
];

const LOCKED = ["Home", "Voices", "Posts", "Files", "Voiceover", "Clean-up", "Subtitles", "Images", "Download"];

export function LocalFrame({ children }: { children: React.ReactNode }) {
  const path = useLocation().pathname;
  const on = (h: string) => (h === "/local" ? path === h : path === h || path.startsWith(`${h}/`));
  return (
    <div className="app cr-local">
      <aside className="side" aria-label="Sidebar">
        <div className="cr-drag" data-tauri-drag-region />
        <Link to="/local" className="brand" aria-label="Creavia">
          <Logo size={26} />
          <span className="brand-n nl"><b>Creavia</b><span>Studio</span></span>
        </Link>
        <nav className="mode-sw" aria-label="Mode">
          <Link to="/login" title="Create: connect a studio first"><MagicWand size={15} weight="duotone" /><span className="nl">Create</span></Link>
          <Link to="/login" title="Grow: connect a studio first"><ChartLineUp size={15} weight="duotone" /><span className="nl">Grow</span></Link>
        </nav>
        <nav className="side-nav" aria-label="Pages">
          <div className="navsec nl">This computer</div>
          {LOCAL_NAV.map(({ href, name, Icon, mv }) => (
            <Link key={href} to={href} className={`navlink ${on(href) ? "on" : ""}`} aria-current={on(href) ? "page" : undefined}>
              <Icon size={18} weight="duotone" className="ic mv" data-move={mv} /><span className="nl">{name}</span>
            </Link>
          ))}
          <div className="navsec nl">Studio</div>
          {LOCKED.map((n) => (
            <Link key={n} to="/login" className="navlink cr-locked" title="Connect a studio to open this">
              <Lock size={16} weight="duotone" className="ic" /><span className="nl">{n}</span>
            </Link>
          ))}
        </nav>
        <Link to="/login" className="cr-connect-card">
          <b>Connect a studio</b>
          <span>Sign in to your Creavia Cloud for posts, files, publishing and analytics.</span>
        </Link>
      </aside>
      <div className="main">
        <div className="cr-drag top" data-tauri-drag-region />
        <main id="main" className="main-inner" tabIndex={-1}>{children}</main>
      </div>
      <nav className="tabbar" aria-label="Main">
        {LOCAL_NAV.slice(0, 4).map(({ href, name, Icon, mv }) => (
          <Link key={href} to={href} className={on(href) ? "on" : ""} aria-current={on(href) ? "page" : undefined}><Icon size={22} weight="duotone" className="mv" data-move={mv} /><span>{name === "This computer" ? "Computer" : name}</span></Link>
        ))}
        <Link to="/login"><Globe size={22} weight="duotone" /><span>Connect</span></Link>
      </nav>
    </div>
  );
}
