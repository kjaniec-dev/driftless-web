import type { RebalancePlan } from "@/core";

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
