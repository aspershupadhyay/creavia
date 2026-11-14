// End-to-end tests (Playwright): the core flows in a real browser, at full width and at phone width (390 px), for the
// cloud (a production `next build`, signed out, no storage attached) and the desktop's web view (its Vite build, opened
// outside the Tauri window). `npm run e2e`; CI runs it in .github/workflows/checks.yml. docs/adr/0002-end-to-end-tests.md
import { defineConfig, devices } from "@playwright/test";
import { CLOUD, DESKTOP, TEST_MCP_TOKEN } from "./e2e/env";

const wide = { viewport: { width: 1280, height: 800 } };
const phone = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } };

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // a flaky test is a bug to fix, not to retry (docs/ENGINEERING.md)
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { trace: "off", screenshot: "only-on-failure" },
  projects: [
    { name: "cloud-wide", testDir: "e2e/cloud", use: { ...devices["Desktop Chrome"], ...wide, baseURL: CLOUD } },
    { name: "cloud-phone", testDir: "e2e/cloud", use: { ...phone, baseURL: CLOUD } },
    { name: "desktop-wide", testDir: "e2e/desktop", use: { ...devices["Desktop Chrome"], ...wide, baseURL: DESKTOP } },
    { name: "desktop-phone", testDir: "e2e/desktop", use: { ...phone, baseURL: DESKTOP } },
  ],
  webServer: [
    {
      // a production build: what people get, not the dev server. Built first by `npm run e2e` (or CI).
      command: "npx next start -p 3100",
      cwd: "cloud",
      url: `${CLOUD}/login`,
      env: { MCP_TOKEN: TEST_MCP_TOKEN },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "npx vite preview --port 4173 --strictPort",
      cwd: "desktop",
      url: DESKTOP,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
