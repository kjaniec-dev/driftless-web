/**
 * Adapter for the Driftless CLI `portfolio.json` (schemas/portfolio.schema.json).
 *
 * Kept separate from the native web backup format: the CLI schema forbids extra
 * properties, so web-only data must never be written here.
 */
import { CliFormatError } from "./errors";
import type { Portfolio, Position, Target } from "./types";
import { assertValidPortfolio, ISIN_PATTERN } from "./validate";

export const CLI_CURRENCIES = ["PLN", "EUR", "USD", "GBP", "CHF"] as const;
export type CliCurrency = (typeof CLI_CURRENCIES)[number];

/** PLN per one unit of foreign currency (e.g. NBP table A mid rate). */
export type FxRates = Partial<Record<Exclude<CliCurrency, "PLN">, number>>;

export interface CliPortfolioJson {
  base_currency: "PLN";
  as_of?: string;
  cash_pln: number;
  positions: Array<{ isin: string; value_pln: number; label?: string }>;
  target: Array<{ isin: string; weight: number }>;
}

type Obj = Record<string, unknown>;

const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function expectObject(v: unknown, path: string, allowed: readonly string[]): Obj {
  if (!isObject(v)) throw new CliFormatError(path, "Expected an object");
  for (const key of Object.keys(v)) {
    if (!allowed.includes(key)) throw new CliFormatError(`${path}/${key}`, "Unknown property");
  }
  return v;
}

function number(obj: Obj, key: string, path: string, ok: (n: number) => boolean, rule: string) {
  const v = obj[key];
  if (!isNumber(v)) throw new CliFormatError(`${path}/${key}`, "Expected a number");
  if (!ok(v)) throw new CliFormatError(`${path}/${key}`, `Must be ${rule}`);
  return v;
}

function isin(obj: Obj, path: string): string {
  const v = obj.isin;
  if (typeof v !== "string") throw new CliFormatError(`${path}/isin`, "Expected a string");
  if (!ISIN_PATTERN.test(v)) throw new CliFormatError(`${path}/isin`, "Invalid ISIN format");
  return v;
}

function parsePosition(raw: unknown, path: string, rates: FxRates): Position {
  const obj = expectObject(raw, path, ["isin", "value_pln", "value", "currency", "label"]);
  const id = isin(obj, path);

  let label: string | undefined;
  if ("label" in obj) {
    if (typeof obj.label !== "string" || obj.label.length === 0) {
      throw new CliFormatError(`${path}/label`, "Expected a non-empty string");
    }
    label = obj.label;
  }

  const nonNegative = (n: number) => n >= 0;
  if ("value_pln" in obj) {
    return { isin: id, valuePln: number(obj, "value_pln", path, nonNegative, "≥ 0"), label };
  }
  if (!("value" in obj) || !("currency" in obj)) {
    throw new CliFormatError(path, "Needs `value_pln`, or both `value` and `currency`");
  }
  const value = number(obj, "value", path, nonNegative, "≥ 0");
  const currency = obj.currency;
  if (!CLI_CURRENCIES.includes(currency as CliCurrency)) {
    throw new CliFormatError(`${path}/currency`, `Must be one of ${CLI_CURRENCIES.join(", ")}`);
  }
  if (currency === "PLN") return { isin: id, valuePln: value, label };
  const rate = rates[currency as Exclude<CliCurrency, "PLN">];
  if (!(typeof rate === "number" && Number.isFinite(rate) && rate > 0)) {
    throw new CliFormatError(`${path}/currency`, `No exchange rate available for ${currency}`);
  }
  return { isin: id, valuePln: value * rate, label };
}

function parseTarget(raw: unknown, path: string): Target {
  const obj = expectObject(raw, path, ["isin", "weight"]);
  return {
    isin: isin(obj, path),
    weight: number(obj, "weight", path, (n) => n > 0 && n <= 1, "in (0, 1]"),
  };
}

function array(v: unknown, path: string, minItems = 0): unknown[] {
  if (!Array.isArray(v)) throw new CliFormatError(path, "Expected an array");
  if (v.length < minItems) throw new CliFormatError(path, `Needs at least ${minItems} item(s)`);
  return v;
}

/**
 * Parses and validates a CLI snapshot. Foreign-currency positions need `rates`
 * (the CLI fetches them from NBP at load time; here the caller injects them).
 *
 * @throws CliFormatError for schema violations, PortfolioValidationError for business rules.
 */
export function parseCliPortfolio(input: unknown, rates: FxRates = {}): Portfolio {
  const root = expectObject(input, "", [
    "base_currency",
    "as_of",
    "cash_pln",
    "positions",
    "target",
  ]);
  for (const key of ["base_currency", "cash_pln", "positions", "target"]) {
    if (!(key in root)) throw new CliFormatError(`/${key}`, "Required property missing");
  }
  if (root.base_currency !== "PLN") throw new CliFormatError("/base_currency", "Must be PLN");
  // The CLI's jsonschema run does not enforce `format: date`, so any string is accepted.
  if ("as_of" in root && typeof root.as_of !== "string") {
    throw new CliFormatError("/as_of", "Expected a string");
  }

  const portfolio: Portfolio = {
    baseCurrency: "PLN",
    cashPln: number(root, "cash_pln", "", (n) => n >= 0, "≥ 0"),
    positions: array(root.positions, "/positions").map((p, i) =>
      parsePosition(p, `/positions/${i}`, rates),
    ),
    targets: array(root.target, "/target", 1).map((t, i) => parseTarget(t, `/target/${i}`)),
    asOf: typeof root.as_of === "string" ? root.as_of : undefined,
  };

  assertValidPortfolio(portfolio);
  return portfolio;
}

/** Serialises to the CLI schema exactly; positions are always written as `value_pln`. */
export function toCliPortfolio(portfolio: Portfolio): CliPortfolioJson {
  return {
    base_currency: "PLN",
    ...(portfolio.asOf !== undefined ? { as_of: portfolio.asOf } : {}),
    cash_pln: portfolio.cashPln,
    positions: portfolio.positions.map((p) => ({
      isin: p.isin,
      value_pln: p.valuePln,
      ...(p.label ? { label: p.label } : {}),
    })),
    target: portfolio.targets.map((t) => ({ isin: t.isin, weight: t.weight })),
  };
}
