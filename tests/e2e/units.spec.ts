import fs from "node:fs/promises";
import { expect, mockNbp, test } from "./fixtures";
import { addInstrument, createPortfolio, go, save, setCash } from "./helpers";

const A = "IE00BK5BQT80";
const B = "IE00B4L5Y983";

/** The card of instrument `n` in the editor. */
const card = (page: import("@playwright/test").Page, n: number) =>
  page.locator("li").filter({
    has: page.getByRole("heading", { name: `Instrument ${n}`, exact: true }),
  });

test.describe("whole-unit plan", () => {
  test("plans whole units from typed prices, deducting broker costs", async ({ page }) => {
    await createPortfolio(page, "Units");
    await addInstrument(page, 1, { isin: A, label: "AAA", value: "0", weight: "50" });
    await addInstrument(page, 2, { isin: B, label: "BBB", value: "0", weight: "50" });
    await setCash(page, "1000");
    await card(page, 1)
      .getByLabel(/^Price per unit/)
      .fill("100");
    await card(page, 2)
      .getByLabel(/^Price per unit/)
      .fill("50");
    await page.getByLabel("Commission (% of the order)").fill("0,39");
    await page.getByLabel("Minimum fee per order (PLN)").fill("5");
    await save(page);

    await go(page, "/rebalance");
    const table = page.getByRole("region", { name: "Whole-unit purchase plan" });
    await expect(table).toBeVisible();
    const units = (label: string) =>
      table.getByRole("row").filter({ hasText: label }).getByRole("cell").nth(1);
    // 500 PLN each is the ideal; with a 5 PLN minimum fee per order, 5 + 9 units fit in 1000 PLN.
    await expect(units("AAA")).toHaveText("5");
    await expect(units("BBB")).toHaveText("9");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export whole-unit plan (CSV)" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^driftless-units-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await fs.readFile((await download.path()) as string, "utf8");
    expect(csv).toContain("isin,label,units,unit_price,price_currency,cost_pln,fee_pln");
    expect(csv).toContain(`${A},AAA,5,100,PLN,500.00,5.00,500.00`);
  });

  test("converts a USD price with an NBP rate and keeps working offline afterwards", async ({
    page,
    context,
  }) => {
    await mockNbp(context, { USD: 4 });
    await createPortfolio(page, "USD price");
    await addInstrument(page, 1, { isin: A, label: "AAA", value: "0", weight: "100" });
    await setCash(page, "1000");
    await card(page, 1).getByLabel("Price currency").selectOption("USD");
    await card(page, 1)
      .getByLabel(/^Price per unit/)
      .fill("30");
    await page.getByRole("button", { name: "Fetch NBP rates" }).click();
    await expect(page.getByText("NBP rates updated: USD.")).toBeVisible();
    await expect(card(page, 1).getByLabel(/^Price rate/)).toHaveValue("4");
    await save(page);

    await go(page, "/rebalance");
    const table = page.getByRole("region", { name: "Whole-unit purchase plan" });
    // 30 USD x 4 = 120 PLN per unit: 8 units cost 960 PLN.
    await expect(
      table.getByRole("row").filter({ hasText: "AAA" }).getByRole("cell").nth(1),
    ).toHaveText("8");
    await expect(page.getByText("Left unspent").last()).toBeVisible();

    await context.setOffline(true);
    await page.getByLabel("New cash to invest (PLN)").fill("1300");
    await expect(
      table.getByRole("row").filter({ hasText: "AAA" }).getByRole("cell").nth(1),
    ).toHaveText("10");
  });

  test("warns about a missing price and an old one", async ({ page }) => {
    await createPortfolio(page, "Stale");
    await addInstrument(page, 1, { isin: A, label: "AAA", value: "0", weight: "50" });
    await addInstrument(page, 2, { isin: B, label: "BBB", value: "0", weight: "50" });
    await setCash(page, "1000");
    await card(page, 1)
      .getByLabel(/^Price per unit/)
      .fill("100");
    await card(page, 1).getByLabel("Price read on").fill("2020-01-02");
    await save(page);

    await go(page, "/rebalance");
    await expect(page.getByText(/BBB has no unit price/)).toBeVisible();
    await expect(page.getByText(/AAA: the price is from .*2020/)).toBeVisible();
  });
});
