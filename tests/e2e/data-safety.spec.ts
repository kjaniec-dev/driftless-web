import { expect, test } from "./fixtures";
import {
  exportBackup,
  go,
  metric,
  openStart,
  readBuys,
  readDownload,
  seedPortfolio,
  uploadFile,
  wipeIndexedDb,
} from "./helpers";

// biome-ignore lint/suspicious/noExplicitAny: cases below each corrupt a different part of a JSON document
type Json = any;

const CLI_SAMPLE = {
  base_currency: "PLN",
  as_of: "2026-06-03",
  cash_pln: 5000,
  positions: [
    { isin: "IE00BK5BQT80", value_pln: 45000, label: "VWCE" },
    { isin: "IE00B4L5Y983", value_pln: 30000, label: "IWDA" },
  ],
  target: [
    { isin: "IE00BK5BQT80", weight: 0.6 },
    { isin: "IE00B4L5Y983", weight: 0.4 },
  ],
};

test.describe("recovering and protecting data", () => {
  test("export, lose the browser data, import: everything is restored", async ({ page, audit }) => {
    // Dexie logs this (benignly) when the database is deleted under an open app, as we do below.
    audit.allowConsole.push(/Another connection wants to delete database/);
    await seedPortfolio(page, "IKE");
    await seedPortfolio(
      page,
      "IKZE",
      [{ isin: "IE00BK5BQT80", label: "VWCE", value: "2500,50", weight: "100" }],
      "10",
    );
    const backup = await exportBackup(page);

    const parsed = JSON.parse(backup);
    expect(parsed.format).toBe("driftless-web");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.portfolios.map((p: { name: string }) => p.name).sort()).toEqual(["IKE", "IKZE"]);

    // The browser "forgets" everything (cleared site data / evicted storage).
    await wipeIndexedDb(page);
    await page.reload();
    await openStart(page);
    await expect(page.getByText(/No portfolios yet/)).toBeVisible();

    await go(page, "/data");
    await uploadFile(page, "backup.json", backup);
    await expect(page.getByText(/Preview: backup\.json/)).toBeVisible();
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText("Imported 2 portfolio(s).")).toBeVisible();

    await go(page, "/");
    await expect(page.getByRole("heading", { name: "IKE", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "IKZE" })).toBeVisible();

    // And the calculations are identical to before the loss.
    await page.getByLabel("Active portfolio").selectOption({ label: "IKE" });
    await go(page, "/rebalance");
    expect(await readBuys(page)).toEqual({ SXR8: 0, EXUS: 0, IS3N: 200, EGLN: 300 });

    // Re-exporting yields the same data (ids, values, timestamps).
    expect(JSON.parse(await exportBackup(page)).portfolios).toEqual(parsed.portfolios);
  });

  test("malformed or hostile files are refused and change nothing", async ({ page }) => {
    await seedPortfolio(page, "IKE");
    const good = JSON.parse(await exportBackup(page));

    const bad = (mutate: (b: Json) => void) => {
      const b: Json = structuredClone(good);
      mutate(b);
      return JSON.stringify(b);
    };
    const cases: Array<[string, string, RegExp]> = [
      ["not json", "{nope", /not valid JSON/],
      ["wrong document", JSON.stringify({ hello: "world" }), /neither a Driftless backup/],
      ["newer version", bad((b) => (b.schemaVersion = 99)), /newer version of Driftless/],
      ["negative money", bad((b) => (b.portfolios[0].cashPln = "-5")), /unexpected structure/],
      ["unknown field", bad((b) => (b.portfolios[0].evil = "x")), /unexpected structure/],
      [
        "weights not 100%",
        bad((b) => (b.portfolios[0].positions[0].targetWeight = "0.9")),
        /portfolio in the file is invalid/,
      ],
      [
        "duplicate ISIN",
        bad((b) => (b.portfolios[0].positions[1].isin = b.portfolios[0].positions[0].isin)),
        /portfolio in the file is invalid/,
      ],
      [
        "prototype pollution",
        '{"format":"driftless-web","__proto__":{"x":1}}',
        /unexpected structure/,
      ],
      ["oversized", `"${"x".repeat(5 * 1024 * 1024)}"`, /larger than 5 MB/],
    ];

    await go(page, "/data");
    for (const [name, content, message] of cases) {
      await uploadFile(page, "bad.json", content);
      await expect(page.getByRole("alert").filter({ hasText: message }), name).toBeVisible();
    }

    // Nothing was imported or altered.
    expect(JSON.parse(await exportBackup(page)).portfolios).toEqual(good.portfolios);
  });

  test("replacing existing portfolios needs an explicit confirmation", async ({ page }) => {
    await seedPortfolio(page, "IKE");
    const backup = JSON.parse(await exportBackup(page));
    backup.portfolios[0].cashPln = "999";
    backup.portfolios[0].updatedAt = "2099-01-01T00:00:00.000Z";

    await go(page, "/data");
    await uploadFile(page, "newer.json", JSON.stringify(backup));
    await page.getByLabel("If a portfolio already exists").selectOption("replace");
    await expect(page.getByText("Replaces the local one")).toBeVisible();

    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Overwrite existing portfolios?");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await go(page, "/rebalance");
    await expect(page.getByLabel("New cash to invest (PLN)")).toHaveValue("500");

    await go(page, "/data");
    await uploadFile(page, "newer.json", JSON.stringify(backup));
    await page.getByLabel("If a portfolio already exists").selectOption("replace");
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Overwrite" }).click();
    await expect(page.getByText("Imported 1 portfolio(s).")).toBeVisible();
    await go(page, "/rebalance");
    await expect(page.getByLabel("New cash to invest (PLN)")).toHaveValue("999");
  });

  test("'keep both' never overwrites anything", async ({ page }) => {
    await seedPortfolio(page, "IKE");
    const backup = await exportBackup(page);
    await go(page, "/data");
    await uploadFile(page, "same.json", backup);
    await page.getByLabel("If a portfolio already exists").selectOption("copy");
    await expect(page.getByText("Added as a copy")).toBeVisible();
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText("Imported 1 portfolio(s).")).toBeVisible();

    const names = JSON.parse(await exportBackup(page))
      .portfolios.map((p: { name: string }) => p.name)
      .sort();
    expect(names).toEqual(["IKE", "IKE (import)"]);
  });

  test("Driftless CLI portfolio.json: import, compute, export back unchanged", async ({ page }) => {
    await openStart(page);
    await go(page, "/data");
    await uploadFile(page, "sample_portfolio.json", JSON.stringify(CLI_SAMPLE));
    await expect(page.getByText(/CLI portfolio file detected/)).toBeVisible();
    await page.getByRole("button", { name: "Import as new portfolio" }).click();
    await expect(page.getByText("Imported 1 portfolio(s).")).toBeVisible();

    await go(page, "/rebalance");
    // The CLI's own reference case: 5000 PLN of cash into a 60/40 portfolio.
    expect(await readBuys(page)).toEqual({ VWCE: 3000, IWDA: 2000 });

    await go(page, "/data");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /as CLI portfolio\.json/ }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("portfolio.json");
    expect(JSON.parse(await readDownload(download))).toEqual(CLI_SAMPLE);
  });

  test("two tabs: the editor warns when the portfolio changed elsewhere", async ({
    page,
    context,
  }) => {
    await seedPortfolio(page, "IKE");
    await go(page, "/edit");
    await expect(page.getByLabel("Cash to invest (PLN)")).toHaveValue("500");

    const other = await context.newPage();
    await other.goto("/#/edit");
    await other.getByLabel("Cash to invest (PLN)").fill("750");
    await other.getByRole("button", { name: "Save changes" }).click();
    await expect(other.getByRole("button", { name: "Save changes" })).toBeDisabled();

    await expect(page.getByText(/changed in another tab or window/)).toBeVisible();
    await page.getByRole("button", { name: "Load the saved version" }).click();
    await expect(page.getByLabel("Cash to invest (PLN)")).toHaveValue("750");
    await expect(page.getByText(/changed in another tab or window/)).toBeHidden();
  });

  test("deleting asks first, and 'delete everything' really empties the device", async ({
    page,
  }) => {
    await seedPortfolio(page, "IKE");
    await openStart(page);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Delete portfolio?");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "IKE" })).toBeVisible();

    await go(page, "/data");
    await page.getByRole("button", { name: "Delete all data on this device" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete all data on this device" })
      .click();
    await expect(page.getByText("All data deleted.")).toBeVisible();
    await go(page, "/");
    await expect(page.getByText(/No portfolios yet/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/No portfolios yet/)).toBeVisible();
  });

  test("copes with a large portfolio (200 instruments)", async ({ page }) => {
    await openStart(page);
    const now = "2026-10-10T00:00:00.000Z";
    const n = 200;
    const positions = Array.from({ length: n }, (_, i) => ({
      isin: `IE00B5BMR${String(i).padStart(3, "0")}0`.slice(0, 12),
      label: `ETF${i}`,
      targetWeight: "0.005",
      valuation: { mode: "manual", valuePln: String(100 + (i % 17) * 13) },
    }));
    const backup = {
      format: "driftless-web",
      schemaVersion: 1,
      exportedAt: now,
      portfolios: [
        {
          id: "big",
          name: "Big",
          baseCurrency: "PLN",
          cashPln: "12345.67",
          positions,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    await go(page, "/data");
    await uploadFile(page, "big.json", JSON.stringify(backup));
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText("Imported 1 portfolio(s).")).toBeVisible();

    const started = Date.now();
    await go(page, "/rebalance");
    await expect(page.locator("tbody tr")).toHaveCount(n);
    const renderMs = Date.now() - started;
    expect(renderMs, `rendering ${n} rows took ${renderMs} ms`).toBeLessThan(5000);
    const buys = await readBuys(page);
    expect(Object.keys(buys)).toHaveLength(n);
    expect(Object.values(buys).reduce((a, b) => a + b, 0)).toBeCloseTo(12345.67, 2);
    await expect(metric(page, "To spend")).toContainText("12,345.67");
  });
});
