/**
 * The gap ledger: one JSON file per row in `gaps/`, each a finding about the
 * kit that the example works around. This module reads the folder and holds
 * the rules every script and test applies; it never writes.
 *
 * A row's `where` files carry the comment `GAP <id>` on the line of the
 * workaround. A ledger row is the only waiver of the kit-only guard.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   kit: string,
 *   workaround: string,
 *   where: string[],
 *   kitLane: string,
 *   swapLane: string,
 *   issue: string | null,
 *   since: string,
 *   closed?: { lane: string, note: string },
 * }} Gap
 * @typedef {{ file: string, row: Gap }} GapFile
 */

/** The example's root folder. */
export const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** "G-004" for a row the design names; "G-F3-01" for one a lane finds. */
export const GAP_ID = /^G-(?:\d{3}|[A-Z][A-Z0-9]*-\d{2})$/;

/** The comment that marks a workaround: `GAP G-004`. */
export const GAP_COMMENT = /\bGAP (G-[A-Z0-9]+(?:-\d+)?)\b/g;

/**
 * Reads every row file of a ledger folder, sorted by file name.
 * @param {string} dir
 * @returns {GapFile[]}
 */
export function readLedger(dir = join(ROOT, "gaps")) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => ({
      file,
      row: /** @type {Gap} */ (
        JSON.parse(readFileSync(join(dir, file), "utf8"))
      ),
    }));
}

/**
 * Every file below `dir`, as paths relative to `root` with forward slashes.
 * @param {string} root
 * @param {string} dir
 * @returns {string[]}
 */
export function listFiles(root, dir) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {string} */ d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(root, p).split(sep).join("/"));
    }
  };
  walk(abs);
  return out;
}

/** @param {unknown} v */
const isText = (v) => typeof v === "string" && v.trim() !== "";

/**
 * The problems of one row's shape.
 * @param {GapFile} f
 * @returns {string[]}
 */
