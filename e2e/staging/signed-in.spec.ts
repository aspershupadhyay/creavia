// Past sign-in, on the staging cloud: a person signs in with email and password and gets their own session; a wrong
// password opens nothing; signing out ends it; and two people of one studio see the same workspace. Runs at full width
// and 390 px. Skipped (with the reason) until staging and its test accounts are set (accounts.ts).
import { expect, expectNoSidewaysScroll, test } from "../fixtures";
import { MEMBER, missing, OWNER, signIn } from "./accounts";

test.skip(!!missing, missing);

test("the owner signs in, lands where they were going and is who the studio says", async ({ page, pageErrors }) => {
  if (!OWNER) return;
  await signIn(page, OWNER);
  const me = await (await page.request.get("/api/ws/me")).json();
  expect(me.user?.email).toBe(OWNER.email);
  await expectNoSidewaysScroll(page);
  expect(pageErrors).toEqual([]);
});

test("a wrong password opens nothing", async ({ page }) => {
  if (!OWNER) return;
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill("not-the-password-at-all");
  const tried = page.waitForResponse((r) => r.url().endsWith("/api/login") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Continue" }).click();
  expect((await tried).status()).toBe(401);
  await expect(page.locator("#l-err")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/dash/posts")).status()).toBe(401);
});

test("signing out ends the session", async ({ page, context }) => {
  if (!OWNER) return;
  await signIn(page, OWNER);
  expect((await context.cookies()).some((c) => c.name === "vb_session")).toBe(true);
  expect((await page.request.delete("/api/login")).ok()).toBe(true);
  expect((await context.cookies()).some((c) => c.name === "vb_session")).toBe(false);
  await page.goto("/posts");
  await expect(page).toHaveURL(/\/login\?next=%2Fposts$/);
});

test("two people of one studio see the same workspace", async ({ browser }) => {
  if (!OWNER || !MEMBER) return;
  const owner = await (await browser.newContext()).newPage();
  const member = await (await browser.newContext()).newPage();
  await signIn(owner, OWNER);
  await signIn(member, MEMBER);

  const title = `e2e ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;
  const made = await owner.request.post("/api/ws/rows/posts", { data: { data: { title, status: "idea" } } });
  expect(made.ok(), await made.text()).toBe(true);
  const id = (await made.json()).$id as string;
  try {
    const q = encodeURIComponent(JSON.stringify([{ method: "equal", attribute: "title", values: [title] }]));
    const seen = await (await member.request.get(`/api/ws/rows/posts?q=${q}`)).json();
    expect(seen.rows.map((r: { $id: string }) => r.$id)).toEqual([id]);
  } finally {
    await owner.request.delete(`/api/ws/rows/posts/${id}`); // leave staging as it was
  }
  await owner.context().close();
  await member.context().close();
});
