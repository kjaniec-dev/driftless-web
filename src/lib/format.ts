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

/** ISO timestamp or `YYYY-MM-DD` -> a short local date. */
export function formatDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat(locale(lang), { dateStyle: "medium" }).format(d);
}

/** Bytes -> "12.3 kB". */
export function formatBytes(bytes: number, lang: Lang): string {
  const units = ["B", "kB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const digits = i === 0 ? 0 : 1;
  return `${new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits }).format(value)} ${units[i]}`;
}
