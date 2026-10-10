import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { pl } from "@/i18n/pl";

/** Flattens a dictionary into `path -> string` (arrays become indexed paths). */
function flatten(value: unknown, path = ""): Record<string, string> {
  if (typeof value === "string") return { [path]: value };
  return Object.entries(value as object).reduce(
    (acc, [k, v]) => Object.assign(acc, flatten(v, path ? `${path}.${k}` : k)),
    {} as Record<string, string>,
  );
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  const flatEn = flatten(en);
  const flatPl = flatten(pl);

  it("PL and EN define exactly the same keys", () => {
    expect(Object.keys(flatPl).sort()).toEqual(Object.keys(flatEn).sort());
  });

  it("PL and EN use the same {placeholders} in every string", () => {
    for (const [key, text] of Object.entries(flatEn)) {
      expect(placeholders(flatPl[key] ?? ""), key).toEqual(placeholders(text));
    }
  });

  it("has no empty strings", () => {
    for (const [key, text] of [...Object.entries(flatEn), ...Object.entries(flatPl)]) {
      expect(text.trim(), key).not.toBe("");
    }
  });
});
