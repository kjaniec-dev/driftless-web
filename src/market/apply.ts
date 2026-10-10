import type { Draft } from "@/storage/draft";
import type { FxCurrency } from "@/storage/model";
import type { NbpRate } from "./nbp";

/** A price is only converted when it is set and not in PLN. */
const priceCurrency = (row: Draft["rows"][number]): FxCurrency | null =>
  row.price.trim() !== "" && row.priceCurrency !== "PLN" ? row.priceCurrency : null;

/** Currencies the draft still needs a rate for (foreign values and prices), each once. */
export const draftCurrencies = (draft: Draft): FxCurrency[] => [
  ...new Set(
    draft.rows.flatMap((r) => [
      ...(r.mode === "fx" ? [r.currency] : []),
      ...(priceCurrency(r) ? [r.priceCurrency as FxCurrency] : []),
    ]),
  ),
];

/** Writes fetched NBP rates (and their publication dates) into the draft's foreign rows. */
export function applyNbpRates(draft: Draft, rates: Partial<Record<FxCurrency, NbpRate>>): Draft {
  return {
    ...draft,
    rows: draft.rows.map((row) => {
      const valueRate = row.mode === "fx" ? rates[row.currency] : undefined;
      const unitCurrency = priceCurrency(row);
      const unitRate = unitCurrency ? rates[unitCurrency] : undefined;
      return {
        ...row,
        ...(valueRate
          ? { rate: valueRate.mid, rateSource: "nbp" as const, rateDate: valueRate.effectiveDate }
          : {}),
        ...(unitRate
          ? {
              priceRate: unitRate.mid,
              priceRateSource: "nbp" as const,
              priceRateDate: unitRate.effectiveDate,
            }
          : {}),
      };
    }),
  };
}
