// Uncaught errors in the web view go to Rust (src-tauri/src/crash.rs), which sends them only if the person turned
// crash reports on, scrubbed and capped per run. The web view never talks to Sentry itself and holds no address.
import { call, inTauri } from "../bridge/native";

type WebError = { message: string; stack: string | null; page: string };

/** The parts of an error worth reporting: no query strings, no page content. */
export function describeError(error: unknown, page: string): WebError {
  const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  return { message: e.message || e.name, stack: e.stack ?? null, page: page.split(/[?#]/)[0] };
}

/** Starts listening once, at start-up. Does nothing in a plain browser (previews, tests). */
export function installCrashReports(win: Window = window) {
  if (!inTauri()) return;
  const send = (error: unknown) => {
    // a report that can't be sent is dropped on purpose: reporting must never cause another error
    call("crash_report_web", { error: describeError(error, win.location.pathname) }).catch(() => {});
  };
  win.addEventListener("error", (e) => send(e.error ?? e.message));
  win.addEventListener("unhandledrejection", (e) => send(e.reason));
}
