// Shared checks for every end-to-end test: the page throws no errors, and nothing is wider than the screen.
import { test as base, expect, type Page } from "@playwright/test";

/** Errors the page threw or logged while the test ran; each test ends by expecting none. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`uncaught: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    await use(errors);
  },
});

/** Nothing on the page is wider than the window: no sideways scrolling, at 390 px least of all. */
export async function expectNoSidewaysScroll(page: Page) {
  const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll, "the page scrolls sideways").toBeLessThanOrEqual(width);
}

export { expect };
