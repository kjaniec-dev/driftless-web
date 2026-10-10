import type { PlanWarning, ValidationIssue } from "@/core";
import type { Lang } from "@/i18n";
import type { Dictionary } from "@/i18n/en";
import { formatPercent, formatPln } from "@/lib/format";

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
