import { expect, test } from "./fixtures";
import { createPortfolio, go, openStart, seedPortfolio } from "./helpers";

test.describe("keyboard and screen-reader support", () => {
  test("a skip link jumps past the navigation to the page heading", async ({ page }) => {
    await openStart(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("button", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible(); // shown on focus, hidden otherwise
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  });

  test("the whole create-and-save flow works without a mouse, and focus never gets lost", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "uses the desktop sidebar");
    await openStart(page);
    await page.getByRole("button", { name: "New portfolio" }).focus();
    await page.keyboard.press("Enter");

    // The dialog takes focus; typing and Enter create the portfolio.
    await expect(page.getByRole("dialog").getByLabel("Name")).toBeFocused();
    await page.keyboard.type("Klawiatura");
    await page.keyboard.press("Enter");
    // After the new screen appears, focus is on its heading (not lost at the top of the page).
    await expect(
      page.getByRole("heading", { level: 1, name: "Instruments & targets" }),
    ).toBeFocused();

    // Sidebar navigation by keyboard also lands on the new heading.
    await page.getByRole("link", { name: "Data & privacy" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Data & privacy" })).toBeFocused();
  });

  test("Escape closes a dialog and returns focus to the control that opened it", async ({
    page,
  }) => {
    await seedPortfolio(page, "IKE");
    await openStart(page);

    const open = page.getByRole("button", { name: "New portfolio" });
    await open.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(open).toBeFocused();

    const del = page.getByRole("button", { name: "Delete", exact: true });
    await del.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toContainText("Delete portfolio?");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(del).toBeFocused();
  });

  test("focus stays trapped inside an open dialog", async ({ page }) => {
    await openStart(page);
    await page.getByRole("button", { name: "New portfolio" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Name")).toBeFocused();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
  });

  test("invalid fields are exposed to assistive technology with their error message", async ({
    page,
  }) => {
    await createPortfolio(page, "P");
    await page.getByLabel("Cash to invest (PLN)").fill("abc");
    const cash = page.getByLabel("Cash to invest (PLN)");
    await expect(cash).toHaveAttribute("aria-invalid", "true");
    const describedBy = await cash.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const message = await page.locator(`#${describedBy?.split(" ").pop()}`).textContent();
    expect(message).toContain("non-negative");

    await go(page, "/rebalance");
  });

  test("results and problems are announced (alerts and status messages are live regions)", async ({
    page,
  }) => {
    await seedPortfolio(page, "IKE");
    await go(page, "/rebalance");
    await page.getByLabel("New cash to invest (PLN)").fill("abc");
    // The error text is linked to the field...
    await expect(page.getByLabel("New cash to invest (PLN)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await page.getByLabel("New cash to invest (PLN)").fill("500");
    // ...and the plan's warning is an alert.
    await expect(
      page.getByRole("alert").filter({ hasText: "limited by the available cash" }),
    ).toBeVisible();

    await go(page, "/edit");
    await page.getByLabel("Portfolio name").fill("Renamed");
    await page.getByRole("button", { name: "Save changes" }).click();
    // The "saved" toast must be announced without moving focus: a live region carries the text.
    await expect(
      page
        .locator('[aria-live], [role="status"], [role="alert"]')
        .filter({ hasText: "Portfolio saved." }),
    ).not.toHaveCount(0);
  });

  test("the language switcher and theme toggle work from the keyboard", async ({ page }) => {
    await openStart(page);
    await page.getByRole("tab", { name: "PL" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Witaj w Driftless" })).toBeVisible();
    await page.getByRole("button", { name: "Przełącz tryb ciemny" }).focus();
    await page.keyboard.press("Space");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

test.describe("reflow and zoom (WCAG 1.4.10, 1.4.4)", () => {
  const ROUTES = ["/", "/portfolio", "/edit", "/rebalance", "/data"];

  test("no page-level horizontal scrolling at 320 px wide on any screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await seedPortfolio(page, "IKE");
    for (const route of ROUTES) {
      await go(page, route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(0);
    }
  });

  test("text can be enlarged: the rebalance screen still works at 200% text size", async ({
    page,
  }) => {
    await seedPortfolio(page, "IKE");
    await go(page, "/rebalance");
    await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
    await expect(page.getByLabel("New cash to invest (PLN)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Export plan (CSV)" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
