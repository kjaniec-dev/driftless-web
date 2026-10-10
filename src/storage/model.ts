/**
 * Persisted portfolio model (PRD §8). Money and weights are canonical decimal strings;
 * only `toEnginePortfolio` turns them into numbers.
 */

export const FX_CURRENCIES = ["EUR", "USD", "GBP", "CHF"] as const;
export type FxCurrency = (typeof FX_CURRENCIES)[number];

export const LIMITS = {
  portfolios: 200,
  positions: 500,
  text: 100,
  /** Largest commission rate accepted (10%): anything above is almost certainly a typo. */
  commissionRate: 0.1,
} as const;

export interface FxRate {
  /** PLN per one unit of the foreign currency, canonical decimal string. */
  readonly mid: string;
  /** Publication date of the rate (NBP effective date), `YYYY-MM-DD`; null for manual rates. */
  readonly effectiveDate: string | null;
  readonly source: "nbp" | "manual";
}

export type Valuation =
  | { readonly mode: "manual"; readonly valuePln: string }
  | {
      readonly mode: "fx";
      readonly value: string;
      readonly currency: FxCurrency;
      readonly rate: FxRate;
    };

/** Price of one unit as the user typed it (never fetched): a quote, not a valuation. */
export interface UnitPrice {
  /** Price per unit in `currency`, canonical decimal string, greater than zero. */
  readonly value: string;
  readonly currency: "PLN" | FxCurrency;
  /** PLN per unit of `currency`; present exactly when the currency is not PLN. */
  readonly rate?: FxRate;
  /** Date of the quote `YYYY-MM-DD`, so a stale one can be flagged. */
  readonly quotedOn?: string;
}

export interface StoredPosition {
  readonly isin: string;
  readonly label?: string;
  readonly ticker?: string;
  /** Fraction in [0, 1] as a decimal string, e.g. "0.30". "0" = held but not targeted. */
  readonly targetWeight: string;
  readonly valuation: Valuation;
  readonly price?: UnitPrice;
}

/** Broker costs of one buy order. Both zero (or absent) means "no costs". */
export interface BrokerCosts {
  /** Fraction of the order value in [0, 0.1] with at most six decimals, e.g. "0.0039". */
  readonly commissionRate: string;
  /** Minimum fee per order in PLN, canonical decimal string. */
  readonly commissionMinPln: string;
}

export interface StoredPortfolio {
  readonly id: string;
  readonly name: string;
  readonly baseCurrency: "PLN";
  /** Valuation date `YYYY-MM-DD`. */
  readonly asOf?: string;
  /** Cash to invest, canonical decimal string. */
  readonly cashPln: string;
  readonly costs?: BrokerCosts;
  readonly positions: readonly StoredPosition[];
  /** ISO timestamps. */
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const isFxCurrency = (v: unknown): v is FxCurrency =>
  (FX_CURRENCIES as readonly unknown[]).includes(v);
