// Checks the agent skills in .claude/skills against the Agent Skills format
// (https://agentskills.io/specification), Anthropic's frontmatter rules
// (https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
// and this repository's own limits.
// Used by scripts/skills.test.ts; plain JavaScript so Node runs it without a loader.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

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
/** This repository's limit for a SKILL.md body: longer material goes to references/. */
export const BODY_MAX_LINES = 150;

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Words Anthropic reserves in a skill's name. */
const RESERVED_NAME_WORDS = ["anthropic", "claude"];
const XML_TAG = /<\/?[A-Za-z][\w-]*(?:\s[^<>]*)?>/;

/**
 * Splits a SKILL.md into its frontmatter and its body, and parses the
 * frontmatter as YAML, strictly: a value that YAML reads differently from
 * what its author meant (an unquoted `: ` in a plain scalar) is an error,
 * because other clients load the file with a strict parser.
 * @param {string} text
 * @returns {{ fields: Map<string, unknown>, body: string } | { error: string }}
 */
export function parseSkill(text) {
  const match = /^---\n([\s\S]*?)\n---(?:\n([\s\S]*))?$/.exec(
    text.replace(/\r\n?/g, "\n"),
  );
  if (!match) return { error: "no frontmatter between --- lines" };
  const [, head = "", body = ""] = match;
  /** @type {unknown} */
  let data;
  try {
    data = parseYaml(head);
  } catch (e) {
    const message = e instanceof Error ? e.message.split("\n")[0] : String(e);
    return { error: `frontmatter is not valid YAML: ${message}` };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data))
    return { error: "frontmatter is not a YAML mapping" };
  return { fields: new Map(Object.entries(data)), body };
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

/** Top-level folders whose paths a skill names from the repository root. */
const REPO_ROOTS = ["apps", "packages", "scripts", "tests", "docs"];
const REPO_PATH = new RegExp(
  `(?<![\\w./$@-])((?:${REPO_ROOTS.join("|")})/[\\w./<>*{}@$-]*)`,
  "g",
);

/**
 * The repository paths and package scripts a skill text names, in inline
 * code and in shell code blocks (other code blocks are illustrations):
 * `apps/…`, `packages/…`, `scripts/…`, `tests/…`, `docs/…`,
 * `pnpm -C apps/docs <script>` and `pnpm <script>`.
 * @param {string} text
 */
