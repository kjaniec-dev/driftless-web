import { describe, expect, it } from "vitest";
import { parseDecimal } from "@/core";

describe("parseDecimal", () => {
  it.each([
    ["0", 0],
    ["1234", 1234],
    ["1234.56", 1234.56],
    ["1234,56", 1234.56],
    ["1,234", 1.234],
    ["  42.5 ", 42.5],
    ["1 234,56", 1234.56],
    ["1 234,56", 1234.56],
    ["1 234 567", 1234567],
    ["1,234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["1,234,567.89", 1234567.89],
    ["0,5", 0.5],
  ])("parses %j", (input, expected) => expect(parseDecimal(input)).toBe(expected));

  it.each([
    "",
    "   ",
    "abc",
    "-5",
    "+5",
    "1e3",
    "1.",
    ",5",
    "1.2.3",
    "1,2,3",
    "12 34",
    "1.234,56,7",
    "1,23.456,7",
    "1 2345",
    "NaN",
  ])("rejects %j", (input) => expect(parseDecimal(input)).toBeNull());
});
