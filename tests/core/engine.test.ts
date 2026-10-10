import { describe, expect, it } from "vitest";
import type { Portfolio, RebalancePlan } from "@/core";
import { computePlan, formatWarningEn, PortfolioValidationError } from "@/core";

const A = "IE00BK5BQT80";
const B = "IE00B4L5Y983";
const C = "IE00B5BMR087";

const portfolio = (
  p: Partial<Portfolio> & Pick<Portfolio, "positions" | "targets">,
): Portfolio => ({
  baseCurrency: "PLN",
  cashPln: 0,
  ...p,
});

const twoEtf = (cash = 5000): Portfolio =>
  portfolio({
    cashPln: cash,
    positions: [
      { isin: A, valuePln: 45000, label: "VWCE" },
      { isin: B, valuePln: 30000, label: "IWDA" },
    ],
    targets: [
      { isin: A, weight: 0.6 },
      { isin: B, weight: 0.4 },
    ],
  });

const fourEtf = (cash = 500): Portfolio =>
  portfolio({
    cashPln: cash,
    positions: [
      { isin: "IE00B5BMR087", valuePln: 3400, label: "SXR8" },
      { isin: "IE0006WW1TQ4", valuePln: 4300, label: "EXUS" },
      { isin: "IE00BKM4GZ66", valuePln: 1200, label: "IS3N" },
      { isin: "IE00B4ND3602", valuePln: 1100, label: "EGLN" },
    ],
    targets: [
      { isin: "IE00B5BMR087", weight: 0.3 },
      { isin: "IE0006WW1TQ4", weight: 0.4 },
      { isin: "IE00BKM4GZ66", weight: 0.15 },
      { isin: "IE00B4ND3602", weight: 0.15 },
    ],
  });

const byLabel = (plan: RebalancePlan) => Object.fromEntries(plan.orders.map((o) => [o.label, o]));
const byIsin = (plan: RebalancePlan) => Object.fromEntries(plan.orders.map((o) => [o.isin, o]));

