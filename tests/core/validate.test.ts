import { describe, expect, it } from "vitest";
import type { Portfolio } from "@/core";
import { validatePortfolio } from "@/core";

const A = "IE00BK5BQT80";
const B = "IE00B4L5Y983";
const ok: Portfolio = {
  baseCurrency: "PLN",
  cashPln: 100,
  positions: [{ isin: A, valuePln: 10 }],
  targets: [
    { isin: A, weight: 0.5 },
    { isin: B, weight: 0.5 },
  ],
};
const codes = (p: Portfolio) => validatePortfolio(p).map((i) => i.code);

describe("validatePortfolio", () => {
  it("accepts a valid portfolio", () => expect(validatePortfolio(ok)).toEqual([]));

  it("accepts weights within the CLI tolerance of 1e-4", () => {
    const p = {
      ...ok,
      targets: [
        { isin: A, weight: 0.5 },
        { isin: B, weight: 0.50009 },
      ],
    };
    expect(codes(p)).toEqual([]);
  });

  it("rejects weights that do not sum to 100%", () => {
    const p = {
      ...ok,
      targets: [
        { isin: A, weight: 0.5 },
        { isin: B, weight: 0.4 },
      ],
    };
    expect(codes(p)).toEqual(["weights_sum"]);
  });

  it("rejects duplicate ISINs in positions and targets", () => {
    const p: Portfolio = {
      ...ok,
      positions: [
        { isin: A, valuePln: 1 },
        { isin: A, valuePln: 2 },
      ],
      targets: [
        { isin: A, weight: 0.5 },
        { isin: A, weight: 0.5 },
      ],
    };
    expect(codes(p)).toEqual(["duplicate_position", "duplicate_target"]);
  });

  it("rejects invalid amounts, weights and ISINs", () => {
    const p: Portfolio = {
      baseCurrency: "PLN",
      cashPln: -1,
      positions: [{ isin: "bad", valuePln: Number.NaN }],
      targets: [
        { isin: A, weight: 0 },
        { isin: B, weight: 1 },
      ],
    };
    expect(codes(p)).toEqual(
      expect.arrayContaining(["invalid_amount", "invalid_isin", "invalid_weight"]),
    );
  });

  it("rejects missing targets and a zero total", () => {
    expect(codes({ ...ok, targets: [] })).toContain("no_targets");
    expect(codes({ ...ok, cashPln: 0, positions: [] })).toContain("total_not_positive");
  });
});
