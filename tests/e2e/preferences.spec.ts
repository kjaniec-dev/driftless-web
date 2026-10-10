import { expect, test } from "./fixtures";
import { go, openStart } from "./helpers";

test.describe("language and theme", () => {
  test("language switches live and is remembered", async ({ page }) => {
    await openStart(page);
    await page.getByRole("tab", { name: "PL" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Witaj w Driftless" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Witaj w Driftless" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "pl");
    await page.getByRole("tab", { name: "EN" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Welcome to Driftless" }),
    ).toBeVisible();
  });

  test("a Polish browser gets the Polish interface by default", async ({ browser }) => {
    const context = await browser.newContext({ locale: "pl-PL" });
    const page = await context.newPage();
    await page.goto("/#/");
    await expect(page.getByRole("heading", { level: 1, name: "Witaj w Driftless" })).toBeVisible();
    await go(page, "/data");
    await expect(page.getByRole("heading", { level: 1, name: "Dane i prywatność" })).toBeVisible();
    await context.close();
  });

  test("dark mode follows the system on first visit, can be toggled, and is remembered without a flash", async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    // Record the class at DOMContentLoaded, i.e. before the app has rendered anything.
    await page.addInitScript(() =>
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as Record<string, unknown>).__initialDark =
          document.documentElement.classList.contains("dark");
      }),
    );
    await page.goto("/#/");
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(
      await page.evaluate(() => (window as unknown as Record<string, unknown>).__initialDark),
    ).toBe(true);

    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/); // explicit choice beats the system setting
    await context.close();
  });
});
