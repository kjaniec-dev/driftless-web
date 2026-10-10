import { PortfolioValidationError, type ValidationIssue } from "./errors";
import { pySum } from "./float";
import type { Portfolio } from "./types";

export const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
/** Same tolerance as the CLI: target weights must sum to 1.0 within 1e-4. */
export const WEIGHT_SUM_TOLERANCE = 1e-4;

const isAmount = (n: number) => Number.isFinite(n) && n >= 0;

/** Collects every problem instead of stopping at the first one (the UI shows them all). */
export function validatePortfolio(portfolio: Portfolio): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isAmount(portfolio.cashPln)) issues.push({ code: "invalid_amount", field: "cash" });
  if (portfolio.targets.length === 0) issues.push({ code: "no_targets" });

  for (const p of portfolio.positions) {
    if (!ISIN_PATTERN.test(p.isin)) issues.push({ code: "invalid_isin", isin: p.isin });
    if (!isAmount(p.valuePln)) {
      issues.push({ code: "invalid_amount", field: "position", isin: p.isin });
    }
  }
  for (const t of portfolio.targets) {
    if (!ISIN_PATTERN.test(t.isin)) issues.push({ code: "invalid_isin", isin: t.isin });
    if (!(Number.isFinite(t.weight) && t.weight > 0 && t.weight <= 1)) {
      issues.push({ code: "invalid_weight", isin: t.isin });
    }
  }

  if (portfolio.targets.length > 0) {
    const sum = pySum(portfolio.targets.map((t) => t.weight));
    if (!(Math.abs(sum - 1) <= WEIGHT_SUM_TOLERANCE)) issues.push({ code: "weights_sum", sum });
  }

  for (const isin of duplicates(portfolio.positions.map((p) => p.isin))) {
    issues.push({ code: "duplicate_position", isin });
  }
  for (const isin of duplicates(portfolio.targets.map((t) => t.isin))) {
    issues.push({ code: "duplicate_target", isin });
  }

  const total = pySum(portfolio.positions.map((p) => p.valuePln)) + portfolio.cashPln;
  if (!(total > 0)) issues.push({ code: "total_not_positive" });

  return issues;
}

export function assertValidPortfolio(portfolio: Portfolio): void {
  const issues = validatePortfolio(portfolio);
  if (issues.length > 0) throw new PortfolioValidationError(issues);
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) (seen.has(v) ? dupes : seen).add(v);
  return [...dupes];
}
