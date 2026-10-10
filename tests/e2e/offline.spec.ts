import { expect, test } from "./fixtures";
import { addInstrument, go, readBuys, save, seedPortfolio, setCash } from "./helpers";

test.describe("offline", () => {
  test("once loaded, editing, calculating and exporting work with no network at all", async ({
    page,
    context,
    audit,
  }) => {
    // Offline, the browser itself may retry the favicon; that is not the app reaching out.
    audit.allowConsole.push(/ERR_INTERNET_DISCONNECTED/);
    const appRequests = () =>
      audit.requests.filter((r) => /^https?:/.test(r.url()) && !r.url().endsWith("/favicon.svg"))
        .length;
    await seedPortfolio(page, "IKE");
    await go(page, "/rebalance");
    await readBuys(page);

    await context.setOffline(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    const before = appRequests();

    // Edit and save.
    await go(page, "/edit");
    await setCash(page, "1000");
    await addInstrument(page, 5, { isin: "IE00BK5BQT80", label: "VWCE", value: "0", weight: "0" });
    await save(page);

    // Calculate.
    await go(page, "/rebalance");
    const buys = await readBuys(page);
    expect(Object.values(buys).reduce((a, b) => a + b, 0)).toBeCloseTo(1000, 2);

    // Export the plan and a backup.
    const [csv] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export plan (CSV)" }).click(),
    ]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
    await go(page, "/data");
    const [backup] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export full backup (JSON)" }).click(),
    ]);
    expect(backup.suggestedFilename()).toMatch(/\.json$/);

    // None of that touched the network.
    expect(appRequests()).toBe(before);
    await context.setOffline(false);
  });

  test("a failed NBP lookup is explained and never blocks manual planning", async ({
    page,
    context,
    audit,
  }) => {
    audit.allowConsole.push(/Failed to load resource|ERR_/);
    await seedPortfolio(page, "FX", [
      {
        isin: "IE00BK5BQT80",
        label: "VWCE",
        value: "100",
        weight: "100",
        currency: "EUR",
        rate: "4,25",
      },
    ]);
    await go(page, "/edit");
    await context.setOffline(true);

    await page.getByRole("button", { name: "Fetch NBP rates" }).click();
    await expect(page.getByText(/NBP is unavailable right now/)).toBeVisible();
    // The manual rate is untouched, the editor is still usable, and the plan still computes.
    await expect(page.getByLabel(/^Rate \(PLN per 1 EUR\)/)).toHaveValue("4.25"); // stored canonically
    await expect(page.getByText("Manual rate")).toBeVisible();
    await setCash(page, "50");
    await save(page);
    await go(page, "/rebalance");
    expect(await readBuys(page)).toEqual({ VWCE: 50 });
    await context.setOffline(false);
  });
});
