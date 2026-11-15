// Checks the GitHub workflows and composite actions for one trap: a job that
// turns on a package-manager cache while its install step is conditional.
// Covered cache steps: `cache: <manager>` on actions/setup-node and a truthy
// `cache` on pnpm/action-setup. Both save the cache in their post step and
// fail the whole job when the package store does not exist, which is the case
// when the install was skipped. A push that plans no release ended red that
// way. The cache step and every install step of its package manager must
// therefore carry the same `if`, and at least one such install step must
// follow the cache. Not covered: actions/cache, which only warns when its
// path is missing.
// Used by scripts/workflows.test.ts; plain JavaScript so Node runs it without a loader.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

const SETUP_NODE = /^actions\/setup-node@/;
const SETUP_PNPM = /^pnpm\/action-setup@/;
// A package-manager install command; flags (and one value) may sit between the
// binary and the subcommand, as in `pnpm -C sub install`.
const INSTALL =
  /(?:^|[\s;&|(])(pnpm|npm|yarn|bun)(?:\s+-{1,2}[^\s]+(?:\s+[^\s-][^\s]*)?)*\s+(?:install|i|ci|add)(?=\s|$|[;&|)])/gm;

/** A step's `if` without the optional `${{ }}` wrapper, quote style or extra space. */
const condition = (/** @type {{ if?: unknown }} */ step) => {
  if (step.if === undefined || step.if === null) return "";
  const text = String(step.if).trim();
  const wrapped = /^\$\{\{([\s\S]*)\}\}$/.exec(text);
  return (wrapped ? (wrapped[1] ?? "") : text)
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * The package manager whose cache a step turns on, or null: the `cache` value
 * of setup-node, "pnpm" for pnpm/action-setup with a truthy `cache`, and ""
 * (any manager) when the value is an expression.
 * @param {Record<string, any>} step
 * @returns {{ action: string, cache: string, manager: string } | null}
 */
const cacheOf = (step) => {
  if (typeof step?.uses !== "string") return null;
  const raw = step.with?.cache;
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim();
  if (SETUP_NODE.test(step.uses)) {
    if (value === "") return null;
    return { action: "setup-node", cache: value, manager: manager(value) };
  }
  if (SETUP_PNPM.test(step.uses)) {
    if (["", "false", "0"].includes(value.toLowerCase())) return null;
    return { action: "pnpm/action-setup", cache: value, manager: "pnpm" };
  }
  return null;
};

const manager = (/** @type {string} */ value) =>
  /^(pnpm|npm|yarn|bun)$/.test(value) ? value : "";

/** The package managers a shell script installs with. */
const installManagers = (/** @type {string} */ run) =>
  [...run.matchAll(INSTALL)].map((m) => m[1]);

/**
 * Problems in the steps of one job (or composite action).
 * @param {string} where
 * @param {Array<Record<string, any>>} steps
 * @returns {string[]}
 */
export function checkSteps(where, steps) {
  /** @type {string[]} */
  const problems = [];
  steps.forEach((step, at) => {
    const found = cacheOf(step);
    if (!found) return;
    const label = `${found.action} enables cache "${found.cache}"`;
    const installs = steps
      .slice(at + 1)
      .filter(
        (s) =>
          typeof s?.run === "string" &&
          installManagers(s.run).some(
            (m) => !found.manager || m === found.manager,
          ),
      );
    if (!installs.length) {
      problems.push(
        `${where}: ${label} but no ${found.manager || "package-manager"} install step follows it, so the cache save fails`,
      );
      return;
    }
    const want = condition(step);
    for (const install of installs) {
      if (condition(install) !== want)
        problems.push(
          `${where}: ${label} with ${want ? `if "${want}"` : "no condition"}, but the install step "${install.name ?? install.run.split("\n")[0]}" has ${condition(install) ? `if "${condition(install)}"` : "no condition"}; when the install is skipped the cache save fails the job. Give the cache step the same condition as the install.`,
        );
    }
  });
  return problems;
}

/**
 * Problems in one workflow or action file's YAML text.
 * @param {string} file label used in messages
 * @param {string} text
 * @returns {string[]}
 */
export function checkWorkflowText(file, text) {
  const doc = parseYaml(text);
  /** @type {string[]} */
  const problems = [];
  for (const [name, job] of Object.entries(doc?.jobs ?? {})) {
    const steps = /** @type {any} */ (job)?.steps;
    if (Array.isArray(steps))
      problems.push(...checkSteps(`${file} job "${name}"`, steps));
  }
  const composite = doc?.runs?.steps;
  if (Array.isArray(composite))
    problems.push(...checkSteps(`${file} (composite action)`, composite));
  return problems;
}

/** The workflow files and every composite action (at any depth) under .github. */
export function workflowFiles(/** @type {string} */ repo) {
  const files = [];
  const workflows = join(repo, ".github", "workflows");
  if (existsSync(workflows))
    for (const f of readdirSync(workflows))
      if (/\.ya?ml$/.test(f)) files.push(join(workflows, f));
  const walk = (/** @type {string} */ dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/^action\.ya?ml$/.test(entry.name)) files.push(p);
    }
  };
  const actions = join(repo, ".github", "actions");
  if (existsSync(actions)) walk(actions);
  return files;
}

/** Problems across every workflow and composite action in the repository. */
export function checkWorkflows(/** @type {string} */ repo) {
  return workflowFiles(repo).flatMap((file) =>
    checkWorkflowText(file.slice(repo.length + 1), readFileSync(file, "utf8")),
  );
}
