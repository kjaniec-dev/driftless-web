/**
 * NBP exchange rates (table A, mid rates) from the public Web API: https://api.nbp.pl
 *
 * The browser talks to NBP directly; no portfolio data is sent, only the currency code.
 * The NBP mid rate is an official reference rate, not a broker settlement rate: it
 * ignores spreads and commissions, and the UI says so.
 */
import { isCanonicalDecimal } from "@/core/decimal";
import { type FxCurrency, isFxCurrency } from "@/storage/model";
import { isValidDate } from "@/storage/validate";

export const NBP_BASE_URL = "https://api.nbp.pl/api/exchangerates/rates/a";
const DEFAULT_TIMEOUT_MS = 5000;

export interface NbpRate {
  readonly currency: FxCurrency;
  /** PLN per one unit of `currency`, canonical decimal string. */
  readonly mid: string;
  /** Publication date of the table the rate comes from, `YYYY-MM-DD`. */
  readonly effectiveDate: string;
}

export type NbpErrorCode = "unsupported_currency" | "network" | "timeout" | "http" | "bad_response";

export class NbpError extends Error {
  readonly code: NbpErrorCode;
  readonly status: number | undefined;
  constructor(code: NbpErrorCode, status?: number) {
    super(status ? `${code} (${status})` : code);
    this.name = "NbpError";
    this.code = code;
    this.status = status;
  }
}

export interface FetchOptions {
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

/** NBP publishes mids as JSON numbers with up to 4-6 decimals; keep them exact as text. */
function midToDecimal(mid: unknown): string | null {
  if (typeof mid !== "number" || !Number.isFinite(mid) || mid <= 0 || mid >= 1000) return null;
  const text = mid.toString().includes("e") ? mid.toFixed(8).replace(/0+$/, "") : mid.toString();
  return isCanonicalDecimal(text) ? text : null;
}

export function parseNbpResponse(data: unknown, currency: FxCurrency): NbpRate {
  const bad = () => new NbpError("bad_response");
  if (typeof data !== "object" || data === null) throw bad();
  const body = data as { table?: unknown; code?: unknown; rates?: unknown };
  if (body.table !== "A" || body.code !== currency) throw bad();
  if (!Array.isArray(body.rates) || body.rates.length === 0) throw bad();
  // The "last rate" endpoint returns a single entry; if several come back, the newest is last.
  const entry = body.rates[body.rates.length - 1] as { mid?: unknown; effectiveDate?: unknown };
  const mid = midToDecimal(entry?.mid);
  const date = entry?.effectiveDate;
  if (mid === null || typeof date !== "string" || !isValidDate(date)) throw bad();
  return { currency, mid, effectiveDate: date };
}

export async function fetchNbpRate(
  currency: FxCurrency,
  { fetch: fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, signal }: FetchOptions = {},
): Promise<NbpRate> {
  // Guards against a crafted value reaching the URL (the type alone is not a runtime check).
  if (!isFxCurrency(currency)) throw new NbpError("unsupported_currency");

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    const response = await fetchImpl(`${NBP_BASE_URL}/${currency}/?format=json`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new NbpError("http", response.status);
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new NbpError("bad_response");
    }
    return parseNbpResponse(data, currency);
  } catch (error) {
    if (error instanceof NbpError) throw error;
    throw new NbpError(timedOut ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
}

export interface NbpBatch {
  readonly rates: Partial<Record<FxCurrency, NbpRate>>;
  readonly errors: Partial<Record<FxCurrency, NbpError>>;
}

/** Fetches each distinct currency once; one failure does not lose the others. */
export async function fetchNbpRates(
  currencies: Iterable<FxCurrency>,
  options: FetchOptions = {},
): Promise<NbpBatch> {
  const unique = [...new Set(currencies)];
  const settled = await Promise.allSettled(unique.map((c) => fetchNbpRate(c, options)));
  const rates: Partial<Record<FxCurrency, NbpRate>> = {};
  const errors: Partial<Record<FxCurrency, NbpError>> = {};
  settled.forEach((result, i) => {
    const currency = unique[i] as FxCurrency;
    if (result.status === "fulfilled") rates[currency] = result.value;
    else
      errors[currency] =
        result.reason instanceof NbpError ? result.reason : new NbpError("network");
  });
  return { rates, errors };
}
