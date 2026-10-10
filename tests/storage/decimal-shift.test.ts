import { describe, expect, it } from "vitest";
import {
  fractionToPercent,
  isCanonicalDecimal,
  normalizeDecimal,
  percentToFraction,
  shiftDecimal,
} from "@/core/decimal";

describe("normalizeDecimal", () => {
  it.each([
    ["1 234,50", "1234.50"],
    ["007.5", "7.5"],
    ["0", "0"],
    ["0,25", "0.25"],
    ["1.234,56", "1234.56"],
  ])("%j -> %j", (input, out) => expect(normalizeDecimal(input)).toBe(out));

  it("only ever yields canonical strings", () => {
    for (const s of ["1", "12.5", "0.001", "1 000", "1,000.00"]) {
      expect(isCanonicalDecimal(normalizeDecimal(s) as string)).toBe(true);
    }
  });
});

describe("shiftDecimal / percent <-> fraction (exact, no float noise)", () => {
  it.each([
    ["30", "0.3"],
    ["30,5", "0.305"],
    ["0", "0"],
    ["100", "1"],
    ["0,01", "0.0001"],
    ["33.33", "0.3333"],
    ["7", "0.07"],
  ])("percent %j -> fraction %j", (pct, fraction) => {
    expect(percentToFraction(pct)).toBe(fraction);
  });

  it("rejects percentages above 100 and garbage", () => {
    expect(percentToFraction("100,01")).toBeNull();
    expect(percentToFraction("abc")).toBeNull();
    expect(percentToFraction("-1")).toBeNull();
  });

  it("round-trips", () => {
    for (const f of ["0.3", "0.305", "1", "0", "0.0001", "0.3333"]) {
      expect(percentToFraction(fractionToPercent(f))).toBe(f);
    }
    expect(shiftDecimal("12.34", 2)).toBe("1234");
    expect(shiftDecimal("12.34", -3)).toBe("0.01234");
  });
});

import { multiplyToGrosz } from "@/core/decimal";

describe("multiplyToGrosz (exact, half-up)", () => {
  it.each([
    ["100", "4.256", "425.60"],
    ["100", "4.25", "425.00"],
    ["1.005", "1", "1.01"], // 1.005 * 100 is 100.49999999999999 in floats
    ["0.1", "0.1", "0.01"],
    ["0", "4.2", "0.00"],
    ["0.001", "4.2", "0.00"],
    ["1", "4.2", "4.20"],
  ])("%j x %j = %j", (a, b, expected) => {
    expect(multiplyToGrosz(a, b)).toBe(expected);
  });

  it("matches an independent integer reference on random decimals", () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 2000; i++) {
      const cents = Math.floor(rand() * 1e8); // amount in grosze-like units, 2 decimals
      const rateMicro = 1 + Math.floor(rand() * 9_000_000); // rate with 4 decimals * 100
      const a = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
      const b = `${Math.floor(rateMicro / 10000)}.${String(rateMicro % 10000).padStart(4, "0")}`;
      // exact integer reference: cents * rateMicro / 10^4 grosze... rounded half up
      const exact = BigInt(cents) * BigInt(rateMicro);
      const grosze = (exact + 5000n) / 10000n;
      const digits = grosze.toString().padStart(3, "0");
      expect(multiplyToGrosz(a, b)).toBe(`${digits.slice(0, -2)}.${digits.slice(-2)}`);
    }
  });
});
