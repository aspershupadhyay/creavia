// The staging cloud and its two test accounts, from the environment (never committed): STAGING_URL, E2E_OWNER_EMAIL,
// E2E_OWNER_PASSWORD, E2E_MEMBER_EMAIL, E2E_MEMBER_PASSWORD. cloud/scripts/deploy.mjs --staging makes them.
import { expect, type Page } from "@playwright/test";

/** Only the staging Worker: these tests write posts, so they must never run against a real studio. */
function stagingUrl() {
  const url = (process.env.STAGING_URL ?? "").trim().replace(/\/+$/, "");
  if (url && !/^https:\/\/creavia-cloud-staging\.[a-z0-9-]+\.workers\.dev$/.test(url) && !process.env.STAGING_URL_ANY) {
    throw new Error(
      `STAGING_URL must be the creavia-cloud-staging Worker (https://creavia-cloud-staging.<you>.workers.dev), not ${url}`,
    );
  }
  return url;
}
export const STAGING_URL = stagingUrl();

export type Account = { email: string; password: string };
const account = (role: "OWNER" | "MEMBER"): Account | null => {
  const email = process.env[`E2E_${role}_EMAIL`],
    password = process.env[`E2E_${role}_PASSWORD`];
  return email && password ? { email, password } : null;
};
export const OWNER = account("OWNER");
export const MEMBER = account("MEMBER");

/** Why these tests can't run here, or "" when they can. */
export const missing = !STAGING_URL
  ? "STAGING_URL is not set"
  : !OWNER || !MEMBER
    ? "the E2E_* test accounts are not set"
    : "";

/** Signs in through the real form and waits for the page it was sent to. */
export async function signIn(page: Page, who: Account, next = "/posts") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[/?]/g, "\\$&")}$`));
}
