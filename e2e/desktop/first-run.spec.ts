// The desktop app's first minutes, in its web view opened outside the Tauri window: Vee's welcome, the setup wizard,
// connecting a studio (both say plainly when they need the app), and the guide, reachable before signing in
// (docs/FEEDBACK.md). What needs Rust (the computer check, the sign-in itself) is covered by --self-check and the
// app-open tests in install.yml.
import { expect, expectNoSidewaysScroll, test } from "../fixtures";

test("opens on Vee's welcome, with no errors", async ({ page, pageErrors }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { name: /Hi, I.m Vee/ })).toBeVisible();
  await expectNoSidewaysScroll(page);
  expect(pageErrors).toEqual([]);
});

test("setting up starts with goals, then says the computer check needs the app", async ({ page, pageErrors }) => {
  await page.goto("/welcome");
  await page.getByRole("button", { name: /set it up/ }).click();
  await expect(page.getByRole("heading", { name: "What do you want to make?" })).toBeVisible();
  await expectNoSidewaysScroll(page);

  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByText("Open the Creavia app to look at this computer.")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("connecting a studio says plainly that it needs the app", async ({ page, pageErrors }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Connect your studio" })).toBeVisible();
  await expectNoSidewaysScroll(page);

  // an empty form is stopped by the browser first; filled in, it reaches the app's own check
  await page.getByLabel("Studio address").fill("studio.example.com");
  await page.getByLabel("Email").fill("ana@example.com");
  await page.getByLabel("Password", { exact: true }).fill("a-long-password");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText("Open the Creavia app to connect.")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("the guide opens before signing in", async ({ page, pageErrors }) => {
  await page.goto("/welcome");
  await page.getByRole("link", { name: "Read the guide first" }).click();
  await expect(page).toHaveURL(/\/guide/);
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expectNoSidewaysScroll(page);
  expect(pageErrors).toEqual([]);
});
