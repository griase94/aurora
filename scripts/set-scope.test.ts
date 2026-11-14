import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findReferences, rewriteScope } from "./lib/scope.mjs";
import { setScope } from "./set-scope.mjs";

// Built from parts, so the scope check does not read these fixtures as real names.
const scoped = (scope: string, name: string) => `@${scope}/aurora-${name}`;
const asset = (scope: string, name: string, v: string) =>
  `${scope}-aurora-${name}-${v}.tgz`;

describe("rewriteScope", () => {
  it("moves package names and asset names, and nothing else", () => {
    const text = [
      `import x from "${scoped("old", "svelte")}";`,
      `url: .../download/v0.1.0/${asset("old", "tokens", "0.1.0")}`,
      `other: ${scoped("older", "svelte")} and old-aurora-notes.md`,
    ].join("\n");
    expect(rewriteScope(text, "old", "new")).toBe(
      [
        `import x from "${scoped("new", "svelte")}";`,
        `url: .../download/v0.1.0/${asset("new", "tokens", "0.1.0")}`,
        `other: ${scoped("older", "svelte")} and old-aurora-notes.md`,
      ].join("\n"),
    );
  });

  it("refuses an invalid scope", () => {
    expect(() => rewriteScope("", "old", "Not A Scope")).toThrow();
  });
});

describe("findReferences", () => {
  it("finds names and asset names with their line", () => {
    const refs = findReferences(
      `a\n${scoped("s", "svelte")}\n${asset("s", "tokens", "1.2.3")}`,
    );
    expect(refs.map((r) => [r.scope, r.name, r.line])).toEqual([
      ["s", "svelte", 2],
      ["s", "tokens", 3],
    ]);
  });
});

describe("setScope", () => {
  let dir = "";
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function fixture() {
    dir = mkdtempSync(join(tmpdir(), "aurora-scope-"));
    mkdirSync(join(dir, "packages/one"), { recursive: true });
    writeFileSync(
      join(dir, "packages/one/package.json"),
      JSON.stringify({ name: scoped("old", "one") }),
    );
    writeFileSync(
      join(dir, "README.md"),
      `Install ${scoped("old", "one")} from ${asset("old", "one", "0.0.1")}.\n`,
    );
    execFileSync("git", ["init", "-q"], { cwd: dir });
    return dir;
  }

  it("renames every package and every reference in one go", () => {
    const root = fixture();
    const result = setScope(root, "@fresh");
    expect(result.from).toBe("old");
    expect(result.changed.sort()).toEqual([
      "README.md",
      "packages/one/package.json",
    ]);
    expect(
      JSON.parse(readFileSync(join(root, "packages/one/package.json"), "utf8"))
        .name,
    ).toBe(scoped("fresh", "one"));
    expect(readFileSync(join(root, "README.md"), "utf8")).toBe(
      `Install ${scoped("fresh", "one")} from ${asset("fresh", "one", "0.0.1")}.\n`,
    );
  });

  it("is a no-op for the current scope", () => {
    const root = fixture();
    expect(setScope(root, "old").changed).toEqual([]);
  });
});
