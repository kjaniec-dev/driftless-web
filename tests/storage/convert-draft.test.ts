import { describe, expect, it } from "vitest";
import { computePlan } from "@/core";
import { toEnginePortfolio } from "@/storage/convert";
import { draftFromStored, draftToStored, draftWeightSumPercent, emptyRow } from "@/storage/draft";
import { A, B, C, portfolio, position } from "./helpers";

describe("toEnginePortfolio", () => {
  it("converts decimal strings and feeds the engine", () => {
    const e = toEnginePortfolio(portfolio());
    expect(e.cashPln).toBe(500);
    expect(e.positions).toEqual([
      { isin: A, valuePln: 45000, label: "VWCE" },
      { isin: B, valuePln: 30000, label: "IWDA" },
    ]);
    expect(computePlan(e).totalPln).toBe(75500);
  });

  it("multiplies foreign values by the stored rate", () => {
    const p = portfolio({
      positions: [
        {
          isin: A,
          targetWeight: "1",
          valuation: {
            mode: "fx",
            value: "100",
            currency: "EUR",
            rate: { mid: "4.25", effectiveDate: "2026-10-09", source: "nbp" },
          },
        },
      ],
    });
    expect(toEnginePortfolio(p).positions[0]?.valuePln).toBe(425);
  });

  it("keeps target-only instruments, drops empty ones, and honours a cash override", () => {
    const p = portfolio({
      positions: [position(A, "1", "0"), position(B, "0", "0"), position(C, "0", "10")],
    });
    const e = toEnginePortfolio(p, 1000);
    expect(e.cashPln).toBe(1000);
    expect(e.positions.map((x) => x.isin)).toEqual([A, C]);
    expect(e.targets.map((x) => x.isin)).toEqual([A]);
  });
});

describe("draft <-> stored", () => {
  const now = "2026-10-10T00:00:00.000Z";

  it("round-trips a stored portfolio without loss", () => {
    const base = portfolio({ asOf: "2026-10-01" });
    const result = draftToStored(draftFromStored(base), base, now);
    expect(result.issues).toEqual([]);
    expect(result.portfolio).toEqual({ ...base, updatedAt: now });
  });

  it("parses Polish number formatting and normalises ISIN case", () => {
    const base = portfolio({ positions: [] });
    const draft = draftFromStored(base);
    draft.cash = "1 234,50";
    draft.rows = [
      { ...emptyRow(), isin: " ie00bk5bqt80 ", value: "10 000,5", weightPct: "60" },
      { ...emptyRow(), isin: B, value: "", weightPct: "40" },
    ];
    const { portfolio: p, issues } = draftToStored(draft, base, now);
    expect(issues).toEqual([]);
    expect(p?.cashPln).toBe("1234.50");
    expect(p?.positions[0]).toMatchObject({ isin: A, targetWeight: "0.6" });
    expect(p?.positions[0]?.valuation).toEqual({ mode: "manual", valuePln: "10000.5" });
    expect(p?.positions[1]?.valuation).toEqual({ mode: "manual", valuePln: "0" });
  });

  it("reports row-level problems and refuses to produce a portfolio", () => {
    const base = portfolio({ positions: [] });
    const draft = draftFromStored(base);
    draft.rows = [
      { ...emptyRow(), isin: A, value: "abc", weightPct: "50" },
      { ...emptyRow(), isin: B, value: "1", weightPct: "150" },
    ];
    const { portfolio: p, issues } = draftToStored(draft, base, now);
    expect(p).toBeNull();
    expect(issues).toEqual(
      expect.arrayContaining([
        { code: "position_amount", index: 0 },
        { code: "position_weight", index: 1 },
      ]),
    );
  });

  it("refuses weights that do not total 100% and duplicate ISINs", () => {
    const base = portfolio();
    const draft = draftFromStored(base);
    (draft.rows[0] as { weightPct: string }).weightPct = "50";
    expect(draftToStored(draft, base, now).portfolio).toBeNull();
    expect(draftToStored(draft, base, now).issues.map((i) => i.code)).toContain("weights_sum");

    const dup = draftFromStored(base);
    (dup.rows[1] as { isin: string }).isin = A;
    expect(draftToStored(dup, base, now).issues).toContainEqual({
      code: "duplicate_isin",
      index: 1,
    });
  });

  it("requires a positive rate for foreign valuations and drops the date of manual rates", () => {
    const base = portfolio({ positions: [] });
    const draft = draftFromStored(base);
    draft.rows = [
      {
        ...emptyRow(),
        isin: A,
        mode: "fx",
        value: "100",
        currency: "USD",
        rate: "",
        weightPct: "100",
      },
    ];
    expect(draftToStored(draft, base, now).issues).toContainEqual({
      code: "position_rate",
      index: 0,
    });

    (draft.rows[0] as { rate: string }).rate = "3,9";
    (draft.rows[0] as { rateDate: string | null }).rateDate = "2026-10-09";
    const { portfolio: p } = draftToStored(draft, base, now);
    expect(p?.positions[0]?.valuation).toMatchObject({
      mode: "fx",
      rate: { mid: "3.9", source: "manual", effectiveDate: null },
    });
  });

  it("reports the live weight sum", () => {
    const draft = draftFromStored(portfolio());
    expect(draftWeightSumPercent(draft)).toBeCloseTo(100, 9);
    (draft.rows[0] as { weightPct: string }).weightPct = "x";
    expect(draftWeightSumPercent(draft)).toBeCloseTo(40, 9);
  });
});
