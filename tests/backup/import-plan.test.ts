import { describe, expect, it } from "vitest";
import { planImport, planToChanges } from "@/backup/import-plan";
import { portfolio } from "../storage/helpers";

const opts = {
  copySuffix: "import",
  newId: (() => {
    let n = 0;
    return () => `new-${++n}`;
  })(),
};

const local = portfolio({
  id: "p1",
  name: "IKE",
  updatedAt: "2026-10-05T00:00:00.000Z",
  cashPln: "1",
});
const olderIncoming = { ...local, cashPln: "2", updatedAt: "2026-10-01T00:00:00.000Z" };
const newerIncoming = { ...local, cashPln: "3", updatedAt: "2026-10-09T00:00:00.000Z" };
const stranger = portfolio({ id: "p2", name: "IKZE" });

describe("planImport", () => {
  it("copy: never touches local data, issues new ids and unique names", () => {
    const plan = planImport([local], [newerIncoming, stranger], "copy", opts);
    expect(plan.overwrites).toBe(false);
    expect(plan.items.map((i) => i.outcome)).toEqual(["add_copy", "add_copy"]);
    const written = planToChanges(plan).put;
    expect(written.map((p) => p.name)).toEqual(["IKE (import)", "IKZE (import)"]);
    expect(written.every((p) => p.id !== "p1" && p.id !== "p2")).toBe(true);
    expect(new Set(written.map((p) => p.id)).size).toBe(2);
  });

  it("copy: two imports of the same file do not collide", () => {
    const first = planImport([local], [stranger], "copy", opts);
    const second = planImport([local, ...planToChanges(first).put], [stranger], "copy", opts);
    expect(planToChanges(second).put[0]?.name).toBe("IKZE (import 2)");
  });

  it("replace: overwrites matches, adds the rest, and flags the overwrite", () => {
    const plan = planImport([local], [olderIncoming, stranger], "replace", opts);
    expect(plan.overwrites).toBe(true);
    expect(plan.items.map((i) => i.outcome)).toEqual(["replace", "add"]);
    expect(planToChanges(plan).put[0]?.cashPln).toBe("2");
  });

  it("merge: the newer side wins; ties keep local; nothing is written for kept items", () => {
    const keepsLocal = planImport([local], [olderIncoming], "merge", opts);
    expect(keepsLocal.items[0]?.outcome).toBe("keep_local");
    expect(keepsLocal.overwrites).toBe(false);
    expect(planToChanges(keepsLocal).put).toEqual([]);

    const tie = planImport([local], [{ ...local, cashPln: "9" }], "merge", opts);
    expect(tie.items[0]?.outcome).toBe("keep_local");

    const takesIncoming = planImport([local], [newerIncoming], "merge", opts);
    expect(takesIncoming.items[0]?.outcome).toBe("replace");
    expect(takesIncoming.overwrites).toBe(true);
    expect(planToChanges(takesIncoming).put[0]?.cashPln).toBe("3");
  });

  it("all strategies simply add unknown portfolios", () => {
    for (const s of ["merge", "replace"] as const) {
      const plan = planImport([local], [stranger], s, opts);
      expect(plan.items[0]?.outcome).toBe("add");
      expect(plan.overwrites).toBe(false);
    }
  });

  it("does not mutate its inputs", () => {
    const snapshot = JSON.stringify([local, stranger]);
    planImport([local], [stranger, newerIncoming], "replace", opts);
    expect(JSON.stringify([local, stranger])).toBe(snapshot);
  });
});
