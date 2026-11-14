#!/usr/bin/env node
/**
 * Pins an app to one Aurora release. Copy this file into the app (it has no
 * imports beyond Node 24) and run it from the app's root:
 *
 *   node scripts/aurora-pin.mjs 0.4.0                   GitHub release assets
 *   node scripts/aurora-pin.mjs 0.4.0 --registry npm    npm packages
 *   node scripts/aurora-pin.mjs --verify                re-download the pinned
 *                                                       assets and compare them
 *                                                       with the recorded sha256
 *
 * Options (`--x value` or `--x=value`; anything else is refused):
 *   --owner <owner>   GitHub owner of the Aurora repo (default: read from the
 *                     current pins; pass it once after an account rename)
 *   --repo <name>     repository name (default: read from the pins, else "aurora")
 *   --scope <scope>   npm scope of the packages (assets: read from the release;
 *                     npm: read from the current pins)
 *   --add <a,b>       also add @aurora/<a>, @aurora/<b> to dependencies
 *   --no-install      only write package.json, skip `pnpm install`
 *
 * Asset pins: the script downloads the release's SHA256SUMS and every tarball
 * it lists, refuses to pin when one does not match, and records the checksums
 * in package.json (`aurora.sha256`). pnpm keeps no integrity for tarball URLs,
 * so `--verify` (run it in the app's CI) is what notices a re-uploaded asset.
 *
 * Every `@aurora/<name>` dependency is pinned, and every package of the
 * release gets a pnpm override, not only the ones the app lists: the packed
 * packages depend on each other under their scoped names
 * (`@<scope>/aurora-<name>`), and without an override pnpm would ask the npm
 * registry for those names. Registry pins drop the overrides and checksums.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SCOPE = /^[a-z0-9][a-z0-9._-]*$/;
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const GITHUB_PART = /^[A-Za-z0-9_.-]+$/;
const ASSET =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/v[^/]+\/(.+?)-aurora-[a-z0-9-]+?-\d+\.\d+\.\d+\.tgz$/;
const NPM = /^npm:@([^/]+)\/aurora-[a-z0-9-]+@/;
const AURORA_OVERRIDE = /^@[^/]+\/aurora-[a-z0-9-]+$/;
const SECTIONS = /** @type {const} */ (["dependencies", "devDependencies"]);

const USAGE =
  "usage: aurora-pin.mjs <version> [--registry npm] [--owner o] [--repo r] [--scope s] [--add a,b] [--no-install]\n" +
  "       aurora-pin.mjs --verify";

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

/** `0.4.0` from `0.4.0` or `v0.4.0`; throws on anything else. */
export function normalizeVersion(/** @type {string} */ v) {
  const version = v.replace(/^v/, "");
  if (!VERSION.test(version)) throw new Error(`not a version: ${v}`);
  return version;
}

/**
 * The download URL of a release's assets, without the trailing slash.
 * @param {{ owner?: string, repo?: string, version: string }} opts
 */
export function releaseBase({ owner, repo = "aurora", version }) {
  if (!owner || !GITHUB_PART.test(owner))
    throw new Error("pass --owner: the current pins do not name one");
  if (!GITHUB_PART.test(repo))
    throw new Error(`not a repository name: ${repo}`);
  return `https://github.com/${owner}/${repo}/releases/download/v${normalizeVersion(version)}`;
}

/**
 * The entries of a SHA256SUMS file (`<sha256>  <file>` per line).
 * @param {string} text
 * @returns {{ file: string, sha256: string }[]}
 */
export function parseSums(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = /^([0-9a-f]{64}) [ *]([^/\\]+)$/.exec(line.trim());
    if (!m) throw new Error(`SHA256SUMS: unreadable line "${line}"`);
    out.push({
      file: /** @type {string} */ (m[2]),
      sha256: /** @type {string} */ (m[1]),
    });
  }
  if (!out.length) throw new Error("SHA256SUMS lists no file");
  return out;
}

/**
 * The scope and package names of a release, from its SHA256SUMS entries.
 * Without a scope it is read from the tarball names; with one, every tarball
 * must carry it.
 * @param {{ file: string }[]} entries
 * @param {{ version: string, scope?: string }} opts
 */
export function releasePackages(entries, { version, scope }) {
  const v = normalizeVersion(version);
  const suffix = `-${v}.tgz`;
  const tarballs = entries.map((e) => e.file).filter((f) => f.endsWith(".tgz"));
  if (!tarballs.length) throw new Error("the release has no tarball");
  const first = /** @type {string} */ (tarballs[0]);
  const at = first.indexOf("-aurora-");
  const actual = scope?.replace(/^@/, "") ?? (at > 0 ? first.slice(0, at) : "");
  if (!SCOPE.test(actual))
    throw new Error(`cannot read the scope from ${first}; pass --scope`);
  const prefix = `${actual}-aurora-`;
  const names = new Set();
  for (const file of tarballs) {
    const name =
      file.startsWith(prefix) && file.endsWith(suffix)
        ? file.slice(prefix.length, -suffix.length)
        : "";
    if (!NAME.test(name))
      throw new Error(
        `the release lists ${file}, which is not @${actual}/aurora-<name> ${v}`,
      );
    names.add(name);
  }
  return { scope: actual, packages: [...names].sort() };
}

