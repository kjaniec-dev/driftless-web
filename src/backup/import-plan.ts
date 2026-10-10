import type { StoredPortfolio } from "@/storage/model";
import { uniqueName } from "@/storage/repository";

export type ImportStrategy = "merge" | "copy" | "replace";

export type ImportOutcome =
  /** Not present locally: added as-is. */
  | "add"
  /** Present locally and overwritten by the file's version. */
  | "replace"
  /** Present locally and kept because the local copy is newer or equal (merge only). */
  | "keep_local"
  /** Added as a brand-new portfolio under a new id and name (copy only). */
  | "add_copy";

export interface ImportItem {
  readonly incoming: StoredPortfolio;
  readonly local: StoredPortfolio | null;
  readonly outcome: ImportOutcome;
  /** What ends up in storage for this item; null when nothing is written. */
  readonly result: StoredPortfolio | null;
}

export interface ImportPlan {
  readonly strategy: ImportStrategy;
  readonly items: readonly ImportItem[];
  /** True when the plan overwrites existing local data (needs explicit confirmation). */
  readonly overwrites: boolean;
}

export interface PlanOptions {
  /** Suffix for copied names, e.g. "import" -> "IKE (import)". */
  readonly copySuffix: string;
  readonly newId?: () => string;
}

/**
 * Decides what an import would do, without touching storage, so the UI can preview it.
 *
 * - `copy`: nothing local is ever changed; every portfolio becomes a new one.
 * - `replace`: a portfolio with a matching id overwrites the local one.
 * - `merge`: a matching id keeps whichever side was updated last (ties keep local).
 * In every strategy portfolios with unknown ids are simply added.
 */
export function planImport(
  existing: readonly StoredPortfolio[],
  incoming: readonly StoredPortfolio[],
  strategy: ImportStrategy,
  { copySuffix, newId = () => crypto.randomUUID() }: PlanOptions,
): ImportPlan {
  const byId = new Map(existing.map((p) => [p.id, p]));
  const takenNames = new Set(existing.map((p) => p.name));

  const items = incoming.map((p): ImportItem => {
    const local = byId.get(p.id) ?? null;

    if (strategy === "copy") {
      const name = uniqueName(p.name, takenNames, copySuffix);
      takenNames.add(name);
      return { incoming: p, local, outcome: "add_copy", result: { ...p, id: newId(), name } };
    }
    if (local === null) return { incoming: p, local, outcome: "add", result: p };
    if (strategy === "replace") return { incoming: p, local, outcome: "replace", result: p };

    const incomingIsNewer = Date.parse(p.updatedAt) > Date.parse(local.updatedAt);
    return incomingIsNewer
      ? { incoming: p, local, outcome: "replace", result: p }
      : { incoming: p, local, outcome: "keep_local", result: null };
  });

  return { strategy, items, overwrites: items.some((i) => i.outcome === "replace") };
}

/** The writes for `applyChanges`. Replacements are plain puts (same id overwrites). */
export function planToChanges(plan: ImportPlan): { put: StoredPortfolio[] } {
  return { put: plan.items.flatMap((i) => (i.result ? [i.result] : [])) };
}
