import { describe, expect, it } from "vitest";
import {
  computePlan,
  computeUnitPlan,
  decimalToGrosze,
  fractionToPpm,
  type Portfolio,
  unitCostFromPrice,
} from "@/core";

const ISIN: Record<string, string> = {
  A: "IE00B5BMR087",
  B: "IE00B4L5Y983",
  C: "IE00BKM4GZ66",
};
const isin = (key: string) => ISIN[key] ?? key;

const portfolio = (
  held: Record<string, number>,
  weights: Record<string, number>,
  cashPln: number,
): Portfolio => ({
  baseCurrency: "PLN",
  cashPln,
  positions: Object.entries(held).map(([key, valuePln]) => ({ isin: isin(key), valuePln })),
  targets: Object.entries(weights).map(([key, weight]) => ({ isin: isin(key), weight })),
});

const prices = (entries: Record<string, [string, string?]>) =>
  new Map(Object.entries(entries).map(([key, [p, r]]) => [isin(key), unitCostFromPrice(p, r)]));

describe("decimal helpers", () => {
  it("converts to whole grosze exactly", () => {
    expect(decimalToGrosze("12.34")).toBe(1234);
    expect(decimalToGrosze("0")).toBe(0);
    expect(decimalToGrosze("12.345")).toBe(1235);
    expect(decimalToGrosze("0.1")).toBe(10);
  });

  it("reads a fraction as ppm only when it is exact", () => {
    expect(fractionToPpm("0.0039")).toBe(3900);
    expect(fractionToPpm("0")).toBe(0);
    expect(fractionToPpm("0.000001")).toBe(1);
    expect(fractionToPpm("0.0000001")).toBeNull();
  });
});

describe("unit cost", () => {
  it("never rounds the price before multiplying by the units", () => {
    // 4.2563 PLN per unit = 425.63 grosze; 3 units = 1276.89 -> 1277 grosze (rounded up).
    const cost = unitCostFromPrice("4.2563");
    expect(cost.num / cost.den).toBe(425n);
    const plan = computeUnitPlan(
      computePlan(portfolio({ A: 0 }, { A: 1 }, 12.77)),
      new Map([[isin("A"), cost]]),
    );
    expect(plan.orders[0]?.units).toBe(3);
    expect(plan.orders[0]?.costPln).toBe(12.77);
  });

  it("multiplies the price by the exchange rate exactly", () => {
    const cost = unitCostFromPrice("100", "4.256");
    expect(cost.num).toBe(100n * 4256n * 100n);
    expect(cost.num / cost.den).toBe(42560n);
  });
});