/** The hex sha256 of some bytes. */
export function sha256(/** @type {Buffer | string} */ data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * What disagrees between the expected and the downloaded checksums.
 * @param {Record<string, string>} expected file → sha256
 * @param {Record<string, string>} actual file → sha256 of the bytes downloaded
 * @returns {string[]} one line per problem, empty when every file matches
 */
export function checkAssets(expected, actual) {
  const problems = [];
  for (const [file, hash] of Object.entries(actual)) {
    const want = expected[file];
    if (!want) problems.push(`${file}: no recorded sha256`);
    else if (want !== hash)
      problems.push(`${file}: sha256 ${hash} does not match ${want}`);
  }
  return problems;
}

/**
 * The release-asset URLs an app's package.json pins (dependencies and
 * Aurora overrides), each once, with its file name.
 * @param {Record<string, any>} manifest
 * @returns {{ file: string, url: string }[]}
 */
export function assetPins(manifest) {
  const urls = new Set();
  for (const section of SECTIONS)
    for (const [key, spec] of Object.entries(manifest[section] ?? {}))
      if (key.startsWith("@aurora/") && typeof spec === "string")
        urls.add(spec);
  for (const [key, spec] of Object.entries(manifest.pnpm?.overrides ?? {}))
    if (AURORA_OVERRIDE.test(key) && typeof spec === "string") urls.add(spec);
  return [...urls]
    .filter((u) => /^https:\/\/.+\.tgz$/.test(u))
    .map((url) => ({ url, file: url.slice(url.lastIndexOf("/") + 1) }));
}

/**
 * The manifest pinned to one release.
 * @param {Record<string, any>} manifest the app's package.json
 * @param {{
 *   version: string,
 *   registry?: "github" | "npm",
 *   owner?: string,
 *   repo?: string,
 *   scope?: string,
 *   add?: string[],
 *   packages?: string[],
 *   sha256?: Record<string, string>,
 *   base?: string,
 * }} opts
 *   packages: every package of the release (asset pins; from its SHA256SUMS);
 *   sha256: the release's checksums by file name, recorded as `aurora.sha256`;
 *   base: where the tarballs are, instead of the GitHub release (smoke test)
 * @returns {Record<string, any>}
 */
export function pin(manifest, opts) {
  const version = normalizeVersion(opts.version);
  const registry = opts.registry ?? "github";
  if (registry !== "github" && registry !== "npm")
    throw new Error(`unknown registry: ${registry}`);
  const found = currentSource(manifest);
  const scope = (opts.scope ?? found.scope)?.replace(/^@/, "");
  if (!scope || !SCOPE.test(scope))
    throw new Error("pass --scope: the current pins do not name a valid one");
  const base =
    registry === "github"
      ? (opts.base ??
        releaseBase({
          owner: opts.owner ?? found.owner,
          repo: opts.repo ?? found.repo,
          version,
        }))
      : "";

  const next = structuredClone(manifest);
  for (const name of opts.add ?? []) {
    if (!NAME.test(name)) throw new Error(`not a package name: ${name}`);
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

  const released = opts.packages ?? [];
  if (registry === "github") {
    if (!released.length)
      throw new Error("the list of the release's packages is missing");
    const missing = names.filter((n) => !released.includes(n));
    if (missing.length)
      throw new Error(
        `v${version} has no package ${missing.join(", ")} (it has ${released.join(", ")})`,
      );
  }

  /** @param {string} name */
  const spec = (name) =>
    registry === "npm"
      ? `npm:@${scope}/aurora-${name}@${version}`
      : `${base}/${scope}-aurora-${name}-${version}.tgz`;
  for (const section of SECTIONS)
    for (const key of Object.keys(next[section] ?? {}))
      if (key.startsWith("@aurora/"))
        next[section][key] = spec(key.slice("@aurora/".length));

  const overrides = { ...(next.pnpm?.overrides ?? {}) };
  for (const key of Object.keys(overrides))
    if (AURORA_OVERRIDE.test(key)) delete overrides[key];
  if (registry === "github")
    for (const name of released)
      overrides[`@${scope}/aurora-${name}`] = spec(name);
  if (Object.keys(overrides).length)
    next.pnpm = { ...(next.pnpm ?? {}), overrides };
  else if (next.pnpm) {
    delete next.pnpm.overrides;
    if (!Object.keys(next.pnpm).length) delete next.pnpm;
  }

  if (next.aurora && typeof next.aurora === "object") delete next.aurora.sha256;
  if (registry === "github" && opts.sha256)
    next.aurora = { ...(next.aurora ?? {}), sha256: { ...opts.sha256 } };
  if (next.aurora && !Object.keys(next.aurora).length) delete next.aurora;
  return next;
}

/**
 * @typedef {{ verify: true }} VerifyCommand
 * @typedef {{ verify: false, version: string, registry?: "github" | "npm", owner?: string, repo?: string, scope?: string, add?: string[], install: boolean }} PinCommand
 */

/**
 * The command line, parsed strictly.
 * @param {string[]} argv the arguments after the script name
 * @returns {VerifyCommand | PinCommand}
 */
export function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: true,
    options: {
      registry: { type: "string" },
      owner: { type: "string" },
      repo: { type: "string" },
      scope: { type: "string" },
      add: { type: "string" },
      "no-install": { type: "boolean" },
      verify: { type: "boolean" },
    },
  });
  if (values.verify) {
    if (positionals.length || Object.keys(values).length > 1)
      throw new Error("--verify takes no other argument");
    return { verify: true };
  }
  if (positionals.length !== 1)
    throw new Error("give exactly one version, for example 0.4.0");
  const registry = values.registry;
  if (registry !== undefined && registry !== "github" && registry !== "npm")
    throw new Error(`unknown registry: ${registry}`);
  return {
    verify: false,
    version: normalizeVersion(/** @type {string} */ (positionals[0])),
    registry,
    owner: values.owner,
    repo: values.repo,
    scope: values.scope,
    add: values.add?.split(",").filter(Boolean),
    install: !values["no-install"],
  };
}

