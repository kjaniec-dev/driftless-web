import { describe, expect, it } from "vitest";
import { validateStoredPortfolio } from "@/storage/validate";
import { A, B, portfolio, position } from "./helpers";

const codes = (p: ReturnType<typeof portfolio>) => validateStoredPortfolio(p).map((i) => i.code);

describe("validateStoredPortfolio", () => {
  it("accepts a valid portfolio and an empty one", () => {
    expect(codes(portfolio())).toEqual([]);
    expect(codes(portfolio({ positions: [] }))).toEqual([]);
  });

  it("requires weights to total 100% once instruments exist", () => {
    expect(
      codes(portfolio({ positions: [position(A, "0.6", "1"), position(B, "0.3", "1")] })),
    ).toEqual(["weights_sum"]);
    // within the CLI tolerance of 1e-4
    expect(
      codes(portfolio({ positions: [position(A, "0.5", "1"), position(B, "0.50009", "1")] })),
    ).toEqual([]);
  });

  it("flags duplicate ISINs on the later row", () => {
    const issues = validateStoredPortfolio(
      portfolio({ positions: [position(A, "0.5", "1"), position(A, "0.5", "1")] }),
    );
    expect(issues).toContainEqual({ code: "duplicate_isin", index: 1 });
  });

  it("flags bad ISIN, amount, weight and text per row", () => {
    const issues = validateStoredPortfolio(
      portfolio({
        positions: [
          position("nope", "1", "1"),
          position(B, "1.5", "-1"),
          position("US0378331005", "0", "1", { label: "" }),
        ],
      }),
    ).map((i) => `${i.code}:${"index" in i ? i.index : ""}`);
    expect(issues).toEqual(
      expect.arrayContaining([
        "position_isin:0",
        "position_weight:1",
        "position_amount:1",
        "position_text:2",
      ]),
    );
  });

  it("validates foreign-currency valuation and its rate", () => {
    const fx = (mid: string, date: string | null) =>
      portfolio({
        positions: [
          {
            isin: A,
            targetWeight: "1",
            valuation: {
              mode: "fx",
              value: "100",
              currency: "EUR",
              rate: { mid, effectiveDate: date, source: "nbp" },
            },
          },
        ],
      });
    expect(codes(fx("4.25", "2026-10-09"))).toEqual([]);
    expect(codes(fx("0", "2026-10-09"))).toEqual(["position_rate"]);
    expect(codes(fx("4.25", "2026-13-40"))).toEqual(["position_rate"]);
  });

  it("checks name, cash, date and the total", () => {
    expect(codes(portfolio({ name: "  " }))).toContain("name_required");
    expect(codes(portfolio({ name: "x".repeat(101) }))).toContain("name_too_long");
    expect(codes(portfolio({ cashPln: "-1" }))).toContain("invalid_cash");
    expect(codes(portfolio({ asOf: "2026-02-30" }))).toContain("invalid_as_of");
    expect(codes(portfolio({ cashPln: "0", positions: [position(A, "1", "0")] }))).toContain(
      "total_not_positive",
    );
  });
});
