import { describe, expect, it } from "vitest";
import {
  CliFormatError,
  PortfolioValidationError,
  parseCliPortfolio,
  toCliPortfolio,
} from "@/core";
import sampleFile from "../golden/sample_portfolio.json";

const A = "IE00BK5BQT80";
const B = "IE00B4L5Y983";
const base = () => ({
  base_currency: "PLN",
  cash_pln: 100,
  positions: [{ isin: A, value_pln: 1000, label: "VWCE" }],
  target: [
    { isin: A, weight: 0.6 },
    { isin: B, weight: 0.4 },
  ],
});
const fail = (input: unknown, path: string, rates = {}) => {
  try {
    parseCliPortfolio(input, rates);
  } catch (e) {
    expect(e).toBeInstanceOf(CliFormatError);
    expect((e as CliFormatError).path).toBe(path);
    return;
  }
  throw new Error("expected CliFormatError");
};

describe("CLI portfolio.json adapter", () => {
  it("reads the CLI sample files", () => {
    const sample = structuredClone(sampleFile);
    const p = parseCliPortfolio(sample);
    expect(p.cashPln).toBe(5000);
    expect(p.positions.map((x) => x.label)).toEqual(["VWCE", "IWDA"]);
    expect(p.asOf).toBe("2026-06-03");
  });

  it("round-trips through the CLI schema without adding properties", () => {
    const sample = structuredClone(sampleFile);
    const out = toCliPortfolio(parseCliPortfolio(sample));
    expect(out).toEqual(sample);
    expect(Object.keys(out)).toEqual(["base_currency", "as_of", "cash_pln", "positions", "target"]);
  });

  it("converts foreign-currency positions with injected rates", () => {
    const input = base();
    input.positions = [{ isin: A, value: 100, currency: "EUR" } as never];
    expect(parseCliPortfolio(input, { EUR: 4.25 }).positions[0]?.valuePln).toBe(425);
    fail(input, "/positions/0/currency");
  });

  it("prefers value_pln over value+currency like the CLI", () => {
    const input = base();
    input.positions = [{ isin: A, value_pln: 7, value: 100, currency: "EUR" } as never];
    expect(parseCliPortfolio(input).positions[0]?.valuePln).toBe(7);
  });

  it("rejects extra properties, bad types and missing fields", () => {
    fail({ ...base(), extra: 1 }, "/extra");
    fail({ ...base(), base_currency: "EUR" }, "/base_currency");
    fail({ ...base(), cash_pln: -1 }, "/cash_pln");
    fail({ ...base(), cash_pln: "5" }, "/cash_pln");
    fail({ ...base(), target: [] }, "/target");
    fail({ base_currency: "PLN", cash_pln: 1, positions: [] }, "/target");
    fail({ ...base(), positions: [{ isin: "nope", value_pln: 1 }] }, "/positions/0/isin");
    fail({ ...base(), positions: [{ isin: A }] }, "/positions/0");
    fail({ ...base(), positions: [{ isin: A, value_pln: 1, label: "" }] }, "/positions/0/label");
    fail({ ...base(), target: [{ isin: A, weight: 0 }] }, "/target/0/weight");
    fail({ ...base(), target: [{ isin: A, weight: 1.5 }] }, "/target/0/weight");
    fail([], "");
    fail(null, "");
    fail("{}", "");
  });

  it("applies the CLI business rules after the schema", () => {
    const input = base();
    input.target = [
      { isin: A, weight: 0.5 },
      { isin: B, weight: 0.4 },
    ];
    expect(() => parseCliPortfolio(input)).toThrow(PortfolioValidationError);
  });
});
