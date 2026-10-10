import { describe, expect, it } from "vitest";
import { pySum, roundHalfEven } from "../../src/core/float";

describe("pySum (CPython >= 3.12 compensated float sum)", () => {
  it("matches Python where naive summation drifts", () => {
    // Python 3.12+: sum([0.1] * 10) == 1.0, whereas a plain loop yields 0.9999999999999999.
    expect(pySum(Array(10).fill(0.1))).toBe(1);
    expect(
      Array(10)
        .fill(0.1)
        .reduce((s, x) => s + x, 0),
    ).not.toBe(1);
  });

  it("handles empty input and mixed magnitudes", () => {
    expect(pySum([])).toBe(0);
    expect(pySum([1e100, 1, -1e100])).toBe(1);
  });
});

describe("roundHalfEven (Python round())", () => {
  it.each([
    [0.5, 0],
    [1.5, 2],
    [2.5, 2],
    [3.5, 4],
    [-0.5, 0],
    [-1.5, -2],
    [-2.5, -2],
    [2.4999, 2],
    [2.5001, 3],
    [100.5, 100],
    [101.5, 102],
  ])("round(%j) == %j", (x, expected) => expect(roundHalfEven(x)).toBe(expected));
});
