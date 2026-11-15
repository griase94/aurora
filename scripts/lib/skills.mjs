// Checks the agent skills in .claude/skills against the Agent Skills format
// (https://agentskills.io/specification) and this repository's own limits.
// Used by scripts/skills.test.ts; plain JavaScript so Node runs it without a loader.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/** Frontmatter fields the Agent Skills specification defines. */
export const ALLOWED_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);
/** The specification's limits. */
export const NAME_MAX = 64;
export const DESCRIPTION_MAX = 1024;
export const COMPATIBILITY_MAX = 500;
/** This repository's limit for a SKILL.md body: longer material goes to reference/. */
export const BODY_MAX_LINES = 150;

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Splits a SKILL.md into its frontmatter fields and its body. Supports the
 * subset of YAML the format uses: `key: value` at the top level (a value may
 * be quoted), and indented lines that belong to the key above (a map such as
 * `metadata`).
 * @param {string} text
 * @returns {{ fields: Map<string, string>, body: string } | null}
 */
export function parseSkill(text) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!match) return null;
  const [, head = "", body = ""] = match;
  const fields = new Map();
  let last = "";
  for (const line of head.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (/^\s/.test(line) && last) {
      fields.set(last, `${fields.get(last)}\n${line}`);
      continue;
    }
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) return null;
    const [, key = "", raw = ""] = kv;
    fields.set(key, unquote(raw.trim()));
    last = key;
  }
  return { fields, body };
}

/** @param {string} value */
function unquote(value) {
  if (/^"(.*)"$/.test(value)) return JSON.parse(value);
  if (/^'(.*)'$/.test(value)) return value.slice(1, -1).replaceAll("''", "'");
  return value;
}

/**
 * Relative Markdown link targets in a text, without anchors; external links,
 * pure anchors and links inside code (fenced or inline) are skipped.
 * @param {string} text
 */
export function relativeLinks(text) {
  const prose = text
    .replace(/^```[\s\S]*?^```/gm, "")
    .replace(/`[^`\n]*`/g, "");
  const out = [];
  for (const m of prose.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1] ?? "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
    const path = target.split("#")[0] ?? "";
    if (path) out.push(path);
  }
  return out;
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function markdownFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...markdownFiles(path));
    else if (entry.endsWith(".md")) out.push(path);
  }
  return out;
}

/**
 * Every problem with the skills under `skillsDir`, one line each; empty when
 * all hold.
 * @param {string} skillsDir
 * @returns {string[]}
 */
export function checkSkills(skillsDir) {
  const root = resolve(skillsDir);
  const problems = [];
  const rel = (/** @type {string} */ p) => relative(root, p);
  const skills = readdirSync(root).filter((e) =>
    statSync(join(root, e)).isDirectory(),
  );

  for (const skill of skills) {
    const file = join(root, skill, "SKILL.md");
    if (!existsSync(file)) {
      problems.push(`${skill}: no SKILL.md`);
      continue;
    }
    const parsed = parseSkill(readFileSync(file, "utf8"));
    if (!parsed) {
      problems.push(`${rel(file)}: no valid frontmatter between --- lines`);
      continue;
    }
    const { fields, body } = parsed;
    for (const key of fields.keys())
      if (!ALLOWED_FIELDS.has(key))
        problems.push(
          `${rel(file)}: frontmatter field "${key}" is not in the Agent Skills format`,
        );
    const name = fields.get("name") ?? "";
    if (!NAME_PATTERN.test(name) || name.length > NAME_MAX)
      problems.push(
        `${rel(file)}: name "${name}" is not 1-${NAME_MAX} lowercase letters, digits and single hyphens`,
      );
    if (name !== skill)
      problems.push(
        `${rel(file)}: name "${name}" differs from its folder "${skill}"`,
      );
    const description = fields.get("description") ?? "";
    if (description.length === 0 || description.length > DESCRIPTION_MAX)
      problems.push(
        `${rel(file)}: description has ${description.length} characters (1-${DESCRIPTION_MAX})`,
      );
    if (!/\bUse when\b/.test(description))
      problems.push(
        `${rel(file)}: description does not say when to load it ("Use when …")`,
      );
    const compatibility = fields.get("compatibility");
    if (compatibility !== undefined && compatibility.length > COMPATIBILITY_MAX)
      problems.push(
        `${rel(file)}: compatibility has more than ${COMPATIBILITY_MAX} characters`,
      );
    const lines = body.replace(/\n+$/, "").split("\n").length;
    if (lines > BODY_MAX_LINES)
      problems.push(
        `${rel(file)}: body has ${lines} lines (at most ${BODY_MAX_LINES}; move detail to reference/)`,
      );
  }

  for (const file of markdownFiles(root))
    for (const link of relativeLinks(readFileSync(file, "utf8")))
      if (!existsSync(resolve(dirname(file), link)))
        problems.push(`${rel(file)}: link ${link} does not resolve`);

  const readme = join(root, "README.md");
  if (!existsSync(readme))
    problems.push("README.md: missing (the index of the skills)");
  else {
    const listed = new Set(
      [
        ...readFileSync(readme, "utf8").matchAll(
          /\]\(([^/)\s]+)\/SKILL\.md\)/g,
        ),
      ].map((m) => m[1] ?? ""),
    );
    for (const skill of skills)
      if (!listed.has(skill))
        problems.push(`README.md: index does not list ${skill}`);
    for (const name of listed)
      if (!skills.includes(name))
        problems.push(`README.md: index lists ${name}, which does not exist`);
  }
  return problems;
}
