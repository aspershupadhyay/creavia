// The cloud's front door, end to end: a signed-out visit is sent to sign in and comes back where it was going; the
// form says what's wrong next to the field; a wrong key is refused; the right one starts a safe session. Runs with no
// storage attached, so only the master key can sign in (accounts need Postgres) and nothing past sign-in can load.
import { expect, expectNoSidewaysScroll, test } from "../fixtures";
import { TEST_MCP_TOKEN } from "../env";

test("a signed-out visit goes to sign in and keeps where it was going", async ({ page, pageErrors }) => {
  await page.goto("/posts");
  await expect(page).toHaveURL(/\/login\?next=%2Fposts$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expectNoSidewaysScroll(page);
  expect(pageErrors).toEqual([]);
});

test("the form explains a bad email or a short password next to the field", async ({ page }) => {
  await page.goto("/login");
  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password");

  await email.fill("not-an-email");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#l-err")).toHaveText("Enter your email address.");
  await expect(email).toHaveAttribute("aria-invalid", "true");

  await email.fill("ana@example.com");
  await password.fill("short");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#l-err")).toHaveText("Enter your password (at least 8 characters).");
  await expect(password).toHaveAttribute("aria-invalid", "true");
});

test("a wrong access token is refused and nothing opens", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Use an access token" }).click();
  await page.getByLabel("Access token").fill("not-the-right-key-at-all-not-it");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#l-err")).toHaveText("That token didn't match.");
  await expect(page).toHaveURL(/\/login/);

  const res = await page.request.get("/api/dash/posts");
  expect(res.status()).toBe(401);
});

test("the right access token starts a session the page's scripts can't read", async ({ page, context }) => {
  // Only the sign-in itself: the next page also checks "sign out everywhere", which lives in storage, and these tests
  // run without any, so it fails closed and sends you back here. The full round trip waits for the staging cloud.
  await page.goto("/login?next=%2Fposts");
  await page.getByRole("button", { name: "Use an access token" }).click();
  await page.getByLabel("Access token").fill(TEST_MCP_TOKEN);
  const signIn = page.waitForResponse((r) => r.url().endsWith("/api/login") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Continue" }).click();
  expect((await signIn).status()).toBe(200);

  const session = (await context.cookies()).find((c) => c.name === "vb_session");
  expect(session, "a session cookie was set").toBeDefined();
  expect(session?.httpOnly, "scripts can't read it").toBe(true);
  expect(session?.secure, "it is only sent over HTTPS").toBe(true);
  expect(session?.sameSite).toBe("Lax");
  expect(session?.value, "it never holds the key itself").not.toContain(TEST_MCP_TOKEN);
});

for (const path of ["/privacy", "/terms", "/data-deletion"]) {
  test(`${path} is public and reads well on any screen`, async ({ page, pageErrors }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expectNoSidewaysScroll(page);
    expect(pageErrors).toEqual([]);
  });
}
