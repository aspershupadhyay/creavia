// The desktop app's first minutes, in its web view opened outside the Tauri window: Vee's welcome, the setup wizard,
// signing in (the shared screen, no address needed; both say plainly when they need the app), and the guide, reachable before signing in
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

test("signing in needs no address: the shared sign-in screen, with your own studio one click away", async ({
  page,
  pageErrors,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Studio address")).toHaveCount(0);
  await expectNoSidewaysScroll(page);

  // the form checks itself first; filled in, it reaches the app's own check (outside the app, it says so)
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#cv-err")).toHaveText("Enter your email address.");
  await page.getByLabel("Email").fill("ana@example.com");
  await page.getByLabel("Password", { exact: true }).fill("a-long-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#cv-err")).toHaveText("Open the Creavia app to sign in.");

  // creating an account is the same screen
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // the advanced way: your own studio's address, then the same sign-in for it
  await page.getByRole("button", { name: "Use your own studio" }).click();
  await expect(page.getByRole("heading", { name: "Use your own studio" })).toBeVisible();
  await page.getByLabel("Studio address").fill("studio.example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#cv-url-err")).toHaveText("Open the Creavia app to connect.");
  await expectNoSidewaysScroll(page);
  await page.getByRole("button", { name: "Use Creavia instead" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
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
