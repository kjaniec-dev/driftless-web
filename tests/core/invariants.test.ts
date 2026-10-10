import { describe, expect, it } from "vitest";
import type { Portfolio } from "@/core";
import { computePlan } from "@/core";

/** Small seeded PRNG (mulberry32) so failures are reproducible. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("buy-only invariants (property tests)", () => {
  it("never sells, never overspends, never buys past target, shares one shortfall", () => {
    const rand = rng(1);
    const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
    const cents = (x: number) => Math.round(x * 100) / 100;

    for (let run = 0; run < 3000; run++) {
      const k = 1 + Math.floor(rand() * 8);
      const isins = Array.from({ length: k }, (_, i) => `IE00B5BMR0${String(i).padStart(2, "0")}`);
      const raw = isins.map(() => rand() + 0.01);
      const norm = raw.reduce((s, w) => s + w, 0);
      const cash = cents(between(0, 3000));
      const p: Portfolio = {
        baseCurrency: "PLN",
        cashPln: cash,
        positions: isins.map((isin) => ({ isin, valuePln: cents(between(0, 5000)) })),
        targets: isins.map((isin, i) => ({ isin, weight: (raw[i] as number) / norm })),
      };
      const total = p.positions.reduce((s, x) => s + x.valuePln, 0) + cash;
      if (total <= 0) continue;

      const plan = computePlan(p);
      const ctx = `run ${run}`;

      expect(
        plan.orders.every((o) => o.buyPln >= 0),
        ctx,
      ).toBe(true);
      // Integer grosze: the total spend may never exceed the cash by even 0.01 PLN.
      const spent = plan.orders.reduce((s, o) => s + Math.round(o.buyPln * 100), 0);
      expect(spent, ctx).toBeLessThanOrEqual(Math.floor(cash * 100 + 1e-6));
      expect(plan.leftoverCash, ctx).toBeGreaterThanOrEqual(0);

      const gapSum = plan.orders.reduce((s, o) => s + Math.max(0, o.targetPln - o.currentPln), 0);
      expect(plan.cashDeployed, ctx).toBeCloseTo(Math.min(cash, gapSum), 1);
      for (const o of plan.orders) {
        expect(o.buyPln, ctx).toBeLessThanOrEqual(Math.max(0, o.targetPln - o.currentPln) + 0.011);
      }
      const remaining = plan.orders
        .filter((o) => o.buyPln > 0.02)
        .map((o) => o.targetPln - o.currentPln - o.buyPln);
      if (remaining.length > 0 && plan.cashDeployed < gapSum - 0.05) {
        expect(Math.max(...remaining) - Math.min(...remaining), ctx).toBeLessThan(0.02);
      }
    }
  });

  it("handles a large number of ETFs", () => {
    const k = 500;
    const isins = Array.from({ length: k }, (_, i) =>
      `IE00B5BMR${String(i).padStart(3, "0")}0`.slice(0, 12),
    );
    const p: Portfolio = {
      baseCurrency: "PLN",
      cashPln: 12345.67,
      positions: isins.map((isin, i) => ({ isin, valuePln: 100 + (i % 17) * 13 })),
      targets: isins.map((isin) => ({ isin, weight: 1 / k })),
    };
    const plan = computePlan(p);
    expect(plan.orders).toHaveLength(k);
    expect(plan.cashDeployed).toBeLessThanOrEqual(12345.67);
    expect(plan.cashDeployed).toBeCloseTo(12345.67, 2);
  });
});
