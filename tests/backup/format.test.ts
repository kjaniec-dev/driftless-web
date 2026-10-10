import { describe, expect, it } from "vitest";
import {
  BackupError,
  createBackup,
  MAX_FILE_BYTES,
  parseBackup,
  SCHEMA_VERSION,
  serializeBackup,
} from "@/backup/format";
import { db } from "@/storage/db";
import { applyChanges, deleteAllData, listPortfolios } from "@/storage/repository";
import { A, B, portfolio, position } from "../storage/helpers";

// biome-ignore lint/suspicious/noExplicitAny: test helper that mutates arbitrary JSON documents
type Json = any;

const fx = portfolio({
  id: "fx-1",
  name: "Zagraniczne",
  asOf: "2026-10-01",
  positions: [
    {
      isin: A,
      label: "VWCE",
      ticker: "VWCE.DE",
      targetWeight: "0.7",
      valuation: {
        mode: "fx",
        value: "1000.5",
        currency: "EUR",
        rate: { mid: "4.2560", effectiveDate: "2026-10-09", source: "nbp" },
      },
    },
    position(B, "0.3", "250.75"),
  ],
});
const sample = [portfolio(), fx];
const json = (b: unknown) => JSON.stringify(b);
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof BackupError ? e.code : `other:${(e as Error).message}`;
  }
  return "none";
};

describe("backup format", () => {
  it("exports and re-imports every saved field", () => {
    const text = serializeBackup(createBackup(sample, new Date("2026-10-10T12:00:00Z")));
    const parsed = parseBackup(text);
    expect(parsed.format).toBe("driftless-web");
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.exportedAt).toBe("2026-10-10T12:00:00.000Z");
    expect(parsed.portfolios).toEqual(sample);
  });

  it("export -> wipe storage -> import restores everything", async () => {
    await db.open();
    await deleteAllData();
    await applyChanges({ put: sample });
    const before = await listPortfolios();

    const text = serializeBackup(createBackup(before, new Date()));
    await deleteAllData();
    expect(await listPortfolios()).toEqual([]);

    await applyChanges({ put: parseBackup(text).portfolios });
    expect(await listPortfolios()).toEqual(before);
  });

  it("accepts an empty backup", () => {
    expect(parseBackup(serializeBackup(createBackup([], new Date()))).portfolios).toEqual([]);
  });
});

describe("malformed files are rejected", () => {
  const good = () => createBackup(sample, new Date());
  const mutate = (fn: (b: Json) => void) => {
    const b = JSON.parse(json(good()));
    fn(b);
    return json(b);
  };

  it.each([
    ["not json", "{nope", "invalid_json"],
    ["empty", "", "invalid_json"],
    ["array", "[]", "not_driftless"],
    ["null", "null", "not_driftless"],
    ["other format", json({ format: "other" }), "not_driftless"],
    [
      "CLI file",
      json({ base_currency: "PLN", cash_pln: 1, positions: [], target: [] }),
      "not_driftless",
    ],
  ])("%s", (_n, text, expected) => expect(code(() => parseBackup(text))).toBe(expected));

  it("rejects newer schema versions and bad versions", () => {
    expect(code(() => parseBackup(mutate((b) => (b.schemaVersion = 2))))).toBe(
      "unsupported_version",
    );
    expect(code(() => parseBackup(mutate((b) => (b.schemaVersion = 0))))).toBe("invalid_structure");
    expect(code(() => parseBackup(mutate((b) => (b.schemaVersion = "1"))))).toBe(
      "invalid_structure",
    );
  });

  it.each([
    ["unknown top-level key", (b: Json) => (b.extra = 1)],
    ["unknown portfolio key", (b: Json) => (b.portfolios[0].extra = 1)],
    ["unknown position key", (b: Json) => (b.portfolios[0].positions[0].extra = 1)],
    [
      "prototype key",
      (b: Json) => Object.defineProperty(b, "__proto__", { value: {}, enumerable: true }),
    ],
    ["portfolios not an array", (b: Json) => (b.portfolios = {})],
    ["numeric money", (b: Json) => (b.portfolios[0].cashPln = 500)],
    ["non-canonical money", (b: Json) => (b.portfolios[0].cashPln = "5,00")],
    ["negative money", (b: Json) => (b.portfolios[0].cashPln = "-5")],
    ["bad currency", (b: Json) => (b.portfolios[1].positions[0].valuation.currency = "JPY")],
    [
      "bad rate source",
      (b: Json) => (b.portfolios[1].positions[0].valuation.rate.source = "yahoo"),
    ],
    ["bad valuation mode", (b: Json) => (b.portfolios[0].positions[0].valuation.mode = "quoted")],
    ["wrong base currency", (b: Json) => (b.portfolios[0].baseCurrency = "EUR")],
    ["bad id", (b: Json) => (b.portfolios[0].id = "../../x")],
    ["bad timestamp", (b: Json) => (b.portfolios[0].updatedAt = "yesterday")],
    ["very long name", (b: Json) => (b.portfolios[0].name = "x".repeat(5000))],
    [
      "too many instruments",
      (b: Json) => (b.portfolios[0].positions = Array(501).fill(b.portfolios[0].positions[0])),
    ],
    ["duplicate portfolio ids", (b: Json) => (b.portfolios[1].id = b.portfolios[0].id)],
  ])("%s", (_n, fn) => {
    const result = code(() => parseBackup(mutate(fn)));
    expect(["invalid_structure", "invalid_portfolio"]).toContain(result);
  });

  it("applies the same rules as the editor (weights, duplicates, ISINs)", () => {
    expect(
      code(() => parseBackup(mutate((b) => (b.portfolios[0].positions[0].targetWeight = "0.1")))),
    ).toBe("invalid_portfolio");
    expect(code(() => parseBackup(mutate((b) => (b.portfolios[0].positions[1].isin = A))))).toBe(
      "invalid_portfolio",
    );
    expect(
      code(() => parseBackup(mutate((b) => (b.portfolios[0].positions[0].isin = "nope")))),
    ).toBe("invalid_portfolio");
  });

  it("reports where the problem is", () => {
    try {
      parseBackup(mutate((b) => (b.portfolios[1].positions[0].valuation.value = "x")));
    } catch (e) {
      expect((e as BackupError).path).toBe("/portfolios/1/positions/0/valuation/value");
      return;
    }
    throw new Error("expected BackupError");
  });

  it("refuses oversized files", () => {
    expect(code(() => parseBackup(`"${"x".repeat(MAX_FILE_BYTES)}"`))).toBe("too_large");
  });

  it("never corrupts existing portfolios when an import fails", async () => {
    await db.open();
    await deleteAllData();
    await applyChanges({ put: [portfolio()] });
    const before = await listPortfolios();

    for (const text of ["{nope", mutate((b) => (b.portfolios[1].cashPln = "-1"))]) {
      try {
        await applyChanges({ put: parseBackup(text).portfolios });
      } catch {
        // rejected, as expected
      }
    }
    expect(await listPortfolios()).toEqual(before);
  });

  it("survives random corruption without ever throwing anything but BackupError", () => {
    const text = serializeBackup(good());
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed % n;
    };
    for (let i = 0; i < 1500; i++) {
      const chars = [...text];
      for (let k = 0; k < 1 + rand(4); k++) {
        const at = rand(chars.length);
        chars[at] = ['"', "{", "}", ",", ":", "9", "-", "x", " "][rand(9)] as string;
      }
      try {
        parseBackup(chars.join(""));
      } catch (e) {
        expect(e).toBeInstanceOf(BackupError);
      }
    }
  });
});
