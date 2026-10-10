import { describe, expect, it } from "vitest";
import type { Portfolio } from "@/core";
import { computePlan, formatWarningEn } from "@/core";
import golden from "../golden/engine.golden.json";

interface GoldenCase {
  name: string;
  input: {
    cash_pln: number;
    positions: Array<{ isin: string; value_pln: number; label?: string }>;
    target: Array<{ isin: string; weight: number }>;
  };
  expected: {
    total_pln: number;
    positions_pln: number;
    cash_pln: number;
    cash_deployed: number;
    leftover_cash: number;
    warnings: string[];
    orders: Array<Record<string, number | string | null>>;
  };
}

const cases = golden.cases as GoldenCase[];

const toPortfolio = (c: GoldenCase): Portfolio => ({
  baseCurrency: "PLN",
  cashPln: c.input.cash_pln,
  positions: c.input.positions.map((p) => ({
    isin: p.isin,
    valuePln: p.value_pln,
    label: p.label,
  })),
  targets: c.input.target.map((t) => ({ isin: t.isin, weight: t.weight })),
});

describe("parity with the Driftless Python CLI", () => {
  it("has reference cases", () => {
    expect(cases.length).toBeGreaterThan(700);
    expect(golden.driftlessCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  // Exact equality (not toBeCloseTo): the port must be bit-identical, not just close.
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const plan = computePlan(toPortfolio(c));
    const e = c.expected;

    expect(plan.totalPln).toBe(e.total_pln);
    expect(plan.positionsPln).toBe(e.positions_pln);
    expect(plan.cashPln).toBe(e.cash_pln);
    expect(plan.cashDeployed).toBe(e.cash_deployed);
    expect(plan.leftoverCash).toBe(e.leftover_cash);
    expect(plan.warnings.map(formatWarningEn)).toEqual(e.warnings);

    expect(plan.orders).toHaveLength(e.orders.length);
    plan.orders.forEach((o, i) => {
      const x = e.orders[i] as Record<string, number | string | null>;
      expect(o.isin).toBe(x.isin);
      expect(o.label).toBe(x.label);
      expect(o.currentPln).toBe(x.current_pln);
      expect(o.targetPln).toBe(x.target_pln);
      expect(o.currentWeight).toBe(x.current_weight);
      expect(o.targetWeight).toBe(x.target_weight);
      expect(o.driftPp).toBe(x.drift_pp);
      expect(o.buyPln).toBe(x.buy_pln);
      expect(o.afterWeight).toBe(x.after_weight);
      expect(o.driftAfterPp).toBe(x.drift_after_pp);
    });
  });
});
