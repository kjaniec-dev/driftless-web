import type { RebalancePlan, UnitPlan } from "@/core";
import type { StoredPortfolio } from "@/storage/model";

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * One CSV cell. Text coming from the user (labels) is neutralised against spreadsheet
 * formula injection (`=HYPERLINK(...)`, `@SUM(...)`, ...) by prefixing a quote.
 */
export function csvCell(value: string, isText = true): string {
  const safe = isText && FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const money = (n: number) => n.toFixed(2);
const pct = (fraction: number) => (fraction * 100).toFixed(2);

export const CSV_HEADER = [
  "isin",
  "label",
  "current_pln",
  "current_weight_pct",
  "target_weight_pct",
  "buy_pln",
  "after_weight_pct",
  "drift_after_pp",
] as const;

/**
 * The purchase plan as CSV (a result artefact, not a backup). UTF-8 with BOM so Excel
 * reads Polish characters; `.` decimals and `,` separators; CRLF line endings.
 */
export function planToCsv(plan: RebalancePlan): string {
  const rows = plan.orders.map((o) =>
    [
      csvCell(o.isin),
      csvCell(o.label ?? ""),
      csvCell(money(o.currentPln), false),
      csvCell(pct(o.currentWeight), false),
      csvCell(pct(o.targetWeight), false),
      csvCell(money(o.buyPln), false),
      csvCell(pct(o.afterWeight), false),
      csvCell(o.driftAfterPp.toFixed(2), false),
    ].join(","),
  );
  return `﻿${[CSV_HEADER.join(","), ...rows].join("\r\n")}\r\n`;
}

export const UNIT_CSV_HEADER = [
  "isin",
  "label",
  "units",
  "unit_price",
  "price_currency",
  "cost_pln",
  "fee_pln",
  "amount_plan_pln",
  "after_weight_pct",
  "drift_after_pp",
] as const;

/** The whole-unit plan as CSV, with the prices it was computed from. Same format as `planToCsv`. */
export function unitPlanToCsv(plan: UnitPlan, portfolio: StoredPortfolio): string {
  const priceOf = new Map(portfolio.positions.map((p) => [p.isin, p.price]));
  const rows = plan.orders.map((o) => {
    const price = priceOf.get(o.isin);
    return [
      csvCell(o.isin),
      csvCell(o.label ?? ""),
      csvCell(String(o.units), false),
      csvCell(price?.value ?? "", false),
      csvCell(price?.currency ?? "", false),
      csvCell(money(o.costPln), false),
      csvCell(money(o.feePln), false),
      csvCell(money(o.idealBuyPln), false),
      csvCell(pct(o.afterWeight), false),
      csvCell(o.driftAfterPp.toFixed(2), false),
    ].join(",");
  });
  return `﻿${[UNIT_CSV_HEADER.join(","), ...rows].join("\r\n")}\r\n`;
}
