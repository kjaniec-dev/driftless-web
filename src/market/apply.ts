import type { Draft } from "@/storage/draft";
import type { FxCurrency } from "@/storage/model";
import type { NbpRate } from "./nbp";

/** Currencies the draft still needs a rate for (foreign rows), each once. */
export const draftCurrencies = (draft: Draft): FxCurrency[] => [
  ...new Set(draft.rows.filter((r) => r.mode === "fx").map((r) => r.currency)),
];

/** Writes fetched NBP rates (and their publication dates) into the draft's foreign rows. */
export function applyNbpRates(draft: Draft, rates: Partial<Record<FxCurrency, NbpRate>>): Draft {
  return {
    ...draft,
    rows: draft.rows.map((row) => {
      const rate = row.mode === "fx" ? rates[row.currency] : undefined;
      return rate
        ? { ...row, rate: rate.mid, rateSource: "nbp", rateDate: rate.effectiveDate }
        : row;
    }),
  };
}
