import { describe, expect, it } from "vitest";
import { CSV_HEADER, csvCell, planToCsv } from "@/backup/csv";
import { computePlan } from "@/core";
import { demoPortfolio } from "@/features/demo";

describe("csvCell", () => {
  it("quotes only when needed and escapes quotes", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it.each(['=HYPERLINK("http://evil","x")', "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rx"])(
    "neutralises spreadsheet formulas: %j",
    (v) => {
      const cell = csvCell(v);
      expect(cell.replace(/^"/, "").startsWith("'")).toBe(true);
    },
  );

  it("leaves numeric cells (which may be negative) untouched", () => {
    expect(csvCell("-2.40", false)).toBe("-2.40");
  });
});

describe("planToCsv", () => {
  it("exports the demo plan with BOM, CRLF and fixed precision", () => {
    const csv = planToCsv(computePlan(demoPortfolio));
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(CSV_HEADER.join(","));
    expect(lines.at(-1)).toBe("");
    expect(lines).toHaveLength(1 + 4 + 1);
    expect(lines.find((l) => l.startsWith("IE00BKM4GZ66"))).toBe(
      "IE00BKM4GZ66,IS3N,1200.00,12.00,15.00,200.00,13.33,1.67",
    );
    expect(lines.find((l) => l.startsWith("IE00B5BMR087"))).toContain(",-2.38");
  });

  it("is safe against hostile labels", () => {
    const plan = computePlan({
      ...demoPortfolio,
      positions: demoPortfolio.positions.map((p, i) => (i === 0 ? { ...p, label: "=1+1" } : p)),
    });
    expect(planToCsv(plan)).toContain(",'=1+1,");
  });
});
