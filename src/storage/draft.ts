import {
  fractionToPercent,
  fractionToPpm,
  normalizeDecimal,
  percentToFraction,
} from "@/core/decimal";
import { pySum } from "@/core/float";
import {
  FX_CURRENCIES,
  type FxCurrency,
  LIMITS,
  type StoredPortfolio,
  type StoredPosition,
  type UnitPrice,
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
  /** Price per unit as typed; blank = no price (the unit plan skips the instrument). */
  price: string;
  priceCurrency: "PLN" | FxCurrency;
  priceRate: string;
  priceRateSource: "nbp" | "manual";
  priceRateDate: string | null;
  /** Date the price was read, `YYYY-MM-DD` or blank. */
  priceDate: string;
}

export interface Draft {
  name: string;
  asOf: string;
  cash: string;
  /** Commission as a percent of the order value, and the minimum fee in PLN; both blank = none. */
  commissionPct: string;
  commissionMin: string;
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
    price: "",
    priceCurrency: "PLN",
    priceRate: "",
    priceRateSource: "manual",
    priceRateDate: null,
    priceDate: "",
  };
}

export function draftFromStored(p: StoredPortfolio): Draft {
  return {
    name: p.name,
    asOf: p.asOf ?? "",
    cash: p.cashPln,
    commissionPct: p.costs ? fractionToPercent(p.costs.commissionRate) : "",
    commissionMin: p.costs?.commissionMinPln ?? "",
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
        price: pos.price?.value ?? "",
        priceCurrency: pos.price?.currency ?? "PLN",
        priceRate: pos.price?.rate?.mid ?? "",
        priceRateSource: pos.price?.rate?.source ?? "manual",
        priceRateDate: pos.price?.rate?.effectiveDate ?? null,
        priceDate: pos.price?.quotedOn ?? "",
      };
    }),
  };
}

export interface DraftResult {
  /** Present only when the draft is complete and valid, i.e. safe to save. */
  readonly portfolio: StoredPortfolio | null;
  readonly issues: readonly StoredIssue[];
}

function draftPrice(row: DraftRow): UnitPrice | null {
  const value = normalizeDecimal(row.price);
  if (value === null || Number(value) <= 0) return null;
  const quotedOn = row.priceDate.trim();
  const when = quotedOn ? { quotedOn } : {};
  if (row.priceCurrency === "PLN") return { value, currency: "PLN", ...when };
  const mid = normalizeDecimal(row.priceRate);
  if (mid === null || Number(mid) <= 0) return null;
  return {
    value,
    currency: row.priceCurrency,
    rate: {
      mid,
      source: row.priceRateSource,
      effectiveDate: row.priceRateSource === "nbp" ? row.priceRateDate : null,
    },
    ...when,
  };
}

/** `undefined` = no costs entered, `null` = entered but unreadable. */
function draftCosts(draft: Draft): StoredPortfolio["costs"] | null | undefined {
  if (draft.commissionPct.trim() === "" && draft.commissionMin.trim() === "") return undefined;
  const rate = percentToFraction(draft.commissionPct.trim() === "" ? "0" : draft.commissionPct);
  const min = amount(draft.commissionMin);
  if (rate === null || min === null) return null;
  if (Number(rate) > LIMITS.commissionRate || fractionToPpm(rate) === null) return null;
  return { commissionRate: rate, commissionMinPln: min };
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

    let price: UnitPrice | null | undefined;
    if (row.price.trim() !== "") {
      price = draftPrice(row);
      if (price === null) issues.push({ code: "position_price", index });
    }

    if (weight !== null && valuation !== null && price !== null) {
      const label = row.label.trim();
      const ticker = row.ticker.trim();
      positions.push({
        isin: row.isin.trim().toUpperCase(),
        ...(label ? { label } : {}),
        ...(ticker ? { ticker } : {}),
        targetWeight: weight,
        valuation,
        ...(price ? { price } : {}),
      });
    }
  });

  const costs = draftCosts(draft);
  if (costs === null) issues.push({ code: "invalid_commission" });

  const asOf = draft.asOf.trim();
  const candidate: StoredPortfolio = {
    id: base.id,
    name: draft.name.trim(),
    baseCurrency: "PLN",
    ...(asOf ? { asOf } : {}),
    cashPln: cash ?? "0",
    ...(costs ? { costs } : {}),
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
