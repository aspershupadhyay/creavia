// Every request the studio's screens make goes through Rust (src-tauri/src/net.rs):
//  - "/api/…", "/u/…", "/s/…" go to your Creavia Cloud, signed in with the session Rust keeps (cookie or token);
//  - other web addresses (presigned storage links, images) are fetched by Rust too, so CORS never gets in the way;
//  - the app's own files (/assets, /icons…) stay with the web view.
// fetch, XMLHttpRequest (uploads with progress) and window.open are patched once, at start (main.tsx).
import { invoke } from "@tauri-apps/api/core";
import { channel, inTauri, openExternal } from "./native";

const CLOUD_PATHS = /^\/(api|u|s|l|oauth)\//;
const nativeFetch = typeof window !== "undefined" ? window.fetch.bind(window) : fetch;

type Meta = { method: string; url: string; headers: Record<string, string> };
type Answer = { status: number; headers: [string, string][]; url: string };

/** Which requests leave the web view: the cloud's paths and any other site. */
export function routed(url: string): string | null {
  if (url.startsWith("/")) return CLOUD_PATHS.test(url) ? url : null;
  try {
    const u = new URL(url, location.href);
    if (u.origin === location.origin) return CLOUD_PATHS.test(u.pathname) ? u.pathname + u.search : null;
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {}
  return null;
}

function unframe(buf: ArrayBuffer): { meta: Answer; body: Uint8Array } {
  const view = new DataView(buf);
  const n = view.getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n))) as Answer;
  return { meta, body: new Uint8Array(buf, 4 + n) };
}

const headerObj = (h: HeadersInit | undefined) => {
  const out: Record<string, string> = {};
  new Headers(h).forEach((v, k) => { out[k] = v; });
  return out;
};

async function bodyBytes(body: BodyInit | null | undefined): Promise<Uint8Array> {
  if (body == null) return new Uint8Array();
  return new Uint8Array(await new Response(body as BodyInit).arrayBuffer());
}

function toResponse(a: Answer, body: Uint8Array) {
  const nullBody = [101, 204, 205, 304].includes(a.status);
  const r = new Response(nullBody ? null : (body as unknown as BodyInit), { status: a.status, headers: a.headers });
  Object.defineProperty(r, "url", { value: a.url });
  return r;
}

/** One request through Rust. */
export async function viaNative(meta: Meta, body: Uint8Array): Promise<Response> {
  const buf = await invoke<ArrayBuffer>("http", body, { headers: { "x-creavia": encodeURIComponent(JSON.stringify(meta)) } });
  const { meta: a, body: b } = unframe(buf);
  return toResponse(a, b);
}

/** One upload through Rust, with progress (fraction 0..1). */
export async function sendWithProgress(meta: Meta, body: Uint8Array, onProgress?: (f: number) => void): Promise<{ status: number; text: string }> {
  const id = await invoke<number>("http_stage", body);
  const buf = await invoke<ArrayBuffer>("http_send", { meta, bodyId: id, onProgress: channel<number>((f) => onProgress?.(f)) });
  const { meta: a, body: b } = unframe(buf);
  return { status: a.status, text: new TextDecoder().decode(b) };
}

class NativeXHR {
  // the slice of XMLHttpRequest the studio uses (uploads with progress)
  readyState = 0; status = 0; responseText = ""; response: unknown = ""; responseType = "";
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null; onerror: (() => void) | null = null; onloadend: (() => void) | null = null;
  onreadystatechange: (() => void) | null = null; onabort: (() => void) | null = null; timeout = 0; withCredentials = false;
  private m = "GET"; private u = ""; private h: Record<string, string> = {}; private real: XMLHttpRequest | null = null;
  private listeners: Record<string, (() => void)[]> = {};
  open(method: string, url: string) { this.m = method; this.u = url; this.readyState = 1; }
  setRequestHeader(k: string, v: string) { this.h[k.toLowerCase()] = v; }
  getResponseHeader() { return null; }
  getAllResponseHeaders() { return ""; }
  addEventListener(t: string, f: () => void) { (this.listeners[t] ??= []).push(f); }
  removeEventListener(t: string, f: () => void) { this.listeners[t] = (this.listeners[t] ?? []).filter((x) => x !== f); }
  abort() { this.real?.abort(); this.onabort?.(); }
  private fire(t: "load" | "error" | "loadend") {
    this.readyState = 4; this.onreadystatechange?.();
    ({ load: this.onload, error: this.onerror, loadend: this.onloadend })[t]?.call(this);
    for (const f of this.listeners[t] ?? []) f();
  }
  send(body?: XMLHttpRequestBodyInit | null) {
    const target = routed(this.u);
    if (!target) { // the web view's own files: a real XHR
      const x = (this.real = new RealXHR());
      x.open(this.m, this.u);
      for (const [k, v] of Object.entries(this.h)) x.setRequestHeader(k, v);
      x.upload.onprogress = (e) => this.upload.onprogress?.(e);
      x.onload = () => { this.status = x.status; this.responseText = x.responseText; this.response = x.response; this.fire("load"); this.fire("loadend"); };
      x.onerror = () => { this.fire("error"); this.fire("loadend"); };
      x.send(body as XMLHttpRequestBodyInit);
      return;
    }
    (async () => {
      const bytes = await bodyBytes(body as BodyInit);
      const total = bytes.byteLength;
      const r = await sendWithProgress({ method: this.m, url: target, headers: this.h }, bytes,
        (f) => this.upload.onprogress?.({ lengthComputable: true, loaded: Math.round(f * total), total }));
      this.status = r.status; this.responseText = r.text; this.response = r.text;
      this.fire("load"); this.fire("loadend");
    })().catch(() => { this.status = 0; this.fire("error"); this.fire("loadend"); });
  }
}
const RealXHR = typeof window !== "undefined" ? window.XMLHttpRequest : (null as never);

