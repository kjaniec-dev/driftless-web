/**
 * Native, versioned backup format (`format: "driftless-web"`).
 *
 * Parsing is deliberately strict (unknown keys, wrong types, bad numbers and newer schema
 * versions are all rejected) so a malformed or hostile file can never reach storage.
 */
import { isCanonicalDecimal } from "@/core/decimal";
import {
  FX_CURRENCIES,
  isFxCurrency,
  LIMITS,
  type StoredPortfolio,
  type StoredPosition,
  type Valuation,
} from "@/storage/model";
import { isValidDate, validateStoredPortfolio } from "@/storage/validate";

export const BACKUP_FORMAT = "driftless-web";
export const SCHEMA_VERSION = 1;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  portfolios: StoredPortfolio[];
}

export type BackupErrorCode =
  | "too_large"
  | "invalid_json"
  | "not_driftless"
  | "unsupported_version"
  | "invalid_structure"
  | "invalid_portfolio";

export class BackupError extends Error {
  readonly code: BackupErrorCode;
  /** JSON-pointer-like location of the problem, when there is one. */
  readonly path: string;

  constructor(code: BackupErrorCode, path = "", detail = "") {
    super(`${code}${path ? ` at ${path}` : ""}${detail ? `: ${detail}` : ""}`);
    this.name = "BackupError";
    this.code = code;
    this.path = path;
  }
}

export function createBackup(portfolios: readonly StoredPortfolio[], now: Date): BackupFile {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    portfolios: [...portfolios],
  };
}

export const serializeBackup = (backup: BackupFile): string =>
  `${JSON.stringify(backup, null, 2)}\n`;

type Obj = Record<string, unknown>;

const fail = (path: string, detail: string): never => {
  throw new BackupError("invalid_structure", path, detail);
};

function object(v: unknown, path: string, allowed: readonly string[]): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "expected an object");
  const o = v as Obj;
  for (const key of Object.keys(o)) {
    if (!allowed.includes(key)) fail(`${path}/${key}`, "unknown property");
  }
  return o;
}

function text(o: Obj, key: string, path: string, max: number = LIMITS.text): string {
  const v = o[key];
  if (typeof v !== "string") return fail(`${path}/${key}`, "expected a string");
  if (v.length > max) return fail(`${path}/${key}`, `longer than ${max} characters`);
  return v;
}

function decimal(o: Obj, key: string, path: string): string {
  const v = text(o, key, path, 40);
  if (!isCanonicalDecimal(v)) return fail(`${path}/${key}`, "expected a decimal string");
  return v;
}

function timestamp(o: Obj, key: string, path: string): string {
  const v = text(o, key, path, 40);
  if (Number.isNaN(Date.parse(v))) return fail(`${path}/${key}`, "expected an ISO timestamp");
  return v;
}

function parseValuation(raw: unknown, path: string): Valuation {
  const probe = object(raw, path, ["mode", "valuePln", "value", "currency", "rate"]);
  if (probe.mode === "manual") {
    const o = object(raw, path, ["mode", "valuePln"]);
    return { mode: "manual", valuePln: decimal(o, "valuePln", path) };
  }
  if (probe.mode === "fx") {
    const o = object(raw, path, ["mode", "value", "currency", "rate"]);
    const currency = o.currency;
    if (!isFxCurrency(currency)) {
      return fail(`${path}/currency`, `expected one of ${FX_CURRENCIES.join(", ")}`);
    }
    const rate = object(o.rate, `${path}/rate`, ["mid", "effectiveDate", "source"]);
    const source = rate.source;
    if (source !== "nbp" && source !== "manual") {
      return fail(`${path}/rate/source`, 'expected "nbp" or "manual"');
    }
    const date = rate.effectiveDate;
    if (date !== null && !(typeof date === "string" && isValidDate(date))) {
      return fail(`${path}/rate/effectiveDate`, "expected YYYY-MM-DD or null");
    }
    return {
      mode: "fx",
      value: decimal(o, "value", path),
      currency,
      rate: { mid: decimal(rate, "mid", `${path}/rate`), effectiveDate: date, source },
    };
  }
  return fail(`${path}/mode`, 'expected "manual" or "fx"');
}

