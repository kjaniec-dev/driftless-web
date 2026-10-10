import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/storage/db";
import {
  applyChanges,
  createPortfolio,
  deleteAllData,
  deletePortfolio,
  duplicatePortfolio,
  getPortfolio,
  listPortfolios,
  renamePortfolio,
  StorageValidationError,
  savePortfolio,
  uniqueName,
} from "@/storage/repository";
import { A, B, portfolio, position } from "./helpers";

beforeEach(async () => {
  await db.open();
  await deleteAllData();
});

describe("repository", () => {
  it("creates, lists, renames and deletes portfolios", async () => {
    const a = await createPortfolio("  IKE ");
    const b = await createPortfolio("IKZE");
    expect(a.name).toBe("IKE");
    expect((await listPortfolios()).map((p) => p.name)).toEqual(["IKE", "IKZE"]);

    await renamePortfolio(b.id, "Zwykły");
    expect((await getPortfolio(b.id))?.name).toBe("Zwykły");

    await deletePortfolio(a.id);
    expect((await listPortfolios()).map((p) => p.id)).toEqual([b.id]);
  });

  it("rejects an empty name", async () => {
    await expect(createPortfolio("   ")).rejects.toBeInstanceOf(StorageValidationError);
    expect(await listPortfolios()).toEqual([]);
  });

  it("saves valid portfolios and stamps updatedAt", async () => {
    const created = await createPortfolio("P");
    const saved = await savePortfolio({ ...portfolio(), id: created.id, name: "P" });
    expect(saved.updatedAt).not.toBe(portfolio().updatedAt);
    expect((await getPortfolio(created.id))?.positions).toHaveLength(2);
  });

  it("never stores weights that do not total 100% or duplicate ISINs", async () => {
    const created = await createPortfolio("P");
    const good = await savePortfolio({ ...portfolio(), id: created.id, name: "P" });

    await expect(
      savePortfolio({ ...good, positions: [position(A, "0.5", "1"), position(B, "0.4", "1")] }),
    ).rejects.toBeInstanceOf(StorageValidationError);
    await expect(
      savePortfolio({ ...good, positions: [position(A, "0.5", "1"), position(A, "0.5", "1")] }),
    ).rejects.toBeInstanceOf(StorageValidationError);

    expect(await getPortfolio(created.id)).toEqual(good);
  });

  it("duplicates with a fresh id and a unique name", async () => {
    const created = await createPortfolio("IKE");
    const one = await duplicatePortfolio(created.id, "copy");
    const two = await duplicatePortfolio(created.id, "copy");
    expect(one.id).not.toBe(created.id);
    expect([one.name, two.name]).toEqual(["IKE (copy)", "IKE (copy 2)"]);
  });

  it("applies changes atomically: one invalid portfolio rolls back everything", async () => {
    const keep = await createPortfolio("keep");
    const ok = portfolio({ id: "22222222-2222-4222-8222-222222222222", name: "new" });
    const bad = portfolio({ id: "33333333-3333-4333-8333-333333333333", cashPln: "-5" });

    await expect(applyChanges({ put: [ok, bad], remove: [keep.id] })).rejects.toBeInstanceOf(
      StorageValidationError,
    );
    expect((await listPortfolios()).map((p) => p.id)).toEqual([keep.id]);
  });

  it("removes and writes in one transaction", async () => {
    const old = await createPortfolio("old");
    const fresh = portfolio({ id: "44444444-4444-4444-8444-444444444444", name: "fresh" });
    await applyChanges({ put: [fresh], remove: [old.id] });
    expect((await listPortfolios()).map((p) => p.name)).toEqual(["fresh"]);
  });

  it("deletes all data", async () => {
    await createPortfolio("a");
    await createPortfolio("b");
    await deleteAllData();
    expect(await listPortfolios()).toEqual([]);
  });
});

describe("uniqueName", () => {
  it("avoids taken names", () => {
    expect(uniqueName("X", ["X (kopia)"], "kopia")).toBe("X (kopia 2)");
    expect(uniqueName("X", [], "kopia")).toBe("X (kopia)");
  });
});
