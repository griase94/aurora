// Checks the GitHub workflows and composite actions for one trap: a job that
// turns on a package-manager cache (`cache: pnpm` on actions/setup-node) while
// its install step is conditional. setup-node saves the cache in its post step
// and fails the whole job when the package store does not exist, which it does
// not when the install was skipped. A push that plans no release ended red
// that way. The cache step and every install step of a job must therefore
// carry the same `if`, and at least one install step must follow the cache.
// Used by scripts/workflows.test.ts; plain JavaScript so Node runs it without a loader.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

const SETUP_NODE = /^actions\/setup-node@/;
const INSTALL =
  /(?:^|[\s;&|(])(?:pnpm|npm|yarn|bun)\s+(?:install|i|ci|add)(?:\s|$)/m;

/** A step's `if` without the optional `${{ }}` wrapper or surrounding space. */
const condition = (/** @type {{ if?: unknown }} */ step) => {
  if (step.if === undefined || step.if === null) return "";
  const text = String(step.if).trim();
  const wrapped = /^\$\{\{([\s\S]*)\}\}$/.exec(text);
  return (wrapped ? (wrapped[1] ?? "") : text).replace(/\s+/g, " ").trim();
};

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
    if (typeof step?.uses !== "string" || !SETUP_NODE.test(step.uses)) return;
    const cache = step.with?.cache;
    if (cache === undefined || cache === null || String(cache).trim() === "")
      return;
    const later = steps.slice(at + 1);
    const installs = later.filter(
      (s) => typeof s?.run === "string" && INSTALL.test(s.run),
    );
    if (!installs.length) {
      problems.push(
        `${where}: setup-node enables cache "${cache}" but no install step follows it, so the cache save fails`,
      );
      return;
    }
    const want = condition(step);
    for (const install of installs) {
      if (condition(install) !== want)
        problems.push(
          `${where}: setup-node enables cache "${cache}" with ${want ? `if "${want}"` : "no condition"}, but the install step "${install.name ?? install.run.split("\n")[0]}" has ${condition(install) ? `if "${condition(install)}"` : "no condition"}; when the install is skipped the cache save fails the job. Give the cache step the same condition as the install.`,
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

/** The workflow and composite-action files under .github. */
export function workflowFiles(/** @type {string} */ repo) {
  const files = [];
  const workflows = join(repo, ".github", "workflows");
  if (existsSync(workflows))
    for (const f of readdirSync(workflows))
      if (/\.ya?ml$/.test(f)) files.push(join(workflows, f));
  const actions = join(repo, ".github", "actions");
  if (existsSync(actions))
    for (const d of readdirSync(actions))
      for (const f of ["action.yml", "action.yaml"]) {
        const p = join(actions, d, f);
        if (existsSync(p)) files.push(p);
      }
  return files;
}

/** Problems across every workflow and composite action in the repository. */
export function checkWorkflows(/** @type {string} */ repo) {
  return workflowFiles(repo).flatMap((file) =>
    checkWorkflowText(file.slice(repo.length + 1), readFileSync(file, "utf8")),
  );
}
