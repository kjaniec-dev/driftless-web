import type { PlanWarning, ValidationIssue } from "@/core";
import type { Lang } from "@/i18n";
import type { Dictionary } from "@/i18n/en";
import { formatPercent, formatPln } from "@/lib/format";
import type { StoredIssue } from "@/storage/validate";

type Format = (template: string, values: Record<string, string | number>) => string;

export function describeIssue(
  issue: ValidationIssue,
  t: Dictionary,
  format: Format,
  lang: Lang,
): string {
  switch (issue.code) {
    case "invalid_isin":
    case "invalid_weight":
    case "duplicate_position":
    case "duplicate_target":
      return format(t.issues[issue.code], { isin: issue.isin });
    case "weights_sum":
      return format(t.issues.weights_sum, { sum: formatPercent(issue.sum, lang, 2) });
    case "invalid_amount":
    case "no_targets":
    case "total_not_positive":
      return t.issues[issue.code];
  }
}

export function describeWarning(
  warning: PlanWarning,
  t: Dictionary,
  format: Format,
  lang: Lang,
): string {
  switch (warning.code) {
    case "not_in_target":
      return format(t.rebalance.warnings.notInTarget, { isin: warning.isin });
    case "cash_constrained":
      return format(t.rebalance.warnings.cashConstrained, {
        amount: formatPln(warning.cashPln, lang),
      });
  }
}

/** Row-level issues carry a 0-based `index`; the UI numbers instruments from 1. */
export function describeStoredIssue(
  issue: StoredIssue,
  t: Dictionary,
  format: Format,
  lang: Lang,
): string {
  switch (issue.code) {
    case "weights_sum":
      return format(t.issues.weights_sum, { sum: formatPercent(issue.sum, lang, 2) });
    case "position_isin":
    case "position_text":
    case "position_amount":
    case "position_weight":
    case "position_rate":
    case "duplicate_isin":
      return format(t.issues[issue.code], { n: issue.index + 1 });
    default:
      return t.issues[issue.code];
  }
}
