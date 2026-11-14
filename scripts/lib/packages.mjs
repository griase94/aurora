/**
 * The workspace packages Aurora releases: every `packages/<dir>/package.json`.
 * Names are read, never hard-coded, so a scope rename (scripts/set-scope.mjs)
 * touches nothing here.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/**
 * @typedef {{ dir: string, path: string, manifest: Record<string, any> }} WorkspacePackage
 */

/**
 * @param {string} [root] the repo root
 * @returns {WorkspacePackage[]} sorted by directory name
 */
export function listPackages(root = REPO) {
  const base = join(root, "packages");
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .filter((dir) => existsSync(join(base, dir, "package.json")))
    .map((dir) => {
      const path = join(base, dir, "package.json");
      return {
        dir: `packages/${dir}`,
        path,
        manifest: JSON.parse(readFileSync(path, "utf8")),
      };
    });
}

/** `@<scope>/aurora-<name>` → `{ scope, name }`, or null for any other name. */
export function parseName(/** @type {string} */ full) {
  const m = /^@([a-z0-9][a-z0-9._-]*)\/aurora-([a-z0-9][a-z0-9-]*)$/.exec(full);
  return m
    ? {
        scope: /** @type {string} */ (m[1]),
        name: /** @type {string} */ (m[2]),
      }
    : null;
}

/**
 * The one scope every package shares. Throws when packages disagree or a
 * package does not follow `@<scope>/aurora-<name>`.
 * @param {WorkspacePackage[]} packages
 */
export function sharedScope(packages) {
  const scopes = new Set();
  for (const p of packages) {
    const parsed = parseName(String(p.manifest["name"]));
    if (!parsed)
      throw new Error(
        `${p.dir}: name ${p.manifest["name"]} is not @<scope>/aurora-<name>`,
      );
    scopes.add(parsed.scope);
  }
  if (scopes.size > 1)
    throw new Error(
      `packages disagree on the scope: ${[...scopes].join(", ")}`,
    );
  return /** @type {string | undefined} */ ([...scopes][0]);
}

/** The file name `pnpm pack` gives a package's tarball. */
export function tarballName(
  /** @type {string} */ name,
  /** @type {string} */ version,
) {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}