function parsePosition(raw: unknown, path: string): StoredPosition {
  const o = object(raw, path, ["isin", "label", "ticker", "targetWeight", "valuation"]);
  return {
    isin: text(o, "isin", path, 12),
    ...("label" in o ? { label: text(o, "label", path) } : {}),
    ...("ticker" in o ? { ticker: text(o, "ticker", path) } : {}),
    targetWeight: decimal(o, "targetWeight", path),
    valuation: parseValuation(o.valuation, `${path}/valuation`),
  };
}

export function parseStoredPortfolio(raw: unknown, path: string): StoredPortfolio {
  const o = object(raw, path, [
    "id",
    "name",
    "baseCurrency",
    "asOf",
    "cashPln",
    "positions",
    "createdAt",
    "updatedAt",
  ]);
  const id = text(o, "id", path, 64);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) fail(`${path}/id`, "expected an identifier");
  if (o.baseCurrency !== "PLN") fail(`${path}/baseCurrency`, 'expected "PLN"');
  if (!Array.isArray(o.positions)) fail(`${path}/positions`, "expected an array");
  const rawPositions = o.positions as unknown[];
  if (rawPositions.length > LIMITS.positions) {
    fail(`${path}/positions`, `more than ${LIMITS.positions} instruments`);
  }

  const portfolio: StoredPortfolio = {
    id,
    name: text(o, "name", path),
    baseCurrency: "PLN",
    ...("asOf" in o ? { asOf: text(o, "asOf", path, 10) } : {}),
    cashPln: decimal(o, "cashPln", path),
    positions: rawPositions.map((p, i) => parsePosition(p, `${path}/positions/${i}`)),
    createdAt: timestamp(o, "createdAt", path),
    updatedAt: timestamp(o, "updatedAt", path),
  };

  const issues = validateStoredPortfolio(portfolio);
  if (issues.length > 0) {
    throw new BackupError("invalid_portfolio", path, issues.map((i) => i.code).join(", "));
  }
  return portfolio;
}

/** Parses already-decoded JSON. Exposed separately so the import UI can sniff the format. */
export function parseBackupData(data: unknown): BackupFile {
  if (typeof data !== "object" || data === null || (data as Obj).format !== BACKUP_FORMAT) {
    throw new BackupError("not_driftless");
  }
  const o = object(data, "", ["format", "schemaVersion", "exportedAt", "portfolios"]);
  const version = o.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return fail("/schemaVersion", "expected a positive integer");
  }
  if (version > SCHEMA_VERSION) throw new BackupError("unsupported_version", "/schemaVersion");
  // Future versions: migrate `o` up to SCHEMA_VERSION here before validating.

  const exportedAt = timestamp(o, "exportedAt", "");
  if (!Array.isArray(o.portfolios)) return fail("/portfolios", "expected an array");
  if (o.portfolios.length > LIMITS.portfolios) {
    return fail("/portfolios", `more than ${LIMITS.portfolios} portfolios`);
  }
  const portfolios = o.portfolios.map((p, i) => parseStoredPortfolio(p, `/portfolios/${i}`));

  const ids = new Set<string>();
  for (const p of portfolios) {
    if (ids.has(p.id)) fail("/portfolios", `duplicate portfolio id ${p.id}`);
    ids.add(p.id);
  }
  return { format: BACKUP_FORMAT, schemaVersion: version, exportedAt, portfolios };
}

export function parseBackup(json: string): BackupFile {
  if (new Blob([json]).size > MAX_FILE_BYTES) throw new BackupError("too_large");
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new BackupError("invalid_json");
  }
  return parseBackupData(data);
}
