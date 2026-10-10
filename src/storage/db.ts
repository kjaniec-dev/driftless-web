import Dexie, { type EntityTable } from "dexie";
import type { StoredPortfolio } from "./model";

export class DriftlessDb extends Dexie {
  portfolios!: EntityTable<StoredPortfolio, "id">;

  constructor(name = "driftless") {
    super(name);
    // Schema versions are append-only: add `this.version(2).stores(...).upgrade(...)` to migrate.
    this.version(1).stores({ portfolios: "id, name, updatedAt" });
  }
}

export const db = new DriftlessDb();
