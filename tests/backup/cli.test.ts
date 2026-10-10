import { describe, expect, it } from "vitest";
import { CliExportError, cliCurrenciesNeeded, cliToStored, storedToCliJson } from "@/backup/cli";
import { computePlan, parseCliPortfolio } from "@/core";
import { toEnginePortfolio } from "@/storage/convert";
import { validateStoredPortfolio } from "@/storage/validate";
import sampleFile from "../golden/sample_portfolio.json";
import { A, B, portfolio, position } from "../storage/helpers";

const meta = { id: "imp-1", name: "sample", now: "2026-10-10T00:00:00.000Z" };

describe("CLI format", () => {
  it("imports the CLI sample file into a valid stored portfolio", () => {
    const stored = cliToStored(sampleFile, {}, meta);
    expect(validateStoredPortfolio(stored)).toEqual([]);
    expect(stored).toMatchObject({ cashPln: "5000", asOf: "2026-06-03", name: "sample" });
    expect(stored.positions.map((p) => [p.isin, p.targetWeight, p.label])).toEqual([
      ["IE00BK5BQT80", "0.6", "VWCE"],
      ["IE00B4L5Y983", "0.4", "IWDA"],
    ]);
  });

  it("round-trips the sample byte-for-byte through the CLI schema", () => {
    expect(storedToCliJson(cliToStored(sampleFile, {}, meta))).toEqual(sampleFile);
  });

  it("gives the same plan before export and after the CLI re-reads the file", () => {
    const p = portfolio({
      cashPln: "1234.56",
      positions: [position(A, "0.65", "10000.1", { label: "VWCE" }), position(B, "0.35", "3000")],
    });
    const viaCli = parseCliPortfolio(JSON.parse(JSON.stringify(storedToCliJson(p))));
    expect(computePlan(viaCli)).toEqual(computePlan(toEnginePortfolio(p)));
  });

  it("exports foreign valuations as exact PLN amounts", () => {
    const p = portfolio({
      positions: [
        {
          isin: A,
          targetWeight: "1",
          valuation: {
            mode: "fx",
            value: "100",
            currency: "EUR",
            rate: { mid: "4.256", effectiveDate: null, source: "manual" },
          },
        },
      ],
    });
    expect(storedToCliJson(p).positions[0]?.value_pln).toBe(425.6);
  });

  it("converts foreign currency positions using injected rates", () => {
    const file = {
      base_currency: "PLN",
      cash_pln: 0,
      positions: [{ isin: A, value: 100, currency: "EUR" }],
      target: [{ isin: A, weight: 1 }],
    };
    expect(cliCurrenciesNeeded(file)).toEqual(["EUR"]);
    expect(cliToStored(file, { EUR: 4.25 }, meta).positions[0]?.valuation).toEqual({
      mode: "manual",
      valuePln: "425",
    });
    expect(cliCurrenciesNeeded(sampleFile)).toEqual([]);
  });

  it("refuses to export a portfolio without targets", () => {
    expect(() => storedToCliJson(portfolio({ positions: [] }))).toThrow(CliExportError);
    expect(() => storedToCliJson(portfolio({ positions: [position(A, "0", "5")] }))).toThrow(
      CliExportError,
    );
  });
});
