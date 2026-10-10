/**
 * Strict handling of user-typed amounts (non-negative only).
 *
 * Money and weights are stored as canonical decimal strings ("1234.56") so nothing is
 * lost to binary floating point on the way to and from storage; numbers are produced
 * only at the calculation boundary.
 *
 * Accepted input:
 * - "1234.56" and "1234,56": a lone separator is the decimal mark (so "1,234" is 1.234).
 * - "1 234,56", "1,234.56", "1.234,56": space / the other separator group thousands.
 * Anything else (repeated lone separators, odd grouping, signs, letters) is rejected.
 */

/** Returns the canonical form ("1234.56", no grouping, no leading zeros) or null. */
export function normalizeDecimal(input: string): string | null {
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

  const integer = intPart.replaceAll(groupMark ?? "\0", "").replace(/^0+(?=\d)/, "");
  return decimalMark ? `${integer}.${fracPart}` : integer;
}

export function parseDecimal(input: string): number | null {
  const canonical = normalizeDecimal(input);
  if (canonical === null) return null;
  const n = Number(canonical);
  return Number.isFinite(n) ? n : null;
}

/** True for an already-canonical decimal string, as produced by `normalizeDecimal`. */
export const isCanonicalDecimal = (s: string): boolean => /^(0|[1-9]\d*)(\.\d+)?$/.test(s);

/**
 * Moves the decimal point of a canonical decimal string by `places` (positive = right),
 * exactly, using string arithmetic only. Trailing fractional zeros are trimmed.
 */
export function shiftDecimal(canonical: string, places: number): string {
  const [int = "0", frac = ""] = canonical.split(".");
  let digits = int + frac;
  let point = int.length + places;
  if (point <= 0) {
    digits = "0".repeat(1 - point) + digits;
    point = 1;
  } else if (point > digits.length) {
    digits += "0".repeat(point - digits.length);
  }
  const integer = digits.slice(0, point).replace(/^0+(?=\d)/, "");
  const fraction = digits.slice(point).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

/** "30,5" (percent) -> "0.305" (fraction), or null when not a valid percentage in [0, 100]. */
export function percentToFraction(input: string): string | null {
  const canonical = normalizeDecimal(input);
  if (canonical === null) return null;
  const fraction = shiftDecimal(canonical, -2);
  return Number(fraction) <= 1 ? fraction : null;
}

/** "0.305" (fraction) -> "30.5" (percent). */
export const fractionToPercent = (fraction: string): string => shiftDecimal(fraction, 2);

/**
 * Exact `a * b` rounded half-up to 0.01, for two canonical non-negative decimal strings
 * (e.g. foreign amount x exchange rate). BigInt arithmetic: no binary-float noise, so
 * 100 x 4.256 is "425.60", not 425.59999999999997.
 */
export function multiplyToGrosz(a: string, b: string): string {
  const scaled = (s: string) => {
    const [int = "0", frac = ""] = s.split(".");
    return { n: BigInt(int + frac), scale: frac.length };
  };
  const x = scaled(a);
  const y = scaled(b);
  const product = x.n * y.n;
  const scale = x.scale + y.scale;

  // Bring the product to exactly two decimals, rounding half up.
  let grosze: bigint;
  if (scale <= 2) grosze = product * 10n ** BigInt(2 - scale);
  else {
    const divisor = 10n ** BigInt(scale - 2);
    grosze = (product + divisor / 2n) / divisor;
  }
  const digits = grosze.toString().padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/** Exact whole grosze of a canonical decimal PLN string, rounded half up ("12.345" -> 1235). */
export const decimalToGrosze = (canonical: string): number =>
  Number(multiplyToGrosz(canonical, "1").replace(".", ""));

/**
 * A fraction as whole parts per million ("0.0039" -> 3900), or null when it has finer
 * resolution than that (so the rate used in the plan is exactly the one that was typed).
 */
export function fractionToPpm(fraction: string): number | null {
  const [, frac = ""] = fraction.split(".");
  if (frac.length > 6) return null;
  return Number(shiftDecimal(fraction, 6));
}
