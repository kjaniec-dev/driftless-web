import type { Lang } from "@/i18n";

const locale = (lang: Lang) => (lang === "pl" ? "pl-PL" : "en-GB");

export function formatPln(amount: number, lang: Lang): string {
  return new Intl.NumberFormat(locale(lang), {
    style: "currency",
    currency: "PLN",
    // CLDR omits grouping for 4-digit numbers in pl-PL; keep columns visually consistent.
    useGrouping: "always",
  }).format(amount);
}

/** `fraction` 0.256 -> "25.6%". */
export function formatPercent(fraction: number, lang: Lang, digits = 1): string {
  return new Intl.NumberFormat(locale(lang), {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(fraction);
}

/** Percentage-point difference with explicit sign, e.g. "+3.0 pp". */
export function formatPp(pp: number, lang: Lang): string {
  const body = new Intl.NumberFormat(locale(lang), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(pp);
  return `${body} pp`;
}
