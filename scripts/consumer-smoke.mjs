#!/usr/bin/env node
/**
 * The consumer smoke: a fresh project outside the repo installs the packed
 * tarballs the way an app does. Its package.json comes from the same `pin()`
 * that apps run (scripts/consumer/aurora-pin.mjs): only the top-level
 * packages (the ones no other package depends on) are dependencies, and every
 * package gets an override, so a sibling that pnpm would otherwise ask the
 * npm registry for fails the install here first. Then it imports every
 * JavaScript entry of every installed package in Node.
 *
 *   node scripts/consumer-smoke.mjs <dir-with-tarballs>
 *
 * Entries Node cannot load on its own (Svelte components, stylesheets) are
 * skipped here; the example apps build them through a bundler.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pin } from "./consumer/aurora-pin.mjs";
import { parseName, topLevel } from "./lib/packages.mjs";

export { topLevel };

/**
 * The subpaths of an exports map that Node can import without a bundler.
 * @param {unknown} exports
 * @returns {string[]}
 */
export function nodeEntries(exports) {
  if (typeof exports === "string") return ["."];
  if (!exports || typeof exports !== "object") return [];
  const out = [];
  for (const [key, target] of Object.entries(exports)) {
    if (!key.startsWith(".") || key.includes("*") || key === "./package.json")
      continue;
    const file =
      typeof target === "string" ? target : (target?.import ?? target?.default);
    if (
      typeof file === "string" &&
      /\.(m?js)$/.test(file) &&
      !("svelte" in Object(target))
    )
      out.push(key);
  }
  return out;
}

/**
 * @typedef {{ name: string, version: string, dependencies?: Record<string, string>, peerDependencies?: Record<string, string>, optionalDependencies?: Record<string, string>, exports?: unknown }} PackedManifest
 */

/**
 * The consumer's package.json for a directory of tarballs, written by the
 * apps' own `pin()`: the top-level packages as `@aurora/<name>` dependencies,
 * an override for every package.
 * @param {string} dir absolute directory holding the tarballs
 * @param {PackedManifest[]} manifests the packed package.json of each tarball
 */
export function consumerManifest(dir, manifests) {
  const parsed = manifests.map((m) => {
    const p = parseName(m.name);
    if (!p) throw new Error(`${m.name} is not @<scope>/aurora-<name>`);
    return { ...p, version: m.version };
  });
  const scopes = new Set(parsed.map((p) => p.scope));
  const versions = new Set(parsed.map((p) => p.version));
  if (scopes.size !== 1 || versions.size !== 1)
    throw new Error(
      `the tarballs disagree on scope or version: ${manifests.map((m) => `${m.name}@${m.version}`).join(", ")}`,
    );
  return pin(
    {
      name: "aurora-consumer-smoke",
      private: true,
      type: "module",
    },
    {
      version: /** @type {string} */ ([...versions][0]),
      scope: /** @type {string} */ ([...scopes][0]),
      packages: parsed.map((p) => p.name),
      add: topLevel(manifests).map((m) => parseName(m.name)?.name ?? ""),
      base: `file:${dir}`,
    },
  );
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: consumer-smoke.mjs <dir-with-tarballs>");
    process.exit(2);
  }
  const abs = resolve(dir);
  const files = readdirSync(abs).filter((f) => f.endsWith(".tgz"));
  if (!files.length) {
    console.error(`consumer-smoke: no tarballs in ${abs}`);
    process.exit(1);
  }
  /** @type {PackedManifest[]} */
  const manifests = files.map((f) =>
    JSON.parse(
      execFileSync("tar", ["-xzOf", join(abs, f), "package/package.json"], {
        encoding: "utf8",
      }),
    ),
  );
  const app = mkdtempSync(join(tmpdir(), "aurora-consumer-"));
  try {
    writeFileSync(
      join(app, "package.json"),
      JSON.stringify(consumerManifest(abs, manifests), null, 2),
    );
    execFileSync(
      "pnpm",
      ["install", "--ignore-workspace", "--config.engine-strict=false"],
      {
        cwd: app,
        stdio: "inherit",
      },
    );
    let imported = 0;
    for (const m of topLevel(manifests)) {
      const key = `@aurora/${parseName(m.name)?.name}`;
      for (const entry of nodeEntries(m.exports)) {
        const spec = entry === "." ? key : `${key}/${entry.slice(2)}`;
        const code = `const m = await import(${JSON.stringify(spec)}); if (!Object.keys(m).length) throw new Error("no exports"); console.log(${JSON.stringify(spec)} + ": " + Object.keys(m).join(", "));`;
        execFileSync("node", ["--input-type=module", "-e", code], {
          cwd: app,
          stdio: "inherit",
        });
        imported += 1;
      }
    }
    if (!imported)
      throw new Error("consumer-smoke: no entry Node could import");
    console.log(
      `consumer-smoke: ${imported} entr${imported === 1 ? "y" : "ies"} import from the packed tarballs`,
    );
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
