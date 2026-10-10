import { describe, expect, it } from "vitest";
import { formatPercent, formatPln, formatPp } from "@/lib/format";
import { parseRoute } from "@/lib/router";

// Intl uses non-breaking / narrow spaces; normalise so assertions stay readable.
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("formatting", () => {
  it("formats PLN in both locales with consistent grouping", () => {
    expect(plain(formatPln(3400, "pl"))).toBe("3 400,00 zł");
    expect(plain(formatPln(10500.5, "pl"))).toBe("10 500,50 zł");
    expect(plain(formatPln(3400, "en"))).toBe("PLN 3,400.00");
  });

  it("formats percentages and signed percentage points", () => {
    expect(plain(formatPercent(0.256, "pl"))).toBe("25,6%");
    expect(formatPercent(0.256, "en")).toBe("25.6%");
    expect(plain(formatPp(3, "en"))).toBe("+3.0 pp");
    expect(plain(formatPp(-4, "pl"))).toMatch(/^[-−]4,0 pp$/);
    expect(plain(formatPp(0, "en"))).toBe("0.0 pp");
  });
});

describe("parseRoute", () => {
  it.each([
    ["", "/"],
    ["#/", "/"],
    ["#/rebalance", "/rebalance"],
    ["#/data", "/data"],
    ["#/nope", "/"],
    ["#//rebalance", "/"],
  ])("%j -> %s", (hash, route) => expect(parseRoute(hash)).toBe(route));
});
