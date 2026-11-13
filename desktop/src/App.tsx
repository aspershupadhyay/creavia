// Creavia desktop: routes. The studio's screens (cloud/components) render inside the studio's frame once a Creavia
// Cloud is connected; this computer's pages (src/pages) work with or without one.
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { Cpu, CloudArrowUp, HardDrives, Plugs, Sparkle } from "@phosphor-icons/react";
import Shell, { ShellHost } from "@/components/Shell";
import AnalyticsShell from "@/components/AnalyticsShell";
import { useConn } from "./shell/conn";
import { LocalFrame } from "./shell/LocalFrame";
import { Toaster } from "./shell/toast";
import { Vee } from "./shell/Vee";

const Welcome = lazy(() => import("./pages/Welcome"));
const Connect = lazy(() => import("./pages/Connect"));
const ThisComputer = lazy(() => import("./pages/ThisComputer"));
const Models = lazy(() => import("./pages/Models"));
const Engine = lazy(() => import("./pages/Engine"));
const Mcp = lazy(() => import("./pages/Mcp"));
const Deploy = lazy(() => import("./pages/Deploy"));

const Home = lazy(() => import("@/components/Home"));
const Voices = lazy(() => import("@/components/Voices"));
const CloneVoice = lazy(() => import("@/components/CloneVoice"));
const MyModel = lazy(() => import("@/components/MyModel"));
const Revoice = lazy(() => import("@/components/Revoice"));
const Posts = lazy(() => import("@/components/Posts"));
const AutoDm = lazy(() => import("@/components/autodm/AutoDm"));
const Files = lazy(() => import("@/components/Files"));
const Writing = lazy(() => import("@/components/Writing"));
const Voiceover = lazy(() => import("@/components/Voiceover"));
const Studio = lazy(() => import("@/components/Studio"));
const Subtitles = lazy(() => import("@/components/Subtitles"));
const Images = lazy(() => import("@/components/Images"));
const Download = lazy(() => import("@/components/Download"));
const Settings = lazy(() => import("@/components/Settings"));
const Radar = lazy(() => import("@/components/Radar"));
const an = (k: string) => lazy(() => import("@/components/Analytics").then((m) => ({ default: (m as unknown as Record<string, React.ComponentType>)[k] })));
const grow = (k: string) => lazy(() => import("@/components/Grow").then((m) => ({ default: (m as unknown as Record<string, React.ComponentType>)[k] })));
const Overview = an("Overview"), ContentView = an("ContentView"), TimingView = an("TimingView"), YouTubeView = an("YouTubeView"),
  InstagramView = an("InstagramView"), AudienceView = an("AudienceView");
const LiveView = grow("LiveView"), CompetitorsView = grow("CompetitorsView");
const RivalViewLazy = lazy(() => import("@/components/Grow").then((m) => ({ default: (m as unknown as { RivalView: React.ComponentType<{ slug: string }> }).RivalView })));
function RivalView() { const { slug = "" } = useParams(); return <RivalViewLazy slug={decodeURIComponent(slug)} />; }

function Loading() {
  return <div className="cr-loading" aria-busy="true"><Vee size={64} mood="working" /></div>;
}

const HOST = {
  title: "This computer",
  nav: [
    { href: "/local", name: "This computer", Icon: Cpu, mv: "chip", exact: true },
    { href: "/local/models", name: "Models", Icon: HardDrives, mv: "files" },
    { href: "/local/engine", name: "Engine", Icon: Sparkle, mv: "wand" },
    { href: "/local/mcp", name: "MCP", Icon: Plugs, mv: "gear" },
    { href: "/local/deploy", name: "Deploy a cloud", Icon: CloudArrowUp, mv: "files" },
  ],
};

/** The frame: the studio's own when connected, the local one otherwise. */
function Frame({ need }: { need?: "cloud" }) {
  const { conn } = useConn();
  if (!conn) return <Loading />;
  if (conn.mode !== "cloud") {
    if (need === "cloud") return <Navigate to="/login" replace />;
    return <LocalFrame><Suspense fallback={<Loading />}><Outlet /></Suspense></LocalFrame>;
  }
  return (
    <ShellHost.Provider value={HOST}>
      <Shell><Suspense fallback={<Loading />}><Outlet /></Suspense></Shell>
    </ShellHost.Provider>
  );
}

function Start() {
  const { conn, settings } = useConn();
  if (!conn || !settings) return <Loading />;
  if (!settings.onboarded) return <Navigate to="/welcome" replace />;
  return <Navigate to={conn.mode === "cloud" ? "/home" : "/local"} replace />;
}

function AnalyticsFrame() {
  return <div className="page wide"><Suspense><AnalyticsShell><Suspense fallback={<Loading />}><Outlet /></Suspense></AnalyticsShell></Suspense></div>;
}

function Page({ children, wrap = false }: { children: ReactNode; wrap?: boolean }) {
  return wrap ? <Suspense fallback={<Loading />}>{children}</Suspense> : <>{children}</>;
}

/** Lets Rust (the tray) move the app to a page. */
function useGo() {
  const nav = useNavigate();
  useEffect(() => { (window as unknown as { __creaviaGo?: (p: string) => void }).__creaviaGo = (p) => nav(p); }, [nav]);
}

export default function App() {
  useGo();
  return (
    <>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Start />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/login" element={<Connect />} />
          <Route element={<Frame />}>
            <Route path="/local" element={<ThisComputer />} />
            <Route path="/local/models" element={<Models />} />
            <Route path="/local/engine" element={<Engine />} />
            <Route path="/local/mcp" element={<Mcp />} />
            <Route path="/local/deploy" element={<Deploy />} />
          </Route>
          <Route element={<Frame need="cloud" />}>
            <Route path="/home" element={<Home />} />
            <Route path="/voices" element={<Voices />} />
            <Route path="/voices/new" element={<CloneVoice />} />
            <Route path="/voices/professional" element={<MyModel />} />
            <Route path="/voices/revoice" element={<Revoice />} />
            <Route path="/posts" element={<Page wrap><Posts /></Page>} />
            <Route path="/auto-dm" element={<Page wrap><AutoDm /></Page>} />
            <Route path="/files" element={<Page wrap><Files /></Page>} />
            <Route path="/writing" element={<Page wrap><Writing /></Page>} />
            <Route path="/voiceover" element={<Voiceover />} />
            <Route path="/clean-up" element={<Studio />} />
            <Route path="/subtitles" element={<Subtitles />} />
            <Route path="/images" element={<Images />} />
            <Route path="/download" element={<Download />} />
            <Route path="/settings" element={<Page wrap><Settings /></Page>} />
            <Route path="/analytics/radar" element={<Radar />} />
            <Route element={<AnalyticsFrame />}>
              <Route path="/analytics" element={<Overview />} />
              <Route path="/analytics/content" element={<ContentView />} />
              <Route path="/analytics/when-to-post" element={<TimingView />} />
              <Route path="/analytics/youtube" element={<YouTubeView />} />
              <Route path="/analytics/instagram" element={<InstagramView />} />
              <Route path="/analytics/audience" element={<AudienceView />} />
              <Route path="/analytics/live" element={<LiveView />} />
              <Route path="/analytics/competitors" element={<CompetitorsView />} />
              <Route path="/analytics/competitors/:slug" element={<RivalView />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </>
  );
}
