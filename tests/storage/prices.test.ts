import { describe, expect, it } from "vitest";
import { applyNbpRates, draftCurrencies } from "@/market/apply";
import { toUnitInputs } from "@/storage/convert";
import { draftFromStored, draftToStored, emptyRow } from "@/storage/draft";
import type { StoredPortfolio, UnitPrice } from "@/storage/model";
import { validateStoredPortfolio } from "@/storage/validate";
import { A, B, portfolio, position } from "./helpers";

const withPrice = (price: UnitPrice, costs?: StoredPortfolio["costs"]) =>
  portfolio({
    positions: [position(A, "0.6", "45000", { price }), position(B, "0.4", "30000")],
    ...(costs ? { costs } : {}),
  });

const NOW = "2026-10-10T10:00:00.000Z";

describe("stored prices and broker costs", () => {
  it("accepts a PLN price, a foreign price with a rate, and costs", () => {
    expect(validateStoredPortfolio(withPrice({ value: "412.5", currency: "PLN" }))).toEqual([]);
    expect(
      validateStoredPortfolio(
        withPrice(
          {
            value: "118.32",
            currency: "EUR",
            rate: { mid: "4.256", effectiveDate: null, source: "manual" },
            quotedOn: "2026-10-09",
          },
          { commissionRate: "0.0039", commissionMinPln: "5" },
        ),
      ),
    ).toEqual([]);
  });

  it.each<[string, UnitPrice]>([
    ["zero", { value: "0", currency: "PLN" }],
    ["foreign without a rate", { value: "10", currency: "EUR" }],
    [
      "PLN with a rate",
      {
        value: "10",
        currency: "PLN",
        rate: { mid: "4", effectiveDate: null, source: "manual" },
      },
    ],
    ["bad date", { value: "10", currency: "PLN", quotedOn: "2026-02-30" }],
    ["absurdly large", { value: "99999999999", currency: "PLN" }],
  ])("rejects a price that is %s", (_name, price) => {
    expect(validateStoredPortfolio(withPrice(price))).toContainEqual({
      code: "position_price",
      index: 0,
    });
  });

  it.each([
    ["above 10%", { commissionRate: "0.11", commissionMinPln: "0" }],
    ["too many decimals", { commissionRate: "0.0000001", commissionMinPln: "0" }],
    ["negative minimum", { commissionRate: "0", commissionMinPln: "-1" }],
  ])("rejects costs %s", (_name, costs) => {
    expect(validateStoredPortfolio(portfolio({ costs }))).toContainEqual({
      code: "invalid_commission",
    });
  });
});

describe("draft round trip", () => {
  it("keeps prices and costs through draft and back", () => {
    const stored = withPrice(
      {
        value: "118.32",
        currency: "EUR",
        rate: { mid: "4.256", effectiveDate: "2026-10-09", source: "nbp" },
        quotedOn: "2026-10-09",
      },
      { commissionRate: "0.0039", commissionMinPln: "5" },
    );
    const draft = draftFromStored(stored);
    expect(draft.commissionPct).toBe("0.39");
    expect(draft.rows[0]?.priceCurrency).toBe("EUR");
    const { portfolio: back, issues } = draftToStored(draft, stored, stored.updatedAt);
    expect(issues).toEqual([]);
    expect(back).toEqual(stored);
  });

  it("treats blank price and blank costs as none", () => {
    const base = portfolio();
    const { portfolio: saved } = draftToStored(draftFromStored(base), base, NOW);
    expect(saved?.costs).toBeUndefined();
    expect(saved?.positions.every((p) => p.price === undefined)).toBe(true);
  });

  it("reads typed prices with a comma and flags unreadable ones", () => {
    const base = portfolio();
    const draft = draftFromStored(base);
    draft.rows[0] = { ...(draft.rows[0] ?? emptyRow()), price: "412,50" };
    expect(draftToStored(draft, base, NOW).portfolio?.positions[0]?.price?.value).toBe("412.50");

    draft.rows[0] = { ...(draft.rows[0] ?? emptyRow()), price: "abc" };
    expect(draftToStored(draft, base, NOW).issues).toContainEqual({
      code: "position_price",
      index: 0,
    });

    // A foreign price needs its own rate.
    draft.rows[0] = { ...(draft.rows[0] ?? emptyRow()), price: "10", priceCurrency: "USD" };
    expect(draftToStored(draft, base, NOW).issues).toContainEqual({
      code: "position_price",
      index: 0,
    });
  });

  it("reads the commission as a percent and rejects a rate that cannot be exact", () => {
    const base = portfolio();
    const draft = draftFromStored(base);
    expect(
      draftToStored({ ...draft, commissionPct: "0,39", commissionMin: "5" }, base, NOW).portfolio
        ?.costs,
    ).toEqual({ commissionRate: "0.0039", commissionMinPln: "5" });
    expect(
      draftToStored({ ...draft, commissionPct: "0.39", commissionMin: "" }, base, NOW).portfolio
        ?.costs,
    ).toEqual({ commissionRate: "0.0039", commissionMinPln: "0" });
    for (const commissionPct of ["0.00001", "11", "x"]) {
      expect(draftToStored({ ...draft, commissionPct }, base, NOW).issues).toContainEqual({
        code: "invalid_commission",
      });
    }
  });
});

describe("NBP rates for prices", () => {
  const rate = { currency: "USD" as const, mid: "4.31", effectiveDate: "2026-10-09" };

  it("asks for a currency used only by a price, and not for a blank price", () => {
    const draft = draftFromStored(portfolio());
    expect(draftCurrencies(draft)).toEqual([]);
    const [first, second] = draft.rows;
    if (!first || !second) throw new Error("fixture");
    draft.rows = [
      { ...first, price: "10", priceCurrency: "USD" },
      { ...second, price: "", priceCurrency: "GBP" },
    ];
    expect(draftCurrencies(draft)).toEqual(["USD"]);
  });

  it("writes the rate into the price, not into the valuation", () => {
    const draft = draftFromStored(portfolio());
    const [first] = draft.rows;
    if (!first) throw new Error("fixture");
    draft.rows = [{ ...first, price: "10", priceCurrency: "USD" }];
    const [row] = applyNbpRates(draft, { USD: rate }).rows;
    expect(row?.priceRate).toBe("4.31");
    expect(row?.priceRateSource).toBe("nbp");
    expect(row?.rate).toBe("");
  });
});

describe("toUnitInputs", () => {
  it("builds exact unit costs and the commission", () => {
    const { prices, commission } = toUnitInputs(
      withPrice(
        {
          value: "100",
          currency: "EUR",
          rate: { mid: "4.256", effectiveDate: null, source: "manual" },
        },
        { commissionRate: "0.0039", commissionMinPln: "5.5" },
      ),
    );
    const unit = prices.get(A);
    expect(unit && unit.num / unit.den).toBe(42560n);
    expect(prices.has(B)).toBe(false);
    expect(commission).toEqual({ ratePpm: 3900, minGrosze: 550 });
  });

  it("means no commission when none is stored", () => {
    expect(toUnitInputs(portfolio()).commission).toEqual({ ratePpm: 0, minGrosze: 0 });
  });
});
