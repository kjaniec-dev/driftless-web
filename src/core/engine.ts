/**
 * Buy-only rebalancing: a port of `driftless.engine.compute_plan`.
 *
 * Deliberately uses plain IEEE doubles (like the Python reference) rather than a
 * decimal library: only the final grosz rounding decides the outputs, and doing the
 * arithmetic in the same number format is what keeps results identical to the CLI.
 */
import { pySum, roundHalfEven } from "./float";
import type { BuyOrder, PlanWarning, Portfolio, RebalancePlan } from "./types";
import { assertValidPortfolio } from "./validate";

/** Gaps/cash differences below one grosz are float noise, not real constraints. */
const EPSILON_PLN = 0.005;

interface Leg {
  readonly isin: string;
  readonly label: string | null;
  readonly currentPln: number;
  readonly targetWeight: number;
  readonly targetPln: number;
}

/**
 * Level L such that sum(max(0, gap - L)) == cash (exact water-filling).
 *
 * Spending `cash` on the largest gaps first leaves every funded position with the
 * same remaining shortfall L, which minimises both the largest remaining gap and
 * the sum of squared remaining gaps.
 */
function waterLevel(gaps: readonly number[], cash: number): number {
  const ordered = [...gaps].sort((a, b) => b - a);
  let running = 0;
  for (let i = 0; i < ordered.length; i++) {
    const count = i + 1;
    running += ordered[i] as number;
    const level = (running - cash) / count;
    const nextGap = count < ordered.length ? (ordered[count] as number) : 0;
    if (level >= nextGap) return Math.max(level, 0);
  }
  return 0;
}

function allocateCashToMinimizeDrift(gaps: ReadonlyMap<string, number>, cash: number) {
  const positive = [...gaps.values()].filter((gap) => gap > 0);
  if (cash <= 0 || positive.length === 0) {
    return new Map([...gaps.keys()].map((isin) => [isin, 0]));
  }
  const level = waterLevel(positive, cash);
  return new Map([...gaps].map(([isin, gap]) => [isin, Math.max(0, gap - level)]));
}

/** Round to 0.01 PLN (largest remainder) without ever exceeding `cash`. */
function roundToGrosz(amounts: ReadonlyMap<string, number>, cash: number) {
  const cashGrosze = Math.floor(cash * 100 + 1e-9);
  const raw = new Map([...amounts].map(([isin, amount]) => [isin, amount * 100]));
  const floors = new Map([...raw].map(([isin, value]) => [isin, Math.floor(value + 1e-9)]));
  const budget = Math.min(roundHalfEven(pySum(raw.values())), cashGrosze) - pySum(floors.values());
  const remainder = (isin: string) => (raw.get(isin) as number) - (floors.get(isin) as number);
  // Array.prototype.sort is stable, matching Python's `sorted(..., reverse=True)` on ties.
  const byRemainder = [...raw.keys()].sort((a, b) => remainder(b) - remainder(a));
  for (const isin of byRemainder.slice(0, Math.max(0, budget))) {
    floors.set(isin, (floors.get(isin) as number) + 1);
  }
  return new Map([...floors].map(([isin, grosze]) => [isin, grosze / 100]));
}

/**
 * Computes the buy-only plan. Throws `PortfolioValidationError` for inputs the CLI
 * would have rejected at load time (bad weights, duplicate ISINs, negative amounts).
 */
export function computePlan(portfolio: Portfolio): RebalancePlan {
  assertValidPortfolio(portfolio);

  const positionsByIsin = new Map(portfolio.positions.map((p) => [p.isin, p]));
  const targetIsins = new Set(portfolio.targets.map((t) => t.isin));

  const positionsTotal = pySum(portfolio.positions.map((p) => p.valuePln));
  const total = positionsTotal + portfolio.cashPln;
  const warnings: PlanWarning[] = [];

  const legs: Leg[] = portfolio.targets.map((t) => {
    const position = positionsByIsin.get(t.isin);
    return {
      isin: t.isin,
      label: position?.label ?? null,
      currentPln: position?.valuePln ?? 0,
      targetWeight: t.weight,
      targetPln: total * t.weight,
    };
  });
  // Held positions outside the target stay visible (target 0%, never sold or bought).
  for (const position of portfolio.positions) {
    if (!targetIsins.has(position.isin)) {
      warnings.push({ code: "not_in_target", isin: position.isin });
      legs.push({
        isin: position.isin,
        label: position.label ?? null,
        currentPln: position.valuePln,
        targetWeight: 0,
        targetPln: 0,
      });
    }
  }

  const cash = portfolio.cashPln;
  const gaps = new Map(legs.map((leg) => [leg.isin, Math.max(0, leg.targetPln - leg.currentPln)]));
  if (pySum(gaps.values()) - cash > EPSILON_PLN) {
    warnings.push({ code: "cash_constrained", cashPln: cash });
  }

  const buys = roundToGrosz(allocateCashToMinimizeDrift(gaps, cash), cash);

  const deployed = pySum(buys.values());
  const investedAfter = positionsTotal + deployed;
  const orders: BuyOrder[] = legs.map((leg) => {
    const buyPln = buys.get(leg.isin) as number;
    const currentWeight = positionsTotal > 0 ? leg.currentPln / positionsTotal : 0;
    const afterWeight = investedAfter > 0 ? (leg.currentPln + buyPln) / investedAfter : 0;
    return {
      isin: leg.isin,
      label: leg.label,
      currentPln: leg.currentPln,
      targetPln: leg.targetPln,
      currentWeight,
      targetWeight: leg.targetWeight,
      driftPp: (leg.targetWeight - currentWeight) * 100,
      buyPln,
      afterWeight,
      driftAfterPp: (leg.targetWeight - afterWeight) * 100,
    };
  });

  return {
    totalPln: total,
    positionsPln: positionsTotal,
    cashPln: cash,
    orders,
    cashDeployed: deployed,
    leftoverCash: Math.max(0, cash - deployed),
    warnings,
  };
}

/** The CLI's English wording, kept for parity tests and plain-text export. */
export function formatWarningEn(warning: PlanWarning): string {
  switch (warning.code) {
    case "not_in_target":
      return `Position ${warning.isin} not in target allocation`;
    case "cash_constrained": {
      const amount = warning.cashPln.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `Buy orders constrained to available cash (${amount} PLN)`;
    }
  }
}