describe("computeUnitPlan", () => {
  it("buys whole units close to the amount plan and never exceeds the cash", () => {
    const amount = computePlan(portfolio({ A: 6000, B: 4000 }, { A: 0.5, B: 0.5 }, 2000));
    const plan = computeUnitPlan(amount, prices({ A: ["300"], B: ["70"] }));
    const [a, b] = plan.orders;
    expect(a?.units).toBeGreaterThanOrEqual(0);
    expect(plan.outlayPln).toBeLessThanOrEqual(2000);
    expect(plan.leftoverPln).toBeCloseTo(2000 - plan.outlayPln, 2);
    // The amount plan buys nothing of A (already 60%): the unit plan must not either.
    expect(a?.units).toBe(0);
    expect(b?.units).toBe(28);
  });

  it("is deterministic", () => {
    const amount = computePlan(
      portfolio({ A: 100, B: 100, C: 100 }, { A: 0.4, B: 0.3, C: 0.3 }, 987),
    );
    const p = prices({ A: ["37.31"], B: ["112.9"], C: ["8.07"] });
    expect(computeUnitPlan(amount, p)).toEqual(computeUnitPlan(amount, p));
  });

  it("finds the swap a plain rounding-down greedy misses", () => {
    // Ideal 10 / 10; units cost 7 and 6. Greedy: 1 + 1 = 13, 7 left over. Better: 0 of A, 1 of B +...
    const amount = computePlan(portfolio({ A: 0, B: 0 }, { A: 0.5, B: 0.5 }, 20));
    const plan = computeUnitPlan(amount, prices({ A: ["7"], B: ["6"] }));
    expect(plan.outlayPln).toBeLessThanOrEqual(20);
    const miss = plan.orders.reduce((s, o) => s + (o.idealBuyPln - o.costPln) ** 2, 0);
    // Exhaustive search over small unit counts must not beat the result.
    let best = Number.POSITIVE_INFINITY;
    for (let a = 0; a <= 3; a++) {
      for (let b = 0; b <= 4; b++) {
        if (a * 7 + b * 6 > 20) continue;
        best = Math.min(best, (10 - a * 7) ** 2 + (10 - b * 6) ** 2);
      }
    }
    expect(miss).toBe(best);
  });

  it("matches an exhaustive search on small cases", () => {
    const amount = computePlan(portfolio({ A: 50, B: 30, C: 20 }, { A: 0.3, B: 0.4, C: 0.3 }, 100));
    const unitPrices = { A: 13, B: 9, C: 17 };
    const plan = computeUnitPlan(amount, prices({ A: ["13"], B: ["9"], C: ["17"] }));
    const ideal = Object.fromEntries(amount.orders.map((o) => [o.isin, o.buyPln]));
    let best = Number.POSITIVE_INFINITY;
    for (let a = 0; a <= 8; a++) {
      for (let b = 0; b <= 12; b++) {
        for (let c = 0; c <= 6; c++) {
          if (a * 13 + b * 9 + c * 17 > 100) continue;
          const j =
            ((ideal[isin("A")] ?? 0) - a * unitPrices.A) ** 2 +
            ((ideal[isin("B")] ?? 0) - b * unitPrices.B) ** 2 +
            ((ideal[isin("C")] ?? 0) - c * unitPrices.C) ** 2;
          best = Math.min(best, j);
        }
      }
    }
    const got = plan.orders.reduce((s, o) => s + (o.idealBuyPln - o.costPln) ** 2, 0);
    expect(got).toBeCloseTo(best, 6);
  });

  it("deducts the commission from the cash and applies the minimum per order", () => {
    const amount = computePlan(portfolio({ A: 0 }, { A: 1 }, 1000));
    const plan = computeUnitPlan(amount, prices({ A: ["100"] }), { ratePpm: 3900, minGrosze: 500 });
    // 0.39% of 900 = 3.51 < 5.00 minimum -> 9 units cost 900 + 5 = 905; a 10th would need 1000 + 5.
    expect(plan.orders[0]?.units).toBe(9);
    expect(plan.feesPln).toBe(5);
    expect(plan.outlayPln).toBe(905);
    expect(plan.leftoverPln).toBe(95);
  });

  it("charges no fee for an instrument that is not bought", () => {
    const amount = computePlan(portfolio({ A: 900, B: 100 }, { A: 0.5, B: 0.5 }, 400));
    const plan = computeUnitPlan(amount, prices({ A: ["50"], B: ["50"] }), {
      ratePpm: 0,
      minGrosze: 1000,
    });
    expect(plan.orders[0]?.feePln).toBe(0);
    expect(plan.orders[0]?.units).toBe(0);
  });

  it("flags instruments without a price and leaves their share unspent", () => {
    const amount = computePlan(portfolio({ A: 0, B: 0 }, { A: 0.5, B: 0.5 }, 1000));
    const plan = computeUnitPlan(amount, prices({ A: ["100"] }));
    expect(plan.warnings).toContainEqual({ code: "no_price", isin: isin("B") });
    expect(plan.orders[1]?.units).toBe(0);
    expect(plan.orders[0]?.units).toBe(5);
    expect(plan.leftoverPln).toBe(500);
  });

  it("flags fees above one percent of an order", () => {
    const amount = computePlan(portfolio({ A: 0 }, { A: 1 }, 200));
    const plan = computeUnitPlan(amount, prices({ A: ["50"] }), { ratePpm: 0, minGrosze: 500 });
    expect(plan.warnings.some((w) => w.code === "high_fee")).toBe(true);
  });

  it("buys nothing when no unit fits", () => {
    const amount = computePlan(portfolio({ A: 0 }, { A: 1 }, 10));
    const plan = computeUnitPlan(amount, prices({ A: ["300"] }));
    expect(plan.orders[0]?.units).toBe(0);
    expect(plan.leftoverPln).toBe(10);
  });

  it("reports the after-weights of what is actually bought", () => {
    const amount = computePlan(portfolio({ A: 500, B: 500 }, { A: 0.5, B: 0.5 }, 0));
    const plan = computeUnitPlan(amount, prices({ A: ["10"], B: ["10"] }));
    expect(plan.orders.map((o) => o.afterWeight)).toEqual([0.5, 0.5]);
    expect(plan.outlayPln).toBe(0);
  });
});

describe("optimality on two instruments", () => {
  it("matches an exhaustive search on random portfolios", () => {
    let seed = 11;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let run = 0; run < 300; run++) {
      const w = Math.round((0.1 + rand() * 0.8) * 100) / 100;
      const cash = Math.round(rand() * 300000) / 100;
      const price = [Math.round((1 + rand() * 250) * 100), Math.round((1 + rand() * 250) * 100)];
      const amount = computePlan(
        portfolio(
          { A: Math.round(rand() * 2000), B: Math.round(rand() * 2000) },
          { A: w, B: Math.round((1 - w) * 100) / 100 },
          cash,
        ),
      );
      const plan = computeUnitPlan(
        amount,
        prices({ A: [`${(price[0] as number) / 100}`], B: [`${(price[1] as number) / 100}`] }),
      );
      const ideal = amount.orders.map((o) => Math.round(o.buyPln * 100));
      const budget = Math.floor(cash * 100 + 1e-9);
      let best = Number.POSITIVE_INFINITY;
      for (let a = 0; a * (price[0] as number) <= budget; a++) {
        for (let b = 0; a * (price[0] as number) + b * (price[1] as number) <= budget; b++) {
          best = Math.min(
            best,
            ((ideal[0] as number) - a * (price[0] as number)) ** 2 +
              ((ideal[1] as number) - b * (price[1] as number)) ** 2,
          );
        }
      }
      const got = plan.orders.reduce(
        (sum, o, i) => sum + ((ideal[i] as number) - Math.round(o.costPln * 100)) ** 2,
        0,
      );
      expect(got).toBe(best);
    }
  });
});
