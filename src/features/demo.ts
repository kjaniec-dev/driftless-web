import type { Portfolio } from "@/core";

/** The Driftless CLI's `examples/portfolio.example.json`; used as in-memory demo data. */
export const demoPortfolio: Portfolio = {
  baseCurrency: "PLN",
  asOf: "2026-06-03",
  cashPln: 500,
  positions: [
    { isin: "IE00B5BMR087", valuePln: 3400, label: "SXR8" },
    { isin: "IE0006WW1TQ4", valuePln: 4300, label: "EXUS" },
    { isin: "IE00BKM4GZ66", valuePln: 1200, label: "IS3N" },
    { isin: "IE00B4ND3602", valuePln: 1100, label: "EGLN" },
  ],
  targets: [
    { isin: "IE00B5BMR087", weight: 0.3 },
    { isin: "IE0006WW1TQ4", weight: 0.4 },
    { isin: "IE00BKM4GZ66", weight: 0.15 },
    { isin: "IE00B4ND3602", weight: 0.15 },
  ],
};
