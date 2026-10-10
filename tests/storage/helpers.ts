import type { StoredPortfolio, StoredPosition } from "@/storage/model";

export const A = "IE00BK5BQT80";
export const B = "IE00B4L5Y983";
export const C = "IE00B5BMR087";

export const position = (
  isin: string,
  weight: string,
  value: string,
  extra: Partial<StoredPosition> = {},
): StoredPosition => ({
  isin,
  targetWeight: weight,
  valuation: { mode: "manual", valuePln: value },
  ...extra,
});

export const portfolio = (over: Partial<StoredPortfolio> = {}): StoredPortfolio => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "IKZE",
  baseCurrency: "PLN",
  cashPln: "500",
  positions: [
    position(A, "0.6", "45000", { label: "VWCE" }),
    position(B, "0.4", "30000", { label: "IWDA" }),
  ],
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-02T10:00:00.000Z",
  ...over,
});
