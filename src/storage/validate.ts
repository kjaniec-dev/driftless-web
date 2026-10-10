import { ISIN_PATTERN, WEIGHT_SUM_TOLERANCE } from "@/core";
import { fractionToPpm, isCanonicalDecimal, multiplyToGrosz } from "@/core/decimal";
import { pySum } from "@/core/float";
import {
  type BrokerCosts,
  isFxCurrency,
  LIMITS,
  type StoredPortfolio,
  type StoredPosition,
  type UnitPrice,
} from "./model";

export type StoredIssue =
  | {
      readonly code:
        | "name_required"
        | "name_too_long"
        | "invalid_cash"
        | "invalid_as_of"
        | "invalid_commission";
    }
  | { readonly code: "too_many_positions" }
  | {
      readonly code:
        | "position_isin"
        | "position_text"
        | "position_amount"
        | "position_weight"
        | "position_rate"
        | "position_price"
        | "duplicate_isin";
      readonly index: number;
    }
  | { readonly code: "weights_sum"; readonly sum: number }
  | { readonly code: "total_not_positive" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

const nonNegative = (s: string) => isCanonicalDecimal(s) && Number.isFinite(Number(s));

/**
 * Whether a portfolio may be written to storage. An empty portfolio (no instruments yet)
 * is allowed so it can be created before it is filled in; as soon as instruments exist the
 * CLI rules apply: valid ISINs, no duplicates, weights summing to 100% (within 1e-4).
 */
export function validateStoredPortfolio(p: StoredPortfolio): StoredIssue[] {
  const issues: StoredIssue[] = [];

  if (p.name.trim() === "") issues.push({ code: "name_required" });
  else if (p.name.length > LIMITS.text) issues.push({ code: "name_too_long" });
  if (!nonNegative(p.cashPln)) issues.push({ code: "invalid_cash" });
  if (p.asOf !== undefined && !isValidDate(p.asOf)) issues.push({ code: "invalid_as_of" });
  if (p.costs !== undefined && !validBrokerCosts(p.costs))
    issues.push({ code: "invalid_commission" });
  if (p.positions.length > LIMITS.positions) issues.push({ code: "too_many_positions" });

  const seen = new Set<string>();
  p.positions.forEach((pos, index) => {
    issues.push(...validatePosition(pos, index));
    if (seen.has(pos.isin)) issues.push({ code: "duplicate_isin", index });
    seen.add(pos.isin);
  });

  if (p.positions.length > 0) {
    const weights = p.positions.map((x) => Number(x.targetWeight));
    const sum = pySum(weights.filter(Number.isFinite));
    if (!(Math.abs(sum - 1) <= WEIGHT_SUM_TOLERANCE)) issues.push({ code: "weights_sum", sum });

    const total = pySum(p.positions.map(positionValue)) + Number(p.cashPln);
    if (!(total > 0)) issues.push({ code: "total_not_positive" });
  }
  return issues;
}

export function positionValue(pos: StoredPosition): number {
  const v = pos.valuation;
  return Number(v.mode === "manual" ? v.valuePln : multiplyToGrosz(v.value, v.rate.mid));
}

/** Largest unit price or minimum fee accepted, in PLN: keeps every amount well inside 2^53 grosze. */
const MAX_AMOUNT_PLN = 1e9;

export function validBrokerCosts(costs: BrokerCosts): boolean {
  return (
    isCanonicalDecimal(costs.commissionRate) &&
    Number(costs.commissionRate) <= LIMITS.commissionRate &&
    fractionToPpm(costs.commissionRate) !== null &&
    nonNegative(costs.commissionMinPln) &&
    Number(costs.commissionMinPln) <= MAX_AMOUNT_PLN
  );
}

export function validUnitPrice(price: UnitPrice): boolean {
  if (!(isCanonicalDecimal(price.value) && Number(price.value) > 0)) return false;
  if (Number(price.value) > MAX_AMOUNT_PLN) return false;
  if (price.quotedOn !== undefined && !isValidDate(price.quotedOn)) return false;
  if (price.currency === "PLN") return price.rate === undefined;
  if (!isFxCurrency(price.currency) || price.rate === undefined) return false;
  const rate = price.rate;
  return (
    isCanonicalDecimal(rate.mid) &&
    Number(rate.mid) > 0 &&
    Number(rate.mid) <= MAX_AMOUNT_PLN &&
    (rate.source === "manual" || rate.source === "nbp") &&
    (rate.effectiveDate === null || isValidDate(rate.effectiveDate))
  );
}

function validatePosition(pos: StoredPosition, index: number): StoredIssue[] {
  const issues: StoredIssue[] = [];
  if (!ISIN_PATTERN.test(pos.isin)) issues.push({ code: "position_isin", index });
  if ((pos.label?.length ?? 0) > LIMITS.text || (pos.ticker?.length ?? 0) > LIMITS.text) {
    issues.push({ code: "position_text", index });
  }
  if (pos.label === "") issues.push({ code: "position_text", index });

  const w = pos.targetWeight;
  if (!(isCanonicalDecimal(w) && Number(w) <= 1)) issues.push({ code: "position_weight", index });

  if (pos.price !== undefined && !validUnitPrice(pos.price)) {
    issues.push({ code: "position_price", index });
  }

  const v = pos.valuation;
  if (v.mode === "manual") {
    if (!nonNegative(v.valuePln)) issues.push({ code: "position_amount", index });
  } else {
    if (!nonNegative(v.value)) issues.push({ code: "position_amount", index });
    const rateOk =
      isFxCurrency(v.currency) &&
      isCanonicalDecimal(v.rate.mid) &&
      Number(v.rate.mid) > 0 &&
      (v.rate.source === "manual" || v.rate.source === "nbp") &&
      (v.rate.effectiveDate === null || isValidDate(v.rate.effectiveDate));
    if (!rateOk) issues.push({ code: "position_rate", index });
  }
  return issues;
}