/** @param {string} url */
async function download(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** @param {{ file: string, url: string }[]} assets */
async function downloadHashes(assets) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const a of assets) out[a.file] = sha256(await download(a.url));
  return out;
}

/** @param {Record<string, any>} manifest */
async function verify(manifest) {
  const assets = assetPins(manifest);
  if (!assets.length) {
    console.log("aurora-pin: no release-asset pins to verify");
    return;
  }
  const problems = checkAssets(
    manifest.aurora?.sha256 ?? {},
    await downloadHashes(assets),
  );
  if (problems.length)
    throw new Error(`asset check failed:\n  ${problems.join("\n  ")}`);
  console.log(
    `aurora-pin: ${assets.length} asset(s) match the recorded sha256`,
  );
}

/**
 * @param {Record<string, any>} manifest
 * @param {PinCommand} cli
 */
async function pinRelease(manifest, cli) {
  if (cli.registry === "npm")
    return pin(manifest, {
      version: cli.version,
      registry: "npm",
      scope: cli.scope,
      add: cli.add,
    });
  const found = currentSource(manifest);
  const base = releaseBase({
    owner: cli.owner ?? found.owner,
    repo: cli.repo ?? found.repo,
    version: cli.version,
  });
  const entries = parseSums(
    (await download(`${base}/SHA256SUMS`)).toString("utf8"),
  );
  const { scope, packages } = releasePackages(entries, {
    version: cli.version,
    scope: cli.scope,
  });
  const expected = Object.fromEntries(entries.map((e) => [e.file, e.sha256]));
  const problems = checkAssets(
    expected,
    await downloadHashes(
      entries.map((e) => ({ file: e.file, url: `${base}/${e.file}` })),
    ),
  );
  if (problems.length)
    throw new Error(
      `the release assets do not match SHA256SUMS:\n  ${problems.join("\n  ")}`,
    );
  return pin(manifest, {
    version: cli.version,
    scope,
    packages,
    sha256: expected,
    base,
    add: cli.add,
  });
}

async function main() {
  /** @type {VerifyCommand | PinCommand} */
  let cli;
  try {
    cli = parseCli(process.argv.slice(2));
  } catch (e) {
    console.error(`aurora-pin: ${/** @type {Error} */ (e).message}\n${USAGE}`);
    process.exit(2);
  }
  try {
    const file = resolve("package.json");
    const text = readFileSync(file, "utf8");
    const manifest = JSON.parse(text);
    if (cli.verify) return await verify(manifest);
    const indent = /^(\s+)"/m.exec(text)?.[1] ?? "  ";
    const next = await pinRelease(manifest, cli);
    writeFileSync(file, JSON.stringify(next, null, indent) + "\n");
    console.log(`aurora-pin: package.json pinned to Aurora ${cli.version}`);
    if (cli.install) execFileSync("pnpm", ["install"], { stdio: "inherit" });
  } catch (e) {
    console.error(`aurora-pin: ${/** @type {Error} */ (e).message}`);
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
