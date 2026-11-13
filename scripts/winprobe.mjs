// Attaches to Creavia's WebView2 through the remote debugging port and records what the page does for a minute:
// console, errors, crashes, JS heap, DOM size and screenshots. Used by .github/workflows/winprobe.yml.
import { chromium } from "playwright-core";
import fs from "node:fs";
const out = process.argv[2] || "probe";
fs.mkdirSync(out, { recursive: true });
const log = (...a) => { const l = `[${new Date().toISOString()}] ${a.join(" ")}`; console.log(l); fs.appendFileSync(`${out}/log.txt`, l + "\n"); };
let browser;
for (let i = 0; i < 60 && !browser; i++) {
  try { browser = await chromium.connectOverCDP("http://127.0.0.1:9222"); } catch { await new Promise((r) => setTimeout(r, 1000)); }
}
if (!browser) { log("could not connect"); process.exit(1); }
const ctx = browser.contexts()[0];
let page = ctx.pages()[0];
for (let i = 0; i < 30 && !page; i++) { await new Promise((r) => setTimeout(r, 1000)); page = ctx.pages()[0]; }
log("page", page?.url());
const cdp = await ctx.newCDPSession(page);
await cdp.send("Performance.enable");
page.on("console", (m) => log("console", m.type(), m.text().slice(0, 500)));
page.on("pageerror", (e) => log("pageerror", e.stack?.slice(0, 1500) || e.message));
page.on("crash", () => log("CRASH"));
page.on("framenavigated", (f) => { if (f === page.mainFrame()) log("navigated", f.url()); });
page.on("requestfailed", (r) => log("requestfailed", r.url(), r.failure()?.errorText));
for (let t = 0; t < 30; t++) {
  try {
    const { metrics } = await cdp.send("Performance.getMetrics");
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    log(`t=${t * 2}s heap=${(m.JSHeapUsedSize / 1e6).toFixed(1)}MB nodes=${m.Nodes} listeners=${m.JSEventListeners} docs=${m.Documents} url=${page.url()}`);
    if (t % 5 === 0) await page.screenshot({ path: `${out}/shot-${t * 2}s.png`, timeout: 5000 }).catch((e) => log("shot failed", e.message));
  } catch (e) { log("sample failed", e.message); }
  await new Promise((r) => setTimeout(r, 2000));
}
await browser.close().catch(() => {});
