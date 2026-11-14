import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@/app/globals.css";
import "./styles/creavia.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { installBridge } from "./bridge/fetch";
import { installCrashReports } from "./shell/crashes";
import { ConnProvider } from "./shell/conn";
import App from "./App";

installBridge();
installCrashReports();
document.documentElement.dataset.platform = /Mac/i.test(navigator.platform) ? "mac" : /Win/i.test(navigator.platform) ? "win" : "linux";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ConnProvider>
        <App />
      </ConnProvider>
    </BrowserRouter>
  </StrictMode>,
);
