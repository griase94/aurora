/**
 * The scope check: every `@<scope>/aurora-<name>` and every release asset
 * name `<scope>-aurora-<name>-<version>.tgz` in the repo agrees with the
 * package.json names. A scope rename (pnpm scope:set) that missed a file, or
 * a hand-typed name with the wrong scope, fails here.
 */
import { describe, expect, it } from "vitest";
import { REPO, listPackages, parseName, sharedScope } from "./lib/packages.mjs";
import { findReferences, textFiles } from "./lib/scope.mjs";

/**
 * Names the docs may show before their package exists: the kit packages
 * arrive with the kit import. Remove a name once its package is here.
 */
const PLANNED = new Set(["svelte", "tokens"]);

describe("scope check", () => {
  const packages = listPackages(REPO);

  it("finds the packages and their one scope", () => {
    expect(packages.length).toBeGreaterThan(0);
    expect(sharedScope(packages)).toBeTruthy();
  });

  it("every scoped Aurora name in the repo agrees with the package.json names", () => {
    const scope = sharedScope(packages);
    const names = new Set([
      ...packages.map((p) => parseName(String(p.manifest["name"]))?.name),
      ...PLANNED,
    ]);
    const wrong: string[] = [];
    for (const file of textFiles(REPO))
      for (const ref of findReferences(file.text))
        if (ref.scope !== scope || !names.has(ref.name))
          wrong.push(`${file.path}:${ref.line}: ${ref.match}`);
    expect(
      wrong,
      `expected scope @${scope} and one of: ${[...names].join(", ")}`,
    ).toEqual([]);
  });
});