function shapeProblems({ file, row }) {
  /** @type {string[]} */
  const out = [];
  const r = /** @type {Record<string, unknown>} */ (
    /** @type {unknown} */ (row)
  );
  if (!GAP_ID.test(String(r.id)))
    out.push(`${file}: id "${r.id}" is not a ledger id`);
  else if (!file.startsWith(`${r.id}-`))
    out.push(`${file}: the file name must start with its id ${r.id}`);
  for (const key of [
    "title",
    "kit",
    "workaround",
    "kitLane",
    "swapLane",
    "since",
  ])
    if (!isText(r[key]))
      out.push(`${file}: "${key}" must be a non-empty string`);
  if (!Array.isArray(r.where) || r.where.length === 0 || !r.where.every(isText))
    out.push(`${file}: "where" must list at least one file`);
  if (
    r.issue !== null &&
    !(typeof r.issue === "string" && /^https:\/\//.test(r.issue))
  )
    out.push(
      `${file}: "issue" is the public issue's URL, or null while it is to be filed`,
    );
  if (r.closed !== undefined) {
    const c = /** @type {Record<string, unknown>} */ (r.closed);
    if (!c || !isText(c.lane) || !isText(c.note))
      out.push(`${file}: "closed" needs the lane that closed it and a note`);
  }
  return out;
}

/**
 * The ledger's rules over a set of rows and source files.
 *
 * - every row has its shape, and its file name starts with its id; ids are unique;
 * - every `GAP <id>` comment has an open row;
 * - every open row's `where` files exist and carry its comment;
 * - a closed row's files no longer exist or no longer carry the comment;
 * - every stand-in file has an open row that lists it.
 *
 * @param {{ rows: GapFile[], files: Map<string, string>, standins: string[] }} input
 *   files: path (relative to the example) to content, for every source file
 * @returns {string[]} the problems; empty when the ledger holds
 */
export function ledgerProblems({ rows, files, standins }) {
  /** @type {string[]} */
  const out = [];
  /** @type {Map<string, Gap>} */
  const byId = new Map();
  for (const f of rows) {
    out.push(...shapeProblems(f));
    if (byId.has(f.row.id)) out.push(`${f.file}: id ${f.row.id} is used twice`);
    byId.set(f.row.id, f.row);
  }

  for (const [path, text] of files)
    for (const m of text.matchAll(GAP_COMMENT)) {
      const id = /** @type {string} */ (m[1]);
      const row = byId.get(id);
      if (!row) out.push(`${path}: "GAP ${id}" has no row in gaps/`);
      else if (row.closed)
        out.push(
          `${path}: "GAP ${id}" names a closed row; remove the workaround or reopen it`,
        );
      else if (!row.where.includes(path))
        out.push(`${path}: "GAP ${id}" is not in the row's "where"`);
    }

  const carries = (/** @type {string} */ path, /** @type {string} */ id) =>
    [...(files.get(path) ?? "").matchAll(GAP_COMMENT)].some((m) => m[1] === id);

  for (const row of byId.values()) {
    if (!Array.isArray(row.where)) continue;
    for (const path of row.where) {
      if (row.closed) {
        if (carries(path, row.id))
          out.push(
            `${row.id} is closed but ${path} still carries "GAP ${row.id}"`,
          );
      } else if (!files.has(path))
        out.push(`${row.id}: ${path} does not exist`);
      else if (!carries(path, row.id))
        out.push(
          `${row.id}: ${path} does not carry the comment "GAP ${row.id}"`,
        );
    }
  }

  for (const path of standins)
    if (![...byId.values()].some((r) => !r.closed && r.where?.includes(path)))
      out.push(`${path}: a stand-in needs an open ledger row that lists it`);

  return out;
}

/**
 * Reads the example's sources and stand-ins as `ledgerProblems` takes them.
 * @param {string} root
 */
export function readSources(root = ROOT) {
  const paths = listFiles(root, "src");
  /** @type {Map<string, string>} */
  const files = new Map(
    paths.map((p) => [p, readFileSync(join(root, p), "utf8")]),
  );
  const standins = paths.filter((p) => p.startsWith("src/lib/standins/"));
  return { files, standins };
}

/**
 * The ledger as a Markdown table: open rows grouped by the kit lane expected
 * to land the part, then closed rows.
 * @param {Gap[]} rows
 * @returns {string}
 */
export function ledgerTable(rows) {
  const cell = (/** @type {string} */ s) => s.replaceAll("|", "\\|");
  const line = (/** @type {Gap} */ r) =>
    `| ${r.id} | ${cell(r.title)} | ${cell(r.workaround)} | ${r.kitLane} | ${r.swapLane} | ${r.issue ?? "to file"} |`;
  const head =
    "| Id | Gap | Workaround | Kit lane | Swapped by | Issue |\n|---|---|---|---|---|---|";
  const open = rows
    .filter((r) => !r.closed)
    .sort(
      (a, b) => a.kitLane.localeCompare(b.kitLane) || a.id.localeCompare(b.id),
    );
  const closed = rows
    .filter((r) => r.closed)
    .sort((a, b) => a.id.localeCompare(b.id));
  const parts = [`## Open (${open.length})`, "", head, ...open.map(line)];
  if (closed.length)
    parts.push(
      "",
      `## Closed (${closed.length})`,
      "",
      "| Id | Gap | Closed by | Note |\n|---|---|---|---|",
      ...closed.map(
        (r) =>
          `| ${r.id} | ${cell(r.title)} | ${r.closed?.lane} | ${cell(r.closed?.note ?? "")} |`,
      ),
    );
  return parts.join("\n");
}

/**
 * The pull-request rule of the ledger: every row this pull request adds is
 * named in the body's `## Ledger` section, and every row that was already
 * merged has its public issue.
 *
 * @param {{ baseRows: Gap[], headRows: Gap[], body: string }} input
 * @returns {string[]} the problems; empty when the rule holds
 */
export function ledgerDiffProblems({ baseRows, headRows, body }) {
  /** @type {string[]} */
  const out = [];
  const baseIds = new Set(baseRows.map((r) => r.id));
  const section =
    /^## Ledger[ \t]*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body)?.[1] ?? "";
  for (const row of headRows) {
    if (!baseIds.has(row.id)) {
      if (!new RegExp(`\\b${row.id}\\b`).test(section))
        out.push(
          `${row.id} is new: name it in the pull request's "## Ledger" section`,
        );
    } else if (!row.closed && row.issue === null)
      out.push(
        `${row.id} was merged without its public issue: file it and write the URL into the row`,
      );
  }
  return out;
}
