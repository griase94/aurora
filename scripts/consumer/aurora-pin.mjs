#!/usr/bin/env node
/**
 * Pins an app to one Aurora release. Copy this file into the app (it has no
 * imports beyond Node) and run it from the app's root:
 *
 *   node scripts/aurora-pin.mjs 0.4.0                   GitHub release assets
 *   node scripts/aurora-pin.mjs 0.4.0 --registry npm    npm packages
 *
 * Options:
 *   --owner <owner>   GitHub owner of the Aurora repo (default: read from the
 *                     current pins; pass it once after an account rename)
 *   --repo <name>     repository name (default: read from the pins, else "aurora")
 *   --scope <scope>   npm scope of the packages (default: read from the pins)
 *   --add <a,b>       also add @aurora/<a>, @aurora/<b> to dependencies
 *   --no-install      only write package.json, skip `pnpm install`
 *
 * Every `@aurora/<name>` dependency is pinned. Asset pins also get a pnpm
 * override per package: the packed packages depend on each other under their
 * scoped names (`@<scope>/aurora-<name>`), which no registry serves, and the
 * override sends those to the same tarballs. Registry pins drop the overrides.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = /^\d+\.\d+\.\d+$/;
const SCOPE = /^[a-z0-9][a-z0-9._-]*$/;
const GITHUB_PART = /^[A-Za-z0-9_.-]+$/;
const ASSET =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/v[^/]+\/(.+?)-aurora-[a-z0-9-]+?-\d+\.\d+\.\d+\.tgz$/;
const NPM = /^npm:@([^/]+)\/aurora-[a-z0-9-]+@/;
const SECTIONS = /** @type {const} */ (["dependencies", "devDependencies"]);

/**
 * The owner, repo and scope the current pins use, as far as they say.
 * @param {Record<string, any>} manifest
 */
export function currentSource(manifest) {
  /** @type {{ owner?: string, repo?: string, scope?: string }} */
  const found = {};
  for (const section of SECTIONS)
    for (const [key, spec] of Object.entries(manifest[section] ?? {})) {
      if (!key.startsWith("@aurora/") || typeof spec !== "string") continue;
      const asset = ASSET.exec(spec);
      if (asset)
        Object.assign(found, {
          owner: asset[1],
          repo: asset[2],
          scope: asset[3],
        });
      const npm = NPM.exec(spec);
      if (npm) found.scope = npm[1];
    }
  return found;
}

/**
 * The manifest pinned to one release.
 * @param {Record<string, any>} manifest the app's package.json
 * @param {{ version: string, registry?: "github" | "npm", owner?: string, repo?: string, scope?: string, add?: string[] }} opts
 * @returns {Record<string, any>}
 */
export function pin(manifest, opts) {
  const version = opts.version.replace(/^v/, "");
  if (!VERSION.test(version)) throw new Error(`not a version: ${opts.version}`);
  const registry = opts.registry ?? "github";
  if (registry !== "github" && registry !== "npm")
    throw new Error(`unknown registry: ${registry}`);
  const found = currentSource(manifest);
  const scope = (opts.scope ?? found.scope)?.replace(/^@/, "");
  const owner = opts.owner ?? found.owner;
  const repo = opts.repo ?? found.repo ?? "aurora";
  if (!scope || !SCOPE.test(scope))
    throw new Error("pass --scope: the current pins do not name a valid one");
  if (registry === "github") {
    if (!owner || !GITHUB_PART.test(owner))
      throw new Error("pass --owner: the current pins do not name one");
    if (!GITHUB_PART.test(repo))
      throw new Error(`not a repository name: ${repo}`);
  }

  const next = structuredClone(manifest);
  for (const name of opts.add ?? []) {
    next.dependencies ??= {};
    if (!SECTIONS.some((s) => next[s]?.[`@aurora/${name}`]))
      next.dependencies[`@aurora/${name}`] = "";
  }
  /** @type {string[]} */
  const names = [];
  for (const section of SECTIONS)
    for (const key of Object.keys(next[section] ?? {}))
      if (key.startsWith("@aurora/")) names.push(key.slice("@aurora/".length));
  if (!names.length)
    throw new Error(
      "no @aurora/<name> dependency to pin; add one with --add <name>",
    );

  /** @param {string} name */
  const spec = (name) =>
    registry === "npm"
      ? `npm:@${scope}/aurora-${name}@${version}`
      : `https://github.com/${owner}/${repo}/releases/download/v${version}/${scope}-aurora-${name}-${version}.tgz`;
  for (const section of SECTIONS)
    for (const key of Object.keys(next[section] ?? {}))
      if (key.startsWith("@aurora/"))
        next[section][key] = spec(key.slice("@aurora/".length));

  const overrides = { ...(next.pnpm?.overrides ?? {}) };
  for (const key of Object.keys(overrides))
    if (/^@[^/]+\/aurora-[a-z0-9-]+$/.test(key)) delete overrides[key];
  if (registry === "github")
    for (const name of names)
      overrides[`@${scope}/aurora-${name}`] = spec(name);
  if (Object.keys(overrides).length)
    next.pnpm = { ...(next.pnpm ?? {}), overrides };
  else if (next.pnpm) {
    delete next.pnpm.overrides;
    if (!Object.keys(next.pnpm).length) delete next.pnpm;
  }
  return next;
}

/** @param {string[]} args @param {string} name */
function flag(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--"))
    throw new Error(`${name} needs a value`);
  return v;
}

function main() {
  const args = process.argv.slice(2);
  const version = args[0];
  if (!version || version.startsWith("--")) {
    console.error(
      "usage: aurora-pin.mjs <version> [--registry npm] [--owner o] [--repo r] [--scope s] [--add a,b] [--no-install]",
    );
    process.exit(2);
  }
  try {
    const file = resolve("package.json");
    const text = readFileSync(file, "utf8");
    const indent = /^(\s+)"/m.exec(text)?.[1] ?? "  ";
    const next = pin(JSON.parse(text), {
      version,
      registry: /** @type {"github" | "npm" | undefined} */ (
        flag(args, "--registry")
      ),
      owner: flag(args, "--owner"),
      repo: flag(args, "--repo"),
      scope: flag(args, "--scope"),
      add: flag(args, "--add")?.split(",").filter(Boolean),
    });
    writeFileSync(file, JSON.stringify(next, null, indent) + "\n");
    console.log(
      `aurora-pin: package.json pinned to Aurora ${version.replace(/^v/, "")}`,
    );
    if (!args.includes("--no-install"))
      execFileSync("pnpm", ["install"], { stdio: "inherit" });
  } catch (e) {
    console.error(`aurora-pin: ${/** @type {Error} */ (e).message}`);
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
