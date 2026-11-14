#!/usr/bin/env node
/**
 * The consumer smoke: a fresh project outside the repo installs the packed
 * tarballs the way an app does (scripts/consumer/aurora-pin.mjs: an
 * `@aurora/<name>` key plus a pnpm override per package) and imports every
 * JavaScript entry of every package in Node.
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
import { parseName } from "./lib/packages.mjs";

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
 * The consumer's package.json for a set of tarballs: one `@aurora/<name>`
 * dependency per package and an override that sends the scoped name (which
 * no registry serves yet) to the same tarball.
 * @param {{ name: string, file: string }[]} tarballs packed name and absolute path
 */
export function consumerManifest(tarballs) {
  /** @type {Record<string, string>} */
  const dependencies = {};
  /** @type {Record<string, string>} */
  const overrides = {};
  for (const t of tarballs) {
    const parsed = parseName(t.name);
    if (!parsed) throw new Error(`${t.name} is not @<scope>/aurora-<name>`);
    dependencies[`@aurora/${parsed.name}`] = `file:${t.file}`;
    overrides[t.name] = `file:${t.file}`;
  }
  return {
    name: "aurora-consumer-smoke",
    private: true,
    type: "module",
    dependencies,
    pnpm: { overrides },
  };
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
  const tarballs = files.map((f) => {
    const file = join(abs, f);
    const manifest = JSON.parse(
      execFileSync("tar", ["-xzOf", file, "package/package.json"], {
        encoding: "utf8",
      }),
    );
    return { name: String(manifest.name), file, exports: manifest.exports };
  });
  const app = mkdtempSync(join(tmpdir(), "aurora-consumer-"));
  try {
    writeFileSync(
      join(app, "package.json"),
      JSON.stringify(consumerManifest(tarballs), null, 2),
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
    for (const t of tarballs) {
      const key = `@aurora/${parseName(t.name)?.name}`;
      for (const entry of nodeEntries(t.exports)) {
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
