import { toEnginePortfolio } from "@/storage/convert";
import type { StoredPortfolio } from "@/storage/model";

/** The Driftless CLI's `examples/portfolio.example.json`; held in memory, never persisted. */
export const demoStored: StoredPortfolio = {
  id: "demo",
  name: "Demo",
  baseCurrency: "PLN",
  asOf: "2026-06-03",
  cashPln: "500",
  costs: { commissionRate: "0.0039", commissionMinPln: "5" },
  positions: [
    {
      isin: "IE00B5BMR087",
      label: "SXR8",
      targetWeight: "0.3",
      valuation: pln("3400"),
      price: quote("2150.5"),
    },
    {
      isin: "IE0006WW1TQ4",
      label: "EXUS",
      targetWeight: "0.4",
      valuation: pln("4300"),
      price: quote("118.3"),
    },
    {
      isin: "IE00BKM4GZ66",
      label: "IS3N",
      targetWeight: "0.15",
      valuation: pln("1200"),
      price: quote("141.75"),
    },
    {
      isin: "IE00B4ND3602",
      label: "EGLN",
      targetWeight: "0.15",
      valuation: pln("1100"),
      price: quote("262.4"),
    },
  ],
  createdAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-03T00:00:00.000Z",
};

/** Illustrative prices, dated today so the demo does not show a stale-price warning. */
function quote(value: string) {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const quotedOn = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { value, currency: "PLN" as const, quotedOn };
}

function pln(valuePln: string) {
  return { mode: "manual" as const, valuePln };
}

/** Engine view of the demo (used by tests and the CSV reference case). */
export const demoPortfolio = toEnginePortfolio(demoStored);