export function namedFacts(text) {
  const code = [
    ...[...text.matchAll(/^```(?:sh|bash|shell)\n([\s\S]*?)^```/gm)].map(
      (m) => m[1] ?? "",
    ),
    ...[...text.replace(/^```[\s\S]*?^```/gm, "").matchAll(/`([^`\n]+)`/g)].map(
      (m) => m[1] ?? "",
    ),
  ].join("\n");
  const paths = new Set();
  for (const m of code.matchAll(REPO_PATH)) {
    const path = (m[1] ?? "").replace(/[.,:;]+$/, "");
    if (path.includes("/")) paths.add(path);
  }
  const docsScripts = new Set();
  for (const m of code.matchAll(
    /pnpm (?:-s )?-C apps\/docs (?:-s )?([a-z][\w:-]*)/g,
  ))
    docsScripts.add(m[1] ?? "");
  const rootScripts = new Set();
  for (const m of code.matchAll(/(?<![\w-])pnpm (?:-s )?([a-z][\w:-]*)/g)) {
    const name = m[1] ?? "";
    if (!["dlx", "exec", "add", "install", "i", "view"].includes(name))
      rootScripts.add(name);
  }
  return { paths, docsScripts, rootScripts };
}

/**
 * Whether a named path exists under `repo`. A path with a placeholder
 * (`<slug>`, `*`, `{a,b}`, `$x`) counts when the folder before it exists.
 * @param {string} repo
 * @param {string} path
 */
function pathExists(repo, path) {
  const wild = path.search(/[<*{$]/);
  if (wild === -1) return existsSync(join(repo, path));
  const folder = path.slice(0, path.lastIndexOf("/", wild) + 1);
  return folder !== "" && existsSync(join(repo, folder));
}

/** @param {string} file */
function scripts(file) {
  if (!existsSync(file)) return new Set();
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  return new Set(Object.keys(pkg.scripts ?? {}));
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
 * all hold. With `repo` (the repository root) it also checks that the root
 * AGENTS.md names every skill and, once `apps/docs` exists there, that every
 * path and package script the skills name exists.
 * @param {string} skillsDir
 * @param {{ repo?: string }} [options]
 * @returns {string[]}
 */
export function checkSkills(skillsDir, { repo } = {}) {
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
    if ("error" in parsed) {
      problems.push(`${rel(file)}: ${parsed.error}`);
      continue;
    }
    const { fields, body } = parsed;
    for (const key of fields.keys())
      if (!ALLOWED_FIELDS.has(key))
        problems.push(
          `${rel(file)}: frontmatter field "${key}" is not in the Agent Skills format`,
        );
    const rawName = fields.get("name");
    const name = typeof rawName === "string" ? rawName : "";
    if (!NAME_PATTERN.test(name) || name.length > NAME_MAX)
      problems.push(
        `${rel(file)}: name "${name}" is not 1-${NAME_MAX} lowercase letters, digits and single hyphens`,
      );
    for (const word of RESERVED_NAME_WORDS)
      if (name.split("-").includes(word))
        problems.push(
          `${rel(file)}: name contains the reserved word "${word}"`,
        );
    if (name !== skill)
      problems.push(
        `${rel(file)}: name "${name}" differs from its folder "${skill}"`,
      );
    const rawDescription = fields.get("description");
    const description =
      typeof rawDescription === "string" ? rawDescription : "";
    if (description.length === 0 || description.length > DESCRIPTION_MAX)
      problems.push(
        `${rel(file)}: description has ${description.length} characters (1-${DESCRIPTION_MAX})`,
      );
    if (!/\bUse when\b/.test(description))
      problems.push(
        `${rel(file)}: description does not say when to load it ("Use when …")`,
      );
    for (const [key, value] of Object.entries({ name, description }))
      if (XML_TAG.test(value))
        problems.push(`${rel(file)}: ${key} contains an XML tag`);
    const compatibility = fields.get("compatibility");
    if (
      compatibility !== undefined &&
      (typeof compatibility !== "string" ||
        compatibility.length > COMPATIBILITY_MAX)
    )
      problems.push(
        `${rel(file)}: compatibility is not a string of at most ${COMPATIBILITY_MAX} characters`,
      );
    const lines = body.replace(/\n+$/, "").split("\n").length;
    if (lines > BODY_MAX_LINES)
      problems.push(
        `${rel(file)}: body has ${lines} lines (at most ${BODY_MAX_LINES}; move detail to references/)`,
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

  if (repo) problems.push(...checkRepoFacts(root, resolve(repo), skills));
  return problems;
}

/**
 * The checks against the repository the skills describe.
 * @param {string} root the skills folder
 * @param {string} repo the repository root
 * @param {string[]} skills
 */
function checkRepoFacts(root, repo, skills) {
  const problems = [];
  const agents = join(repo, "AGENTS.md");
  const agentsText = existsSync(agents) ? readFileSync(agents, "utf8") : "";
  for (const skill of skills)
    if (!agentsText.includes(`\`${skill}\``))
      problems.push(`AGENTS.md: the Skills list does not name \`${skill}\``);

  // The docs skills describe apps/docs and the packages beside it; until that
  // tree is in the repository there is nothing to hold their paths against.
  if (!existsSync(join(repo, "apps", "docs", "package.json"))) return problems;
  const docsScripts = scripts(join(repo, "apps", "docs", "package.json"));
  const rootScripts = scripts(join(repo, "package.json"));
  const files = [
    join(root, "README.md"),
    ...skills.flatMap((s) => {
      const dir = join(root, s);
      const references = join(dir, "references");
      return [
        join(dir, "SKILL.md"),
        ...(existsSync(references) ? markdownFiles(references) : []),
      ];
    }),
  ].filter((f) => existsSync(f));
  for (const file of files) {
    const facts = namedFacts(readFileSync(file, "utf8"));
    const where = relative(root, file);
    for (const path of facts.paths)
      if (!pathExists(repo, path))
        problems.push(`${where}: names ${path}, which does not exist`);
    for (const name of facts.docsScripts)
      if (!docsScripts.has(name))
        problems.push(
          `${where}: names pnpm -C apps/docs ${name}, which apps/docs/package.json does not define`,
        );
    for (const name of facts.rootScripts)
      if (!rootScripts.has(name))
        problems.push(
          `${where}: names pnpm ${name}, which the root package.json does not define`,
        );
  }
  return problems;
}