/** Patch fetch, XMLHttpRequest and window.open so the studio's screens work unchanged inside the app. */
export function installBridge() {
  if (!inTauri()) return; // a browser preview keeps the browser's own
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null;
    const url = req ? req.url : input instanceof URL ? input.href : String(input);
    const target = routed(url);
    if (!target) return nativeFetch(input as RequestInfo, init);
    const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
    const headers = headerObj(init?.headers ?? req?.headers);
    const body = init?.body !== undefined ? await bodyBytes(init.body) : req && !["GET", "HEAD"].includes(method) ? new Uint8Array(await req.arrayBuffer()) : new Uint8Array();
    if (init?.body instanceof FormData || (typeof init?.body === "object" && init?.body && "append" in (init.body as object))) {
      // FormData: let the platform write the multipart body and its boundary
      const r = new Request("http://x/", { method, body: init!.body });
      headers["content-type"] = r.headers.get("content-type") ?? "";
      return viaNative({ method, url: target, headers }, new Uint8Array(await r.arrayBuffer()));
    }
    return viaNative({ method, url: target, headers }, body);
  };
  (window as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = NativeXHR;
  const open = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const u = url ? String(url) : "";
    if (u.startsWith("/") && CLOUD_PATHS.test(u)) { saveDownload(u); return null; }
    if (/^(https?:|mailto:)/.test(u)) { openExternal(u); return null; }
    return open(url, target, features);
  }) as typeof window.open;
  // links: the studio's own downloads are saved by Rust (signed in), web pages open in your browser
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || e.defaultPrevented || e.button !== 0) return;
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("/") && CLOUD_PATHS.test(href)) { e.preventDefault(); saveDownload(href, a.getAttribute("download") || undefined); }
    else if (/^(https?:|mailto:)/.test(href)) {
      e.preventDefault();
      if (a.hasAttribute("download") && /^https?:/.test(href)) saveDownload(href, a.getAttribute("download") || undefined);
      else openExternal(href);
    }
  }, true);
  // images, audio and video that point at the studio's paths: loaded through the cloud:// scheme (Rust, signed in,
  // byte ranges for seeking)
  const fix = (el: Element) => {
    for (const attr of ["src", "poster", "href"] as const) {
      if (attr === "href" && el.tagName !== "image" && el.tagName !== "use") continue;
      const v = el.getAttribute(attr);
      if (v && v.startsWith("/") && CLOUD_PATHS.test(v)) el.setAttribute(attr, cloudSrc(v));
    }
  };
  const scan = (root: ParentNode) => root.querySelectorAll?.("img[src],audio[src],video[src],video[poster],source[src],track[src]").forEach(fix);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "attributes") fix(m.target as Element);
      else m.addedNodes.forEach((n) => { if (n.nodeType === 1) { fix(n as Element); scan(n as Element); } });
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "poster"] });
}

/** A studio path as a URL the web view can load by itself (media elements, workers): Rust answers it. */
export function cloudSrc(path: string) {
  const win = /Windows/i.test(navigator.userAgent);
  return `${win ? "http://cloud.localhost" : "cloud://localhost"}${path}`;
}

/** Save a studio file (or any link) into Downloads, then show it in the file manager. */
export async function saveDownload(url: string, name?: string) {
  const { call, revealPath } = await import("./native");
  const { toast } = await import("../shell/toast");
  toast(`Downloading${name ? ` ${name}` : ""}…`);
  try {
    const path = await call<string>("download", { url, name: name ?? null });
    toast(`Saved to ${path.split(/[\\/]/).slice(-2).join("/")}`, { action: "Show", run: () => revealPath(path) });
  } catch (e) { toast(`Download failed: ${(e as Error).message ?? e}`, { tone: "bad" }); }
}
