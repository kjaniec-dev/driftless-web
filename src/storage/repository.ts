import { db } from "./db";
import { LIMITS, type StoredPortfolio } from "./model";
import { type StoredIssue, validateStoredPortfolio } from "./validate";

export class StorageValidationError extends Error {
  readonly issues: readonly StoredIssue[];
  constructor(issues: readonly StoredIssue[]) {
    super(`Refusing to store invalid portfolio: ${issues.map((i) => i.code).join(", ")}`);
    this.name = "StorageValidationError";
    this.issues = issues;
  }
}

export class StorageLimitError extends Error {
  constructor() {
    super(`At most ${LIMITS.portfolios} portfolios can be stored`);
    this.name = "StorageLimitError";
  }
}

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

function assertValid(p: StoredPortfolio): void {
  const issues = validateStoredPortfolio(p);
  if (issues.length > 0) throw new StorageValidationError(issues);
}

/** "Name (copy)", "Name (copy 2)", ... that is not yet taken. */
export function uniqueName(base: string, taken: Iterable<string>, suffix: string): string {
  const names = new Set(taken);
  let candidate = `${base} (${suffix})`;
  for (let n = 2; names.has(candidate); n++) candidate = `${base} (${suffix} ${n})`;
  return candidate;
}

export async function listPortfolios(): Promise<StoredPortfolio[]> {
  return db.portfolios.orderBy("name").toArray();
}

export const getPortfolio = (id: string) => db.portfolios.get(id);

export async function createPortfolio(name: string): Promise<StoredPortfolio> {
  const now = nowIso();
  const portfolio: StoredPortfolio = {
    id: newId(),
    name: name.trim(),
    baseCurrency: "PLN",
    cashPln: "0",
    positions: [],
    createdAt: now,
    updatedAt: now,
  };
  assertValid(portfolio);
  if ((await db.portfolios.count()) >= LIMITS.portfolios) throw new StorageLimitError();
  await db.portfolios.add(portfolio);
  return portfolio;
}

/** Validates, then replaces the stored portfolio. Invalid data never reaches the database. */
export async function savePortfolio(portfolio: StoredPortfolio): Promise<StoredPortfolio> {
  assertValid(portfolio);
  const saved = { ...portfolio, updatedAt: nowIso() };
  await db.portfolios.put(saved);
  return saved;
}

export async function renamePortfolio(id: string, name: string): Promise<void> {
  await db.transaction("rw", db.portfolios, async () => {
    const current = await db.portfolios.get(id);
    if (!current) throw new Error(`Portfolio ${id} not found`);
    await savePortfolio({ ...current, name: name.trim() });
  });
}

export async function duplicatePortfolio(id: string, suffix: string): Promise<StoredPortfolio> {
  return db.transaction("rw", db.portfolios, async () => {
    const source = await db.portfolios.get(id);
    if (!source) throw new Error(`Portfolio ${id} not found`);
    const names = (await db.portfolios.toArray()).map((p) => p.name);
    const now = nowIso();
    const copy: StoredPortfolio = {
      ...source,
      id: newId(),
      name: uniqueName(source.name, names, suffix),
      createdAt: now,
      updatedAt: now,
    };
    assertValid(copy);
    await db.portfolios.add(copy);
    return copy;
  });
}

export const deletePortfolio = (id: string) => db.portfolios.delete(id);

/** Removes everything this app stored on the device. */
export async function deleteAllData(): Promise<void> {
  await db.portfolios.clear();
}

/**
 * Applies a set of writes atomically: either every portfolio is written/removed or, on any
 * failure (including validation), the database is left exactly as it was.
 */
export async function applyChanges(changes: {
  put: readonly StoredPortfolio[];
  remove?: readonly string[];
}): Promise<void> {
  for (const p of changes.put) assertValid(p);
  await db.transaction("rw", db.portfolios, async () => {
    if (changes.remove?.length) await db.portfolios.bulkDelete([...changes.remove]);
    await db.portfolios.bulkPut([...changes.put]);
    if ((await db.portfolios.count()) > LIMITS.portfolios) throw new StorageLimitError();
  });
}

/** Asks the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageStatus(): Promise<{
  persisted: boolean | null;
  usageBytes: number | null;
}> {
  try {
    const persisted = (await navigator.storage?.persisted?.()) ?? null;
    const usageBytes = (await navigator.storage?.estimate?.())?.usage ?? null;
    return { persisted, usageBytes };
  } catch {
    return { persisted: null, usageBytes: null };
  }
}
