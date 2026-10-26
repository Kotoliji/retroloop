import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { routing } from "./routing";

const dir = join(__dirname, "../../messages");
const load = (file: string) => JSON.parse(readFileSync(join(dir, file), "utf8"));

/** Every key path in a messages object, e.g. "Stage.labels.write". */
function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("messages", () => {
  const reference = keys(load("en.json")).sort();

  it("exist for every locale and nothing else", () => {
    expect(readdirSync(dir).sort()).toEqual(routing.locales.map((l) => `${l}.json`).sort());
  });

  for (const locale of routing.locales) {
    it(`${locale} has exactly the keys of en`, () => {
      expect(keys(load(`${locale}.json`)).sort()).toEqual(reference);
    });

    it(`${locale} has no empty strings`, () => {
      const empty = keys(load(`${locale}.json`)).filter((path) => {
        const value = path.split(".").reduce((o, k) => o[k], load(`${locale}.json`));
        return typeof value !== "string" || value.trim() === "";
      });
      expect(empty).toEqual([]);
    });
  }
});
