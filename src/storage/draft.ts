import { fractionToPercent, normalizeDecimal, percentToFraction } from "@/core/decimal";
import { pySum } from "@/core/float";
import {
  FX_CURRENCIES,
  type FxCurrency,
  type StoredPortfolio,
  type StoredPosition,
  type Valuation,
} from "./model";
import { type StoredIssue, validateStoredPortfolio } from "./validate";

/** One editable instrument; every field is the raw text the user typed. */
export interface DraftRow {
  readonly key: string;
  isin: string;
  label: string;
  ticker: string;
  mode: "manual" | "fx";
  /** PLN amount in manual mode, foreign-currency amount in fx mode. */
  value: string;
  currency: FxCurrency;
  rate: string;
  rateSource: "nbp" | "manual";
  rateDate: string | null;
  weightPct: string;
}

export interface Draft {
  name: string;
  asOf: string;
  cash: string;
  rows: DraftRow[];
}

let counter = 0;
export const newRowKey = () => `row-${++counter}`;

export function emptyRow(): DraftRow {
  return {
    key: newRowKey(),
    isin: "",
    label: "",
    ticker: "",
    mode: "manual",
    value: "",
    currency: FX_CURRENCIES[0],
    rate: "",
    rateSource: "manual",
    rateDate: null,
    weightPct: "",
  };
}

export function draftFromStored(p: StoredPortfolio): Draft {
  return {
    name: p.name,
    asOf: p.asOf ?? "",
    cash: p.cashPln,
    rows: p.positions.map((pos) => {
      const v = pos.valuation;
      return {
        key: newRowKey(),
        isin: pos.isin,
        label: pos.label ?? "",
        ticker: pos.ticker ?? "",
        mode: v.mode,
        value: v.mode === "manual" ? v.valuePln : v.value,
        currency: v.mode === "fx" ? v.currency : FX_CURRENCIES[0],
        rate: v.mode === "fx" ? v.rate.mid : "",
        rateSource: v.mode === "fx" ? v.rate.source : "manual",
        rateDate: v.mode === "fx" ? v.rate.effectiveDate : null,
        weightPct: fractionToPercent(pos.targetWeight),
      };
    }),
  };
}

export interface DraftResult {
  /** Present only when the draft is complete and valid, i.e. safe to save. */
  readonly portfolio: StoredPortfolio | null;
  readonly issues: readonly StoredIssue[];
}

/** Blank amount fields count as zero (target-only rows have no value yet). */
const amount = (raw: string) => normalizeDecimal(raw.trim() === "" ? "0" : raw);

export function draftToStored(draft: Draft, base: StoredPortfolio, now: string): DraftResult {
  const issues: StoredIssue[] = [];

  const cash = amount(draft.cash);
  if (cash === null) issues.push({ code: "invalid_cash" });

  const positions: StoredPosition[] = [];
  draft.rows.forEach((row, index) => {
    const weight = percentToFraction(row.weightPct.trim() === "" ? "0" : row.weightPct);
    if (weight === null) issues.push({ code: "position_weight", index });

    const value = amount(row.value);
    if (value === null) issues.push({ code: "position_amount", index });

    let valuation: Valuation | null = null;
    if (row.mode === "manual") {
      if (value !== null) valuation = { mode: "manual", valuePln: value };
    } else {
      const mid = normalizeDecimal(row.rate);
      if (mid === null || Number(mid) <= 0) issues.push({ code: "position_rate", index });
      else if (value !== null) {
        valuation = {
          mode: "fx",
          value,
          currency: row.currency,
          rate: {
            mid,
            source: row.rateSource,
            effectiveDate: row.rateSource === "nbp" ? row.rateDate : null,
          },
        };
      }
    }

    if (weight !== null && valuation !== null) {
      const label = row.label.trim();
      const ticker = row.ticker.trim();
      positions.push({
        isin: row.isin.trim().toUpperCase(),
        ...(label ? { label } : {}),
        ...(ticker ? { ticker } : {}),
        targetWeight: weight,
        valuation,
      });
    }
  });

  const asOf = draft.asOf.trim();
  const candidate: StoredPortfolio = {
    id: base.id,
    name: draft.name.trim(),
    baseCurrency: "PLN",
    ...(asOf ? { asOf } : {}),
    cashPln: cash ?? "0",
    positions,
    createdAt: base.createdAt,
    updatedAt: now,
  };

  // Parse failures already carry the row index; the stored model cannot represent them,
  // so validate it only when every field parsed.
  if (issues.length > 0 || positions.length !== draft.rows.length) {
    return {
      portfolio: null,
      issues: [...issues, ...validateStoredPortfolio({ ...candidate, positions: [] })],
    };
  }
  const stored = validateStoredPortfolio(candidate);
  return { portfolio: stored.length === 0 ? candidate : null, issues: stored };
}

/** Sum of the weights typed so far (percent), ignoring unparsable rows; for live feedback. */
export function draftWeightSumPercent(draft: Draft): number {
  return pySum(
    draft.rows.map((r) => {
      const f = percentToFraction(r.weightPct.trim() === "" ? "0" : r.weightPct);
      return f === null ? 0 : Number(f) * 100;
    }),
  );
}
