// The app's connection to a Creavia Cloud, shared by every screen.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { appSettings, connection, inTauri, type AppSettings, type Connection } from "../bridge/native";

type Ctx = { conn: Connection | null; settings: AppSettings | null; refresh: () => Promise<void> };
const C = createContext<Ctx>({ conn: null, settings: null, refresh: async () => {} });
export const useConn = () => useContext(C);

const preview: Connection = { mode: "none", url: null, how: null, who: null };
const previewSettings: AppSettings = { hf_token_set: false, models_dir: "~/Creavia/engine", mcp_autostart: false, engine_autostart: false, onboarded: false, launch_at_login: false, crash_reports: false, crash_reports_available: false };

export function ConnProvider({ children }: { children: React.ReactNode }) {
  const [conn, setConn] = useState<Connection | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const refresh = useCallback(async () => {
    if (!inTauri()) { setConn(preview); setSettings(previewSettings); return; }
    const [c, s] = await Promise.all([connection(), appSettings()]);
    setConn(c); setSettings(s);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <C.Provider value={{ conn, settings, refresh }}>{children}</C.Provider>;
}
