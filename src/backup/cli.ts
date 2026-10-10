/** Conversion between stored portfolios and the Driftless CLI `portfolio.json`. */
import {
  type CliPortfolioJson,
  type FxRates,
  type Portfolio,
  parseCliPortfolio,
  toCliPortfolio,
} from "@/core";
import { toEnginePortfolio } from "@/storage/convert";
import { LIMITS, type StoredPortfolio } from "@/storage/model";

export class CliExportError extends Error {
  constructor() {
    super("The portfolio has no target weights, so it cannot be written in the CLI format");
    this.name = "CliExportError";
  }
}

/** Serialises exactly to the CLI schema (no extra properties); needs at least one target. */
export function storedToCliJson(p: StoredPortfolio): CliPortfolioJson {
  const engine = toEnginePortfolio(p);
  if (engine.targets.length === 0) throw new CliExportError();
  return toCliPortfolio(engine);
}

/** The foreign currencies a CLI file needs rates for (value+currency positions). */
export function cliCurrenciesNeeded(data: unknown): string[] {
  const positions = (data as { positions?: unknown } | null)?.positions;
  if (!Array.isArray(positions)) return [];
  const needed = new Set<string>();
  for (const p of positions) {
    if (typeof p !== "object" || p === null) continue;
    const o = p as { value_pln?: unknown; currency?: unknown };
    if (!("value_pln" in o) && typeof o.currency === "string" && o.currency !== "PLN") {
      needed.add(o.currency);
    }
  }
  return [...needed];
}

const decimalString = (n: number) => String(n);

/**
 * Builds a stored portfolio from a CLI file. All values land as manual PLN valuations
 * (foreign positions are converted with the provided rates at import time).
 */
export function cliToStored(
  data: unknown,
  rates: FxRates,
  meta: { id: string; name: string; now: string },
): StoredPortfolio {
  const engine: Portfolio = parseCliPortfolio(data, rates);
  const weights = new Map(engine.targets.map((t) => [t.isin, t.weight]));
  const held = new Map(engine.positions.map((p) => [p.isin, p]));

  const isins = [...new Set([...engine.positions.map((p) => p.isin), ...weights.keys()])];
  const positions = isins.map((isin) => {
    const pos = held.get(isin);
    return {
      isin,
      ...(pos?.label ? { label: pos.label } : {}),
      targetWeight: decimalString(weights.get(isin) ?? 0),
      valuation: { mode: "manual" as const, valuePln: decimalString(pos?.valuePln ?? 0) },
    };
  });

  return {
    id: meta.id,
    name: meta.name.trim().slice(0, LIMITS.text) || "Portfolio",
    baseCurrency: "PLN",
    ...(engine.asOf && /^\d{4}-\d{2}-\d{2}$/.test(engine.asOf) ? { asOf: engine.asOf } : {}),
    cashPln: decimalString(engine.cashPln),
    positions,
    createdAt: meta.now,
    updatedAt: meta.now,
  };
}
