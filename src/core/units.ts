/**
 * Whole-unit purchase plan.
 *
 * Takes the amount plan (`computePlan`) as the ideal and turns it into a number of whole
 * units per instrument at the user's prices, within the cash available after broker costs.
 * Unlike the amount plan this is a discrete problem, so it is solved by search:
 *
 *   minimise  J = sum_i (ideal_i - cost_i(units_i))^2   subject to   sum_i cost_i + fee_i <= cash
 *
 * Everything is integer grosze, unit costs are exact rationals (price x rate is never
 * rounded before multiplying by the number of units) and always rounded up, so a plan can
 * only ever cost less than shown, never more. The search is deterministic: ties are broken
 * by instrument order.
 */
import type { RebalancePlan } from "./types";

/** Cost of one unit in grosze as the exact fraction `num / den`. */
export interface UnitCost {
  readonly num: bigint;
  readonly den: bigint;
}

export interface Commission {
  /** Parts per million of the order value (3900 = 0.39%). */
  readonly ratePpm: number;
  /** Minimum fee per order, in grosze. Applies to every order with at least one unit. */
  readonly minGrosze: number;
}

export const NO_COMMISSION: Commission = { ratePpm: 0, minGrosze: 0 };

/** Fees above this share of an order are flagged. */
export const HIGH_FEE_SHARE = 0.01;

export interface UnitOrder {
  readonly isin: string;
  readonly label: string | null;
  /** Null when no price is known: such an instrument is never bought. */
  readonly unitCost: UnitCost | null;
  readonly units: number;
  readonly costPln: number;
  readonly feePln: number;
  /** What the amount plan would have bought (PLN). */
  readonly idealBuyPln: number;
  readonly currentWeight: number;
  readonly targetWeight: number;
  readonly afterWeight: number;
  readonly driftAfterPp: number;
}

export type UnitWarning =
  | { readonly code: "no_price"; readonly isin: string }
  | { readonly code: "high_fee"; readonly isin: string; readonly share: number };

export interface UnitPlan {
  readonly orders: readonly UnitOrder[];
  /** Cost of the units alone / broker fees / both / cash not spent (PLN). */
  readonly unitsPln: number;
  readonly feesPln: number;
  readonly outlayPln: number;
  readonly leftoverPln: number;
  readonly warnings: readonly UnitWarning[];
}

/** `price x rate` in grosze per unit, exact. `rate` is omitted for PLN prices. */
export function unitCostFromPrice(price: string, rate?: string): UnitCost {
  const scaled = (s: string) => {
    const [int = "0", frac = ""] = s.split(".");
    return { n: BigInt(int + frac), scale: frac.length };
  };
  const p = scaled(price);
  const r = scaled(rate ?? "1");
  return { num: p.n * r.n * 100n, den: 10n ** BigInt(p.scale + r.scale) };
}

const costOf = (unit: UnitCost, n: number): number =>
  n === 0 ? 0 : Number((BigInt(n) * unit.num + unit.den - 1n) / unit.den);

function feeOf(commission: Commission, costGrosze: number): number {
  if (costGrosze <= 0) return 0;
  const ppm = BigInt(commission.ratePpm);
  const proportional = Number((BigInt(costGrosze) * ppm + 999_999n) / 1_000_000n);
  return Math.max(commission.minGrosze, proportional);
}

interface Leg {
  readonly index: number;
  readonly ideal: number;
  readonly unit: UnitCost;
  units: number;
}

/** Largest number of units whose cost does not exceed `amount` grosze. */
function unitsWithin(unit: UnitCost, amount: number): number {
  let n = Number((BigInt(amount) * unit.den) / unit.num);
  while (n > 0 && costOf(unit, n) > amount) n--;
  while (costOf(unit, n + 1) <= amount) n++;
  return n;
}

const MAX_MOVES = 2000;
const MAX_ROUNDS = 20;
const PAIR_SEARCH_LIMIT = 40;
const PAIR_WINDOW = 40;

