import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addInstrument, go, openStart, seedPortfolio, uploadFile } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** Fails with a readable list of violations (rule, impact, and the offending elements). */
async function scan(page: Page, label: string): Promise<void> {
  // axe reads computed colours, which are in-between values while a CSS transition runs (more
  // often under CI load). Resting colours are what users see, so measure those.
  // A sticky bar (the editor's save bar) covers whatever happens to sit behind it at the current
  // scroll position, which is not a property of the page: lay it out in flow for the scan, and
  // `scroll-padding-bottom` (see styles.css) keeps focused fields clear of it in real use.
  await page.addStyleTag({
    content:
      "*,*::before,*::after{transition:none!important;animation:none!important}.sticky{position:static!important}",
  });
  await page.waitForTimeout(100);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const report = violations.map((v) => {
    const nodes = v.nodes
      .slice(0, 4)
      .map(
        (n) =>
          `    ${n.target.join(" ")}\n      ${n.html.slice(0, 140)}\n      ${(n.any[0]?.message ?? n.all[0]?.message ?? "").slice(0, 160)}`,
      );
    return `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})\n${nodes.join("\n")}`;
  });
  expect(report, `accessibility violations on "${label}"`).toEqual([]);
}

const SCHEMES = ["light", "dark"] as const;

for (const scheme of SCHEMES) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test("start: empty, with the first-use notice", async ({ page }) => {
      await openStart(page);
      await scan(page, "start/empty");
    });

    test("start: new-portfolio dialog", async ({ page }) => {
      await openStart(page);
      await page.getByRole("button", { name: "New portfolio" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await scan(page, "start/new-dialog");
    });

    test("start: portfolio list and delete confirmation", async ({ page }) => {
      await seedPortfolio(page, "IKE");
      await openStart(page);
      await scan(page, "start/list");
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await scan(page, "start/delete-dialog");
    });

    test("portfolio dashboard", async ({ page }) => {
      await seedPortfolio(page, "IKE");
      await go(page, "/portfolio");
      await expect(page.getByRole("heading", { level: 1, name: "IKE" })).toBeVisible();
      await scan(page, "portfolio");
    });

    test("editor: with instruments, a foreign-currency row and validation errors", async ({
      page,
    }) => {
      await seedPortfolio(page, "IKE");
      await go(page, "/edit");
      await addInstrument(page, 5, {
        isin: "IE00BK5BQT80",
        label: "VWCE",
        value: "100",
        weight: "10",
        currency: "EUR",
        rate: "4,25",
      });
      await scan(page, "editor/filled");
      await page.getByRole("button", { name: "Save changes" }).click(); // weights != 100% -> errors shown
      await expect(page.getByText("Fix these before saving")).toBeVisible();
      await scan(page, "editor/errors");
    });

    test("rebalance: plan with warnings and the invalid-amount state", async ({ page }) => {
      await seedPortfolio(
        page,
        "Held",
        [
          { isin: "IE00BK5BQT80", label: "VWCE", value: "5000", weight: "50" },
          { isin: "IE00B4L5Y983", label: "IWDA", value: "3000", weight: "50" },
          { isin: "IE00B5BMR087", label: "SXR8", value: "2000", weight: "0" },
        ],
        "1000",
      );
      await go(page, "/rebalance");
      await expect(page.getByRole("table").first()).toBeVisible();
      await scan(page, "rebalance/plan");
      await page.getByLabel("New cash to invest (PLN)").fill("abc");
      await scan(page, "rebalance/invalid");
    });

    test("editor: unit price in a foreign currency and broker costs", async ({ page }) => {
      await seedPortfolio(page, "IKE");
      await go(page, "/edit");
      await page.getByLabel("Price currency").first().selectOption("EUR");
      await page
        .getByLabel(/^Price per unit/)
        .first()
        .fill("118,32");
      await page.getByLabel("Commission (% of the order)").fill("0,39");
      await expect(page.getByLabel(/^Price rate/).first()).toBeVisible();
      await scan(page, "editor/prices");
    });

    test("rebalance: whole-unit plan with price warnings", async ({ page }) => {
      await openStart(page);
      await page.getByRole("button", { name: "Try the demo" }).click();
      await go(page, "/rebalance");
      await expect(page.getByRole("region", { name: "Whole-unit purchase plan" })).toBeVisible();
      await scan(page, "rebalance/units");
    });

    test("data & privacy: import preview and error", async ({ page }) => {
      await seedPortfolio(page, "IKE");
      await go(page, "/data");
      await expect(page.getByRole("heading", { level: 1, name: "Data & privacy" })).toBeVisible();
      await scan(page, "data");
      await uploadFile(page, "bad.json", "{nope");
      await expect(page.getByText("The file is not valid JSON.")).toBeVisible();
      await scan(page, "data/error");
    });

    test("privacy policy", async ({ page }) => {
      await page.goto("/#/privacy");
      await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
      await scan(page, "privacy");
    });

    test("demo mode banner", async ({ page }) => {
      await openStart(page);
      await page.getByRole("button", { name: "Try the demo" }).click();
      await expect(page.getByText(/Demo data/)).toBeVisible();
      await scan(page, "demo");
    });

    test("polish interface", async ({ browser }) => {
      const context = await browser.newContext({ locale: "pl-PL", colorScheme: scheme });
      const page = await context.newPage();
      await page.goto("/#/");
      await page.getByRole("button", { name: "Wypróbuj demo" }).click();
      await go(page, "/rebalance");
      await expect(page.getByRole("table").first()).toBeVisible();
      await scan(page, "pl/rebalance");
      await context.close();
    });
  });
}
