import { expect, mockNbp, test } from "./fixtures";
import { addInstrument, createPortfolio, go, save, setCash } from "./helpers";

// NOTE: the live NBP API is not reachable from the environments this suite runs in, so the
// responses below are fabricated in NBP's documented table-A format (see mockNbp). These tests
// verify how the app behaves around the API, not that the live API behaves this way.
test.describe("NBP exchange rates (mocked network)", () => {
  test("fetches rates, stores them with the publication date, and asks once per currency", async ({
    page,
    context,
    audit,
  }) => {
    await mockNbp(context, { EUR: 4.2635, USD: 3.9123 });
    await createPortfolio(page, "FX");
    await addInstrument(page, 1, {
      isin: "IE00BK5BQT80",
      label: "A",
      value: "100",
      weight: "40",
      currency: "EUR",
    });
    await addInstrument(page, 2, {
      isin: "IE00B4L5Y983",
      label: "B",
      value: "200",
      weight: "30",
      currency: "EUR",
    });
    await addInstrument(page, 3, {
      isin: "IE00B5BMR087",
      label: "C",
      value: "300",
      weight: "30",
      currency: "USD",
    });

    await page.getByRole("button", { name: "Fetch NBP rates" }).click();
    await expect(page.getByText("NBP rates updated: EUR, USD.")).toBeVisible();

    const rates = page.getByLabel(/^Rate \(PLN per 1/);
    await expect(rates).toHaveCount(3);
    await expect(rates.nth(0)).toHaveValue("4.2635");
    await expect(rates.nth(2)).toHaveValue("3.9123");
    await expect(page.getByText(/NBP mid rate, 9 Oct 2026/).first()).toBeVisible();

    // Two EUR rows and one USD row -> exactly two lookups, each carrying nothing but the currency.
    const nbp = audit.requests.filter((r) => r.url().includes("api.nbp.pl"));
    expect(nbp.map((r) => r.url()).sort()).toEqual([
      "https://api.nbp.pl/api/exchangerates/rates/a/EUR/?format=json",
      "https://api.nbp.pl/api/exchangerates/rates/a/USD/?format=json",
    ]);

    await setCash(page, "0");
    await save(page);
    await go(page, "/rebalance");
    await expect(page.getByText("Exchange rates used")).toBeVisible();
    await expect(page.getByText(/EUR: 4\.2635 PLN, NBP, published 9 Oct 2026/)).toBeVisible();
  });

  test("keeps rates that were fetched when another currency fails", async ({
    page,
    context,
    audit,
  }) => {
    audit.allowConsole.push(/status of 404/); // the stubbed USD lookup answers 404 on purpose
    await mockNbp(context, { EUR: 4.2635 }); // USD -> 404
    await createPortfolio(page, "FX");
    await addInstrument(page, 1, {
      isin: "IE00BK5BQT80",
      value: "100",
      weight: "50",
      currency: "EUR",
    });
    await addInstrument(page, 2, {
      isin: "IE00B4L5Y983",
      value: "100",
      weight: "50",
      currency: "USD",
      rate: "3,9",
    });

    await page.getByRole("button", { name: "Fetch NBP rates" }).click();
    await expect(page.getByText(/Some NBP rates could not be fetched: USD/)).toBeVisible();
    const rates = page.getByLabel(/^Rate \(PLN per 1/);
    await expect(rates.nth(0)).toHaveValue("4.2635");
    await expect(rates.nth(1)).toHaveValue("3,9"); // the manual USD rate survived
  });

  test("typing a rate by hand turns an NBP rate into a manual one", async ({ page, context }) => {
    await mockNbp(context, { EUR: 4.2635 });
    await createPortfolio(page, "FX");
    await addInstrument(page, 1, {
      isin: "IE00BK5BQT80",
      value: "100",
      weight: "100",
      currency: "EUR",
    });
    await page.getByRole("button", { name: "Fetch NBP rates" }).click();
    await expect(page.getByText(/NBP mid rate, /)).toBeVisible();

    await page.getByLabel(/^Rate \(PLN per 1/).fill("4,30");
    await expect(page.getByText("Manual rate")).toBeVisible();
    await expect(page.getByText(/NBP mid rate, /)).toBeHidden();
  });

  test("a malformed NBP response is rejected rather than trusted", async ({ page, context }) => {
    await context.route("https://api.nbp.pl/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          table: "A",
          code: "EUR",
          rates: [{ effectiveDate: "2026-10-09", mid: -4 }],
        }),
      }),
    );
    await createPortfolio(page, "FX");
    await addInstrument(page, 1, {
      isin: "IE00BK5BQT80",
      value: "100",
      weight: "100",
      currency: "EUR",
      rate: "4,2",
    });
    await page.getByRole("button", { name: "Fetch NBP rates" }).click();
    await expect(page.getByText(/NBP is unavailable right now/)).toBeVisible();
    await expect(page.getByLabel(/^Rate \(PLN per 1/)).toHaveValue("4,2");
  });

  test("importing a CLI file with foreign-currency values converts them with NBP rates", async ({
    page,
    context,
  }) => {
    await mockNbp(context, { EUR: 4.25 });
    await page.goto("/#/data");
    await page.locator("input[type=file]").setInputFiles({
      name: "eur.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          base_currency: "PLN",
          cash_pln: 0,
          positions: [{ isin: "IE00BK5BQT80", value: 100, currency: "EUR", label: "VWCE" }],
          target: [{ isin: "IE00BK5BQT80", weight: 1 }],
        }),
      ),
    });
    await expect(page.getByText(/Foreign-currency values need NBP rates \(EUR\)/)).toBeVisible();
    await page.getByRole("button", { name: "Import as new portfolio" }).click();
    await expect(page.getByText("Imported 1 portfolio(s).")).toBeVisible();
    await go(page, "/portfolio");
    await expect(page.getByText("Invested", { exact: true }).locator("xpath=../..")).toContainText(
      "425.00",
    );
  });

  test("a CLI import that needs rates fails clearly when NBP is unreachable", async ({
    page,
    context,
    audit,
  }) => {
    audit.allowConsole.push(/Failed to load resource|ERR_/);
    await mockNbp(context, "unreachable");
    await page.goto("/#/data");
    await page.locator("input[type=file]").setInputFiles({
      name: "usd.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          base_currency: "PLN",
          cash_pln: 0,
          positions: [{ isin: "IE00BK5BQT80", value: 100, currency: "USD" }],
          target: [{ isin: "IE00BK5BQT80", weight: 1 }],
        }),
      ),
    });
    await page.getByRole("button", { name: "Import as new portfolio" }).click();
    await expect(page.getByText(/Could not get NBP exchange rates for USD/)).toBeVisible();
    await go(page, "/");
    await expect(page.getByText(/No portfolios yet/)).toBeVisible();
  });
});
