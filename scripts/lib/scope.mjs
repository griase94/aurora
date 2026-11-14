/**
 * Where Aurora's npm scope appears in text: package names (`@<scope>/aurora-<name>`)
 * and release asset names (`<scope>-aurora-<name>-<version>.tgz`). Shared by
 * scripts/set-scope.mjs (rewrites them) and scripts/check-scope.test.ts
 * (checks them against the package.json names).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SCOPE = /^[a-z0-9][a-z0-9._-]*$/;

/** Package names in text. */
const NAME = /@([a-z0-9][a-z0-9._-]*)\/aurora-([a-z0-9]+(?:-[a-z0-9]+)*)/g;
/** Release asset names in text. */
const ASSET =
  /(?<![a-z0-9._-])([a-z0-9][a-z0-9._-]*?)-aurora-([a-z0-9]+(?:-[a-z0-9]+)*?)-\d+\.\d+\.\d+\.tgz/g;

/**
 * Every scoped Aurora reference in a text.
 * @param {string} text
 * @returns {{ scope: string, name: string, match: string, line: number }[]}
 */
export function findReferences(text) {
  const out = [];
  for (const re of [NAME, ASSET])
    for (const m of text.matchAll(re))
      out.push({
        scope: /** @type {string} */ (m[1]),
        name: /** @type {string} */ (m[2]),
        match: m[0],
        line: text.slice(0, m.index).split("\n").length,
      });
  return out;
}

/** Escapes a string for use inside a RegExp. */
function escape(/** @type {string} */ s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The text with every reference to scope `from` moved to scope `to`.
 * References to other scopes stay as they are.
 */
export function rewriteScope(
  /** @type {string} */ text,
  /** @type {string} */ from,
  /** @type {string} */ to,
) {
  if (!SCOPE.test(from) || !SCOPE.test(to))
    throw new Error(`not an npm scope: ${!SCOPE.test(from) ? from : to}`);
  return text
    .replace(new RegExp(`@${escape(from)}/aurora-`, "g"), `@${to}/aurora-`)
    .replace(
      new RegExp(
        `(?<![a-z0-9._-])${escape(from)}-aurora-(?=[a-z0-9-]+?-\\d+\\.\\d+\\.\\d+\\.tgz)`,
        "g",
      ),
      `${to}-aurora-`,
    );
}

/**
 * The repo's text files: tracked plus new, ignored ones left out; files with
 * a NUL byte (binary) are skipped.
 * @param {string} root
 * @returns {{ path: string, text: string }[]}
 */
export function textFiles(root) {
  const paths = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: root,
      encoding: "utf8",
    },
  )
    .split("\0")
    .filter(Boolean);
  const out = [];
  for (const path of [...new Set(paths)]) {
    const abs = join(root, path);
    if (!existsSync(abs)) continue;
    const buf = readFileSync(abs);
    if (buf.includes(0)) continue;
    out.push({ path, text: buf.toString("utf8") });
  }
  return out;
}
