// Attaches to Creavia's WebView2 through its debugging port, records the page for 30 s (console, errors, JS heap,
// DOM size), then crashes the page on purpose and checks the app comes back by itself, in safe graphics.
// Used by .github/workflows/winprobe.yml.
import { chromium } from "playwright-core";
import fs from "node:fs";
const out = process.argv[2] || "probe";
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => { const l = `[${new Date().toISOString()}] ${a.join(" ")}`; console.log(l); fs.appendFileSync(`${out}/log.txt`, l + "\n"); };

async function attach(label) {
  for (let i = 0; i < 90; i++) {
    try {
      const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
      const ctx = browser.contexts()[0];
      const page = ctx?.pages().find((p) => !p.url().startsWith("devtools"));
      if (page) { log(label, "attached", page.url()); return { browser, ctx, page }; }
      await browser.close().catch(() => {});
    } catch {}
    await sleep(1000);
  }
  throw new Error(`${label}: could not attach`);
}

async function watch(ctx, page, seconds) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  page.on("console", (m) => log("console", m.type(), m.text().slice(0, 300)));
  page.on("pageerror", (e) => log("pageerror", (e.stack || e.message).slice(0, 800)));
  for (let t = 0; t < seconds / 3; t++) {
    const { metrics } = await cdp.send("Performance.getMetrics");
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    log(`heap=${(m.JSHeapUsedSize / 1e6).toFixed(1)}MB nodes=${m.Nodes} url=${page.url()}`);
    await sleep(3000);
  }
  return cdp;
}

const first = await attach("start");
const cdp = await watch(first.ctx, first.page, 30);
const gpu = await first.page.evaluate(() => { const c = document.createElement("canvas").getContext("webgl"); const d = c?.getExtension("WEBGL_debug_renderer_info"); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : "none"; });
log("renderer before:", gpu);
log("crashing the page on purpose");
cdp.send("Page.crash").catch(() => {});
await sleep(4000);
await first.browser.close().catch(() => {});

const again = await attach("after crash");
await sleep(3000);
const text = await again.page.evaluate(() => document.body.innerText.slice(0, 200)).catch((e) => `(${e.message})`);
const gpu2 = await again.page.evaluate(() => { const c = document.createElement("canvas").getContext("webgl"); const d = c?.getExtension("WEBGL_debug_renderer_info"); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : "none"; }).catch(() => "?");
log("renderer after:", gpu2);
log("page after:", JSON.stringify(text));
await again.page.screenshot({ path: `${out}/after.png` }).catch(() => {});
await again.browser.close().catch(() => {});
if (!text || /having a problem/i.test(text) || text.startsWith("(")) { log("FAIL: the page didn't come back"); process.exit(1); }
log("OK: came back by itself");
