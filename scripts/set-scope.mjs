#!/usr/bin/env node
/**
 * Moves every Aurora package to another npm scope in one command:
 *
 *   pnpm scope:set <scope>        e.g. pnpm scope:set acme  (or @acme)
 *
 * The current scope is read from packages/<name>/package.json (all packages
 * share one). Every text file of the repo gets `@<old>/aurora-<name>` and
 * `<old>-aurora-<name>-<version>.tgz` rewritten, package.json names and the
 * lockfile included; then run `pnpm install` and `pnpm scope:check`.
 * The npm scope is independent of the GitHub owner.
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO, listPackages, sharedScope } from "./lib/packages.mjs";
import { SCOPE, rewriteScope, textFiles } from "./lib/scope.mjs";

/**
 * @param {string} root
 * @param {string} input the new scope, with or without `@`
 * @returns {{ from: string, to: string, changed: string[] }}
 */
export function setScope(root, input) {
  const to = input.replace(/^@/, "");
  if (!SCOPE.test(to)) throw new Error(`not an npm scope: ${input}`);
  const from = sharedScope(listPackages(root));
  if (!from)
    throw new Error(
      "no package under packages/ to read the current scope from",
    );
  if (from === to) return { from, to, changed: [] };
  const changed = [];
  for (const file of textFiles(root)) {
    const next = rewriteScope(file.text, from, to);
    if (next !== file.text) {
      writeFileSync(join(root, file.path), next);
      changed.push(file.path);
    }
  }
  return { from, to, changed };
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("usage: set-scope.mjs <scope>");
    process.exit(2);
  }
  try {
    const { from, to, changed } = setScope(REPO, input);
    if (!changed.length) {
      console.log(`set-scope: the packages already use @${to}`);
      return;
    }
    for (const f of changed) console.log(`  ${f}`);
    console.log(
      `set-scope: @${from} → @${to} in ${changed.length} file(s); now run pnpm install and pnpm scope:check`,
    );
  } catch (e) {
    console.error(`set-scope: ${/** @type {Error} */ (e).message}`);
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
