#!/usr/bin/env node
/**
 * Builds and packs every workspace package, then checks the tarballs: what a
 * consumer would install, not what the repo holds.
 *
 *   pnpm aurora:pack              build, pack, check; tarballs are removed
 *   pnpm aurora:pack --out DIR    also leave the tarballs in DIR (CI uploads
 *                                 them; the release attaches them)
 *
 * Per package:
 *  1. `pnpm build` (when the package has a build script) writes `dist/`;
 *  2. `pnpm pack` writes the tarball; pnpm swaps in `publishConfig.exports`,
 *     so the tarball's `exports` name `dist/` while the repo's name `src/`;
 *  3. the tarball is checked: every exported file present, every export
 *     inside `dist/`, no test or story inside, publint (strict) and attw
 *     (ESM only).
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO, listPackages, tarballName } from "./lib/packages.mjs";

/** Files a consumer never needs: they stay in the repo. */
const NOT_SHIPPED = /\.(test|spec|stories)\.|\.mdx$/;

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} cwd
 */
function run(cmd, args, cwd) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Every file path an exports map names. */
export function exportedFiles(/** @type {unknown} */ exports) {
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {unknown} */ v) => {
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(exports);
  return [...new Set(out)];
}

/**
 * The problems of one tarball's file list.
 * @param {string[]} files paths inside the tarball (`package/…`)
 * @param {Record<string, unknown>} manifest the packed package.json
 */
export function contentProblems(files, manifest) {
  const inside = new Set(files.map((f) => f.replace(/^package\//, "")));
  const problems = [];
  for (const f of inside)
    if (NOT_SHIPPED.test(f))
      problems.push(`ships ${f}, which is not for consumers`);
  const targets = exportedFiles(manifest["exports"] ?? {});
  if (!targets.length) problems.push("has no exports map");
  for (const target of targets) {
    const path = target.replace(/^\.\//, "");
    if (path.includes("*")) {
      const re = new RegExp(
        `^${path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+")}$`,
      );
      if (![...inside].some((f) => re.test(f)))
        problems.push(`exports ${target}, which matches no file`);
    } else if (!inside.has(path))
      problems.push(`exports ${target}, which is missing`);
    if (target !== "./package.json" && !target.startsWith("./dist/"))
      problems.push(
        `exports ${target} outside dist/: publishConfig.exports was not applied`,
      );
  }
  return problems;
}

/** attw's report for one tarball, as problem lines (ESM-only profile). */
function attw(/** @type {string} */ tgz) {
  // Through a file: attw exits 1 on any finding and cuts a long report short
  // when it writes to a pipe. The report decides, not the exit code.
  const file = `${tgz}.attw.json`;
  try {
    execFileSync(
      "sh",
      [
        "-c",
        'pnpm exec attw "$1" --profile esm-only --format json > "$2"',
        "attw",
        tgz,
        file,
      ],
      { cwd: REPO, stdio: ["ignore", "ignore", "pipe"] },
    );
  } catch {
    // Read the report below.
  }
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  rmSync(file, { force: true });
  /** @type {{ analysis?: { problems?: Record<string, any>[] } }} */
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return [`attw printed no report: ${text.slice(0, 400)}`];
  }
  return (json.analysis?.problems ?? [])
    .filter((p) => !["node10", "node16-cjs"].includes(p["resolutionKind"]))
    .map((p) => `${p["kind"]} (${p["resolutionKind"]}): ${p["entrypoint"]}`);
}

/**
 * Empties an output directory of earlier packs (tarballs, SHA256SUMS), so a
 * renamed or removed package leaves no stale tarball for the smoke to install.
 * Other files stay.
 * @param {string} dir
 * @returns {string[]} the files removed
 */
export function clearPacks(dir) {
  const removed = readdirSync(dir).filter(
    (f) => f.endsWith(".tgz") || f === "SHA256SUMS",
  );
  for (const f of removed) rmSync(join(dir, f), { force: true });
  return removed;
}

function main() {
  const i = process.argv.indexOf("--out");
  const keepDir = i > 0 ? resolve(String(process.argv[i + 1])) : null;
  const out = keepDir ?? mkdtempSync(join(tmpdir(), "aurora-pack-"));
  mkdirSync(out, { recursive: true });
  for (const f of clearPacks(out)) console.log(`aurora:pack: removed old ${f}`);
  const packages = listPackages();
  if (!packages.length) {
    console.error("aurora:pack: no packages under packages/");
    process.exit(1);
  }
  let failed = 0;
  try {
    for (const pkg of packages) {
      const cwd = join(REPO, pkg.dir);
      const name = String(pkg.manifest["name"]);
      rmSync(join(cwd, "dist"), { recursive: true, force: true });
      if (pkg.manifest["scripts"]?.["build"]) run("pnpm", ["-s", "build"], cwd);
      run("pnpm", ["pack", "--pack-destination", out], cwd);
      const tgz = join(out, tarballName(name, String(pkg.manifest["version"])));
      const files = run("tar", ["-tzf", tgz], out).split("\n").filter(Boolean);
      const manifest = JSON.parse(
        run("tar", ["-xzOf", tgz, "package/package.json"], out),
      );
      const problems = contentProblems(files, manifest);
      for (const p of problems) console.error(`${name}: ${p}`);
      failed += problems.length;
      try {
        // publint packs with pnpm itself, so it reads the same manifest.
        const report = run(
          "pnpm",
          ["exec", "publint", "--strict", "--pack", "pnpm"],
          cwd,
        ).trim();
        if (report) console.log(report);
      } catch (e) {
        failed += 1;
        const err = /** @type {{ stdout?: string, stderr?: string }} */ (e);
        console.error(
          `${name}: publint\n${err.stdout ?? ""}${err.stderr ?? ""}`,
        );
      }
      const report = attw(tgz);
      for (const p of report) console.error(`${name}: attw: ${p}`);
      failed += report.length;
      console.log(
        `${name}: ${files.length} files packed${problems.length + report.length ? "" : ", contents, publint and attw clean"}`,
      );
    }
  } finally {
    if (!keepDir) rmSync(out, { recursive: true, force: true });
    for (const pkg of packages)
      rmSync(join(REPO, pkg.dir, "dist"), { recursive: true, force: true });
  }
  if (failed) {
    console.error(`aurora:pack: ${failed} problem(s)`);
    process.exit(1);
  }
  console.log(
    `aurora:pack: ${packages.length} package(s) pass${keepDir ? `; tarballs in ${keepDir}` : ""}`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