// Ported 1:1 from tests/test_engine.py in the Python CLI.
describe("computePlan (ported from the CLI test-suite)", () => {
  it("basic buy plan", () => {
    const plan = computePlan(twoEtf());
    expect(plan.totalPln).toBe(80000);
    expect(byIsin(plan)[A]?.buyPln).toBe(3000);
    expect(byIsin(plan)[B]?.buyPln).toBe(2000);
    expect(plan.leftoverCash).toBe(0);
    expect(plan.warnings).toEqual([]);
  });

  it("current weights are based on invested positions", () => {
    const plan = computePlan(fourEtf());
    const o = byLabel(plan);
    expect(plan.orders.reduce((s, x) => s + x.currentWeight, 0)).toBeCloseTo(1, 12);
    expect(o.SXR8?.currentWeight).toBeCloseTo(0.34, 12);
    expect(o.EXUS?.currentWeight).toBeCloseTo(0.43, 12);
    expect(o.IS3N?.currentWeight).toBeCloseTo(0.12, 12);
    expect(o.EGLN?.currentWeight).toBeCloseTo(0.11, 12);
    expect(o.SXR8?.driftPp).toBeCloseTo(-4, 9);
    expect(o.EXUS?.driftPp).toBeCloseTo(-3, 9);
    expect(o.IS3N?.driftPp).toBeCloseTo(3, 9);
    expect(o.EGLN?.driftPp).toBeCloseTo(4, 9);
  });

  it("cash minimises remaining underweight drift", () => {
    const plan = computePlan(fourEtf());
    const o = byLabel(plan);
    expect(o.SXR8?.buyPln).toBe(0);
    expect(o.EXUS?.buyPln).toBe(0);
    expect(o.IS3N?.buyPln).toBeCloseTo(200, 9);
    expect(o.EGLN?.buyPln).toBeCloseTo(300, 9);
    expect(plan.cashDeployed).toBeCloseTo(500, 9);
    expect(plan.warnings[0]?.code).toBe("cash_constrained");
  });

  it("reports drift on the post-purchase portfolio", () => {
    const plan = computePlan(fourEtf());
    const o = byLabel(plan);
    expect(plan.orders.reduce((s, x) => s + x.afterWeight, 0)).toBeCloseTo(1, 12);
    expect(o.IS3N?.afterWeight).toBeCloseTo(1400 / 10500, 12);
    expect(o.EGLN?.afterWeight).toBeCloseTo(1400 / 10500, 12);
    expect(o.IS3N?.driftAfterPp).toBeCloseTo(o.EGLN?.driftAfterPp ?? Number.NaN, 9);
  });

  it("deploys all cash when cash limits the rebalance", () => {
    const plan = computePlan(twoEtf(2500));
    expect(plan.orders.reduce((s, o) => s + o.buyPln, 0)).toBeCloseTo(2500, 9);
  });

  it("raises no constraint warning when cash equals the total gap up to float noise", () => {
    const plan = computePlan(
      portfolio({
        cashPln: 3333.33,
        positions: [
          { isin: A, valuePln: 1000.1 },
          { isin: B, valuePln: 2000.2 },
        ],
        targets: [
          { isin: A, weight: 1 / 3 },
          { isin: B, weight: 2 / 3 },
        ],
      }),
    );
    expect(plan.warnings).toEqual([]);
  });

  it("deploys cash to a target leg that is not held yet", () => {
    const plan = computePlan(
      portfolio({
        cashPln: 1000,
        positions: [{ isin: A, valuePln: 90000, label: "VWCE" }],
        targets: [
          { isin: A, weight: 0.5 },
          { isin: B, weight: 0.5 },
        ],
      }),
    );
    expect(byIsin(plan)[A]?.buyPln).toBe(0);
    expect(byIsin(plan)[B]?.buyPln).toBeCloseTo(1000, 9);
    expect(plan.leftoverCash).toBeCloseTo(0, 9);
  });

  it("single asset at target buys nothing", () => {
    const plan = computePlan(
      portfolio({
        positions: [{ isin: A, valuePln: 100000 }],
        targets: [{ isin: A, weight: 1 }],
      }),
    );
    expect(plan.cashDeployed).toBe(0);
    expect(plan.leftoverCash).toBe(0);
  });

  it("buys by target weight when only cash is held", () => {
    const plan = computePlan(
      portfolio({
        cashPln: 1000,
        positions: [],
        targets: [
          { isin: A, weight: 0.7 },
          { isin: B, weight: 0.3 },
        ],
      }),
    );
    expect(byIsin(plan)[A]?.buyPln).toBeCloseTo(700, 9);
    expect(byIsin(plan)[B]?.buyPln).toBeCloseTo(300, 9);
    expect(plan.orders.every((o) => o.currentWeight === 0)).toBe(true);
    expect(byIsin(plan)[A]?.afterWeight).toBeCloseTo(0.7, 12);
  });

  it("lists positions outside the target and never trades them", () => {
    const plan = computePlan(
      portfolio({
        cashPln: 1000,
        positions: [
          { isin: A, valuePln: 5000, label: "VWCE" },
          { isin: B, valuePln: 3000, label: "IWDA" },
          { isin: C, valuePln: 2000, label: "SXR8" },
        ],
        targets: [
          { isin: A, weight: 0.5 },
          { isin: B, weight: 0.5 },
        ],
      }),
    );
    expect(plan.warnings).toContainEqual({ code: "not_in_target", isin: C });
    expect(formatWarningEn({ code: "not_in_target", isin: C })).toBe(
      `Position ${C} not in target allocation`,
    );
    const o = byLabel(plan);
    expect(o.SXR8?.targetWeight).toBe(0);
    expect(o.SXR8?.buyPln).toBe(0);
    expect(o.VWCE?.buyPln).toBe(0);
    expect(o.IWDA?.buyPln).toBeCloseTo(1000, 9);
    expect(plan.orders.reduce((s, x) => s + x.currentWeight, 0)).toBeCloseTo(1, 12);
  });

  it("rounds to grosze without exceeding cash", () => {
    const plan = computePlan(
      portfolio({
        cashPln: 100,
        positions: [
          { isin: A, valuePln: 0 },
          { isin: B, valuePln: 0 },
          { isin: C, valuePln: 0 },
        ],
        targets: [
          { isin: A, weight: 1 / 3 },
          { isin: B, weight: 1 / 3 },
          { isin: C, weight: 1 / 3 },
        ],
      }),
    );
    expect(plan.orders.map((o) => Math.round(o.buyPln * 100) / 100)).toEqual(
      plan.orders.map((o) => o.buyPln),
    );
    expect(plan.cashDeployed).toBeCloseTo(100, 9);
    expect(plan.cashDeployed).toBeLessThanOrEqual(100);
    expect(plan.leftoverCash).toBeGreaterThanOrEqual(0);
  });
});

describe("computePlan guards and wording", () => {
  it("formats the cash-constraint warning like the CLI", () => {
    expect(formatWarningEn({ code: "cash_constrained", cashPln: 12345.6 })).toBe(
      "Buy orders constrained to available cash (12,345.60 PLN)",
    );
  });

  it("rejects inputs the CLI would refuse to load", () => {
    const bad = portfolio({
      cashPln: 100,
      positions: [{ isin: A, valuePln: 100 }],
      targets: [{ isin: A, weight: 0.9 }],
    });
    expect(() => computePlan(bad)).toThrow(PortfolioValidationError);
  });

  it("is deterministic", () => {
    expect(computePlan(fourEtf())).toEqual(computePlan(fourEtf()));
  });
});