export function computeUnitPlan(
  plan: RebalancePlan,
  prices: ReadonlyMap<string, UnitCost>,
  commission: Commission = NO_COMMISSION,
): UnitPlan {
  const cashGrosze = Math.floor(plan.cashPln * 100 + 1e-9);
  const warnings: UnitWarning[] = [];

  const legs: Leg[] = [];
  plan.orders.forEach((order, index) => {
    const ideal = Math.round(order.buyPln * 100);
    const unit = prices.get(order.isin);
    if (ideal > 0 && !unit) warnings.push({ code: "no_price", isin: order.isin });
    if (ideal > 0 && unit) legs.push({ index, ideal, unit, units: unitsWithin(unit, ideal) });
  });

  const cost = (leg: Leg, n: number) => costOf(leg.unit, n);
  const outlay = (leg: Leg, n: number) => {
    const c = cost(leg, n);
    return c + feeOf(commission, c);
  };
  // Squared miss for an order that costs `c`; BigInt because squares overflow doubles.
  const miss = (leg: Leg, c: number) => BigInt(leg.ideal - c) ** 2n;
  const spent = () => legs.reduce((sum, leg) => sum + outlay(leg, leg.units), 0);

  // Fees can push the greedy start over budget: give units back where it hurts least.
  while (spent() > cashGrosze) {
    let best: { leg: Leg; delta: bigint } | null = null;
    for (const leg of legs) {
      if (leg.units === 0) continue;
      const delta = miss(leg, cost(leg, leg.units - 1)) - miss(leg, cost(leg, leg.units));
      if (best === null || delta < best.delta) best = { leg, delta };
    }
    if (best === null) break;
    best.leg.units--;
  }

  // Steepest descent over add / remove / swap, one unit at a time.
  const descend = (): boolean => {
    let improved = false;
    for (let move = 0; move < MAX_MOVES; move++) {
      const total = spent();
      let best: { delta: bigint; add: Leg | null; remove: Leg | null } | null = null;
      const consider = (delta: bigint, add: Leg | null, remove: Leg | null) => {
        if (delta < 0n && (best === null || delta < best.delta)) best = { delta, add, remove };
      };
      const gain = (leg: Leg) =>
        miss(leg, cost(leg, leg.units + 1)) - miss(leg, cost(leg, leg.units));
      const loss = (leg: Leg) =>
        miss(leg, cost(leg, leg.units - 1)) - miss(leg, cost(leg, leg.units));
      const extra = (leg: Leg) => outlay(leg, leg.units + 1) - outlay(leg, leg.units);
      const freed = (leg: Leg) => outlay(leg, leg.units) - outlay(leg, leg.units - 1);

      for (const add of legs) {
        if (total + extra(add) <= cashGrosze) consider(gain(add), add, null);
        for (const remove of legs) {
          if (remove === add || remove.units === 0) continue;
          if (total + extra(add) - freed(remove) <= cashGrosze) {
            consider(gain(add) + loss(remove), add, remove);
          }
        }
      }
      for (const remove of legs) if (remove.units > 0) consider(loss(remove), null, remove);

      const chosen = best as { add: Leg | null; remove: Leg | null } | null;
      if (chosen === null) break;
      if (chosen.add) chosen.add.units++;
      if (chosen.remove) chosen.remove.units--;
      improved = true;
    }
    return improved;
  };

  // One unit at a time cannot trade a pricey unit for several cheap ones. For every pair,
  // re-solve both exactly with everything else fixed: enumerate the first leg around its
  // ideal and give the second the best affordable count. Skipped for very large portfolios.
  const improvePairs = (): boolean => {
    if (legs.length > PAIR_SEARCH_LIMIT) return false;
    let improved = false;
    const affordable = (leg: Leg, budget: number) => {
      let n = unitsWithin(leg.unit, budget);
      while (n > 0 && outlay(leg, n) > budget) n--;
      return n;
    };
    for (let a = 0; a < legs.length; a++) {
      for (let b = a + 1; b < legs.length; b++) {
        const first = legs[a] as Leg;
        const second = legs[b] as Leg;
        const budget =
          cashGrosze - spent() + outlay(first, first.units) + outlay(second, second.units);
        let bestMiss =
          miss(first, cost(first, first.units)) + miss(second, cost(second, second.units));
        let pick: [number, number] | null = null;
        const centre = unitsWithin(first.unit, first.ideal);
        for (let u = Math.max(0, centre - PAIR_WINDOW); u <= centre + 2; u++) {
          const rest = budget - outlay(first, u);
          if (rest < 0) break;
          const fit = affordable(second, rest);
          const ideal = unitsWithin(second.unit, second.ideal);
          for (const v of [Math.min(ideal, fit), Math.min(ideal + 1, fit)]) {
            const total = miss(first, cost(first, u)) + miss(second, cost(second, v));
            if (total < bestMiss) {
              bestMiss = total;
              pick = [u, v];
            }
          }
        }
        if (pick) {
          [first.units, second.units] = pick;
          improved = true;
        }
      }
    }
    return improved;
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    descend();
    if (!improvePairs()) break;
  }

  const unitsByIndex = new Map(legs.map((leg) => [leg.index, leg]));
  const positionsGrosze = Math.round(plan.positionsPln * 100);
  const bought = legs.reduce((sum, leg) => sum + cost(leg, leg.units), 0);
  const fees = legs.reduce((sum, leg) => sum + feeOf(commission, cost(leg, leg.units)), 0);
  const investedAfter = (positionsGrosze + bought) / 100;

  const orders: UnitOrder[] = plan.orders.map((order, index) => {
    const leg = unitsByIndex.get(index);
    const costGrosze = leg ? cost(leg, leg.units) : 0;
    const feeGrosze = feeOf(commission, costGrosze);
    const afterWeight =
      investedAfter > 0 ? (order.currentPln + costGrosze / 100) / investedAfter : 0;
    if (costGrosze > 0 && feeGrosze / costGrosze > HIGH_FEE_SHARE) {
      warnings.push({ code: "high_fee", isin: order.isin, share: feeGrosze / costGrosze });
    }
    return {
      isin: order.isin,
      label: order.label,
      unitCost: prices.get(order.isin) ?? null,
      units: leg?.units ?? 0,
      costPln: costGrosze / 100,
      feePln: feeGrosze / 100,
      idealBuyPln: order.buyPln,
      currentWeight: order.currentWeight,
      targetWeight: order.targetWeight,
      afterWeight,
      driftAfterPp: (order.targetWeight - afterWeight) * 100,
    };
  });

  return {
    orders,
    unitsPln: bought / 100,
    feesPln: fees / 100,
    outlayPln: (bought + fees) / 100,
    leftoverPln: (cashGrosze - bought - fees) / 100,
    warnings,
  };
}
