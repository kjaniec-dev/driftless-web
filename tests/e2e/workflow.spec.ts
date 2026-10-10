import fs from "node:fs/promises";
import { expect, test } from "./fixtures";
import {
  addInstrument,
  createPortfolio,
  FOUR_ETF,
  go,
  metric,
  openStart,
  readBuys,
  save,
  seedPortfolio,
  setCash,
  toNumber,
} from "./helpers";

test.describe("primary workflow", () => {
  test("create, edit, save, reload: the plan matches the Driftless CLI reference case", async ({
    page,
  }) => {
    await seedPortfolio(page, "IKE");

    // A full reload proves the data came back from IndexedDB, not from memory.
    await page.reload();
    await go(page, "/rebalance");
    await expect(page.getByRole("heading", { level: 1, name: "Rebalance" })).toBeVisible();

    expect(await readBuys(page)).toEqual({ SXR8: 0, EXUS: 0, IS3N: 200, EGLN: 300 });
    await expect(metric(page, "To spend")).toContainText("500.00");
    await expect(metric(page, "Left unspent")).toContainText("0.00");
    await expect(page.getByText(/not an order for a number of units/i)).toBeVisible();
  });

  test("the dashboard shows totals, allocation and drift", async ({ page }) => {
    await seedPortfolio(page, "IKE");
    await go(page, "/portfolio");
    await expect(page.getByRole("heading", { level: 1, name: "IKE" })).toBeVisible();
    await expect(metric(page, "Total value")).toContainText("10,500.00");
    await expect(metric(page, "Invested")).toContainText("10,000.00");
    // The donut chart also exposes a screen-reader table; target the instruments table.
    const instruments = page
      .getByRole("table")
      .filter({ has: page.getByRole("columnheader", { name: "Drift" }) });
    const sxr8 = instruments.getByRole("row", { name: /SXR8/ });
    await expect(sxr8).toContainText("34.0%");
    await expect(sxr8).toContainText("-4.0 pp");
  });

  test("changing the cash on the rebalance screen does not alter the saved portfolio", async ({
    page,
  }) => {
    await seedPortfolio(page, "IKE");
    await go(page, "/rebalance");
    await page.getByLabel("New cash to invest (PLN)").fill("1 000,50");
    const buys = await readBuys(page);
    expect(Object.values(buys).reduce((a, b) => a + b, 0)).toBeCloseTo(1000.5, 2);

    await page.getByRole("button", { name: /Use saved amount/ }).click();
    await expect(page.getByLabel("New cash to invest (PLN)")).toHaveValue("500");

    await page.getByLabel("New cash to invest (PLN)").fill("1000");
    await page.reload();
    await go(page, "/rebalance");
    await expect(page.getByLabel("New cash to invest (PLN)")).toHaveValue("500");
  });

  test("never spends more than the cash, even with awkward amounts", async ({ page }) => {
    await seedPortfolio(
      page,
      "Thirds",
      [
        { isin: "IE00BK5BQT80", label: "A", value: "0", weight: "33,33" },
        { isin: "IE00B4L5Y983", label: "B", value: "0", weight: "33,33" },
        { isin: "IE00B5BMR087", label: "C", value: "0", weight: "33,34" },
      ],
      "100",
    );
    await go(page, "/rebalance");
    const buys = await readBuys(page);
    const total = Object.values(buys).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(100);
    expect(total).toBeCloseTo(100, 2);
  });

  test("exports the plan as CSV", async ({ page }) => {
    await seedPortfolio(page, "IKE");
    await go(page, "/rebalance");
    await readBuys(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export plan (CSV)" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^driftless-plan-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await fs.readFile((await download.path()) as string, "utf8");
    expect(csv.startsWith("﻿isin,label,current_pln")).toBe(true);
    expect(csv).toContain("IE00BKM4GZ66,IS3N,1200.00,12.00,15.00,200.00");
  });

  test("converts a foreign-currency position exactly with a manual rate", async ({ page }) => {
    await createPortfolio(page, "FX");
    await addInstrument(page, 1, {
      isin: "IE00BK5BQT80",
      label: "VWCE",
      value: "280",
      weight: "100",
      currency: "EUR",
      rate: "4,2635",
    });
    await expect(page.getByText(/= PLN.1,193\.78/)).toBeVisible();
    await expect(page.getByText("Manual rate")).toBeVisible();
    await setCash(page, "0");
    await save(page);
    await go(page, "/portfolio");
    await expect(metric(page, "Invested")).toContainText("1,193.78");
  });

  test("the demo is never stored unless the user saves it", async ({ page }) => {
    await openStart(page);
    await page.getByRole("button", { name: "Try the demo" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Demo" })).toBeVisible();
    await page.reload();
    await go(page, "/");
    await expect(page.getByText(/No portfolios yet/)).toBeVisible();

    await page.getByRole("button", { name: "Try the demo" }).click();
    await page.getByRole("button", { name: "Save as my portfolio" }).click();
    // Saving is asynchronous: wait for the confirmation before reloading, or the reload can cut
    // the write short (this test failed intermittently on CI runners when it did not).
    await expect(page.getByText("Portfolio saved.")).toBeVisible();
    await expect(page.getByText(/Demo data\./)).toBeHidden();

    await page.reload();
    try {
      await expect(page.getByRole("heading", { name: "Demo" })).toBeVisible();
    } catch (error) {
      // If this ever fails again, leave evidence in the CI log instead of a bare timeout.
      const state = await page.evaluate(async () => ({
        url: location.href,
        text: document.body.innerText.slice(0, 400),
        activePortfolio: localStorage.getItem("driftless.activePortfolio"),
        databases: (await indexedDB.databases()).map((d) => `${d.name}@${d.version}`),
      }));
      console.log(`DEMO-RELOAD DIAGNOSTICS: ${JSON.stringify(state)}`);
      throw error;
    }
  });

  test("handles several portfolios independently", async ({ page }) => {
    await seedPortfolio(page, "IKE");
    await seedPortfolio(
      page,
      "IKZE",
      [{ isin: "IE00BK5BQT80", label: "VWCE", value: "1000", weight: "100" }],
      "100",
    );
    await go(page, "/rebalance");
    // One target, 100 PLN of cash: all of it goes to that instrument.
    expect(await readBuys(page)).toEqual({ VWCE: 100 });

    await page.getByLabel("Active portfolio").selectOption({ label: "IKE" });
    await expect(async () => expect(await readBuys(page)).toHaveProperty("EGLN", 300)).toPass();
  });

  test("mobile: the navigation drawer reaches every screen", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile layout only");
    await seedPortfolio(page, "IKE");
    for (const [link, heading] of [
      ["Rebalance", "Rebalance"],
      ["Data & privacy", "Data & privacy"],
      ["Start", "Welcome to Driftless"],
    ] as const) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page.getByRole("link", { name: link, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
  });

  test("numbers parse the Polish way", async () => {
    expect(toNumber("1 234,50 zł")).toBe(1234.5);
    expect(toNumber("PLN 1,234.50")).toBe(1234.5);
    expect(FOUR_ETF).toHaveLength(4);
  });
});
