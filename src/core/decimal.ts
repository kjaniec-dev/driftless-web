/**
 * Strict parsing of user-typed amounts (non-negative only).
 *
 * - "1234.56" and "1234,56": a lone separator is the decimal mark (so "1,234" is 1.234).
 * - "1 234,56", "1,234.56", "1.234,56": space / the other separator group thousands.
 * - Anything else (repeated lone separators, odd grouping, signs, letters) is rejected.
 */
export function parseDecimal(input: string): number | null {
  // Strip spaces/nbsp only where they separate a group of exactly three digits.
  const s = input.trim().replace(/(?<=\d)[  ](?=\d{3}(?!\d))/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;

  const dots = s.split(".").length - 1;
  const commas = s.split(",").length - 1;

  let decimalMark: "." | "," | null = null;
  let groupMark: "." | "," | null = null;
  if (dots > 0 && commas > 0) {
    decimalMark = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    groupMark = decimalMark === "." ? "," : ".";
  } else if (dots + commas === 1) {
    decimalMark = dots === 1 ? "." : ",";
  } else if (dots + commas > 1) {
    return null;
  }

  const parts = decimalMark ? s.split(decimalMark) : [s];
  if (parts.length > 2) return null;
  const [intPart = "", fracPart = ""] = parts;
  if (decimalMark && fracPart === "") return null;
  if (groupMark) {
    if (fracPart.includes(groupMark)) return null;
    if (!new RegExp(`^\\d{1,3}(\\${groupMark}\\d{3})+$`).test(intPart)) return null;
  }

  const n = Number(
    `${intPart.replaceAll(groupMark ?? "\0", "")}${decimalMark ? `.${fracPart}` : ""}`,
  );
  return Number.isFinite(n) ? n : null;
}
