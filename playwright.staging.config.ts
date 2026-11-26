// End-to-end tests past sign-in, against the staging cloud (docs/adr/0004-staging.md): a real Worker, database and
// bucket, signed in as its two test accounts. `npm run e2e:staging` with STAGING_URL and the E2E_* sign-ins set (cloud/
// scripts/deploy.mjs --staging prints them); the Cloud workflow runs it after each staging deploy, before production.
// Nothing is started locally, and never against production: the address must be the staging Worker's.
import { defineConfig, devices } from "@playwright/test";
import { STAGING_URL } from "./e2e/staging/accounts";

export default defineConfig({
  testDir: "e2e/staging",
  fullyParallel: false, // two people share one staging workspace: one test at a time keeps their steps apart
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { trace: "off", screenshot: "only-on-failure", baseURL: STAGING_URL },
  projects: [
    { name: "staging-wide", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "staging-phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
});
