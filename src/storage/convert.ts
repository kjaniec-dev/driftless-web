import type { Portfolio, Position, Target } from "@/core";
import { fractionToPercent } from "@/core/decimal";
import type { StoredPortfolio, StoredPosition } from "./model";
import { positionValue } from "./validate";

/**
 * Stored portfolio -> engine input. Instruments that are neither held nor targeted are
 * dropped so they cannot trigger "not in target" warnings. Returns the portfolio as the
 * CLI would see it: held positions plus the targeted instruments.
 */
export function toEnginePortfolio(p: StoredPortfolio, cashOverride?: number): Portfolio {
  const positions: Position[] = [];
  const targets: Target[] = [];
  for (const pos of p.positions) {
    const valuePln = positionValue(pos);
    const weight = Number(pos.targetWeight);
    if (valuePln > 0 || weight > 0) {
      positions.push({ isin: pos.isin, valuePln, label: pos.label ?? pos.ticker });
    }
    if (weight > 0) targets.push({ isin: pos.isin, weight });
  }
  return {
    baseCurrency: "PLN",
    cashPln: cashOverride ?? Number(p.cashPln),
    positions,
    targets,
    asOf: p.asOf,
  };
}

/** Display helper: weight as a percent string without float noise. */
export const weightPercent = (pos: StoredPosition): string => fractionToPercent(pos.targetWeight);
