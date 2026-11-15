/**
 * Workflow guard: no job enables a package-manager cache (setup-node or
 * pnpm/action-setup) while its install step can be skipped. The failure it prevents: a push to main
 * that plans no release skipped the install, the pnpm store never existed, and
 * setup-node's post step failed the run.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO } from "./lib/packages.mjs";
import {
  checkWorkflowText,
  checkWorkflows,
  workflowFiles,
} from "./lib/workflows.mjs";

const SETUP =
  "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0";

const PNPM =
  "pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115 # v6.1.1";

const job = (steps: string) => `
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
${steps}
`;

describe("the repository's workflows", () => {
  it("are found", () => {
    expect(workflowFiles(REPO).length).toBeGreaterThan(0);
  });

  it("never cache a package manager behind a skippable install", () => {
    expect(checkWorkflows(REPO)).toEqual([]);
  });
});

describe("finding files", () => {
  it("includes composite actions at any depth", () => {
    const dir = mkdtempSync(join(tmpdir(), "wf-"));
    try {
      mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
      mkdirSync(join(dir, ".github", "actions", "group", "name"), {
        recursive: true,
      });
      writeFileSync(join(dir, ".github", "workflows", "a.yml"), "jobs: {}\n");
      writeFileSync(
        join(dir, ".github", "actions", "group", "name", "action.yml"),
        "runs: {}\n",
      );
      expect(workflowFiles(dir).map((f) => f.slice(dir.length + 1))).toEqual([
        join(".github", "workflows", "a.yml"),
        join(".github", "actions", "group", "name", "action.yml"),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the cache guard", () => {
  it("passes an unconditional cache and an unconditional install", () => {
    const text = job(`      - uses: ${SETUP}
        with:
          cache: pnpm
      - run: pnpm install --frozen-lockfile`);
    expect(checkWorkflowText("w.yml", text)).toEqual([]);
  });

  it("passes a cache and an install behind the same condition", () => {
    const text = job(`      - id: plan
        run: echo release=true
      - if: steps.plan.outputs.release == 'true'
        uses: ${SETUP}
        with:
          cache: pnpm
      - if: \${{ steps.plan.outputs.release == 'true' }}
        run: pnpm install --frozen-lockfile`);
    expect(checkWorkflowText("w.yml", text)).toEqual([]);
  });

  it("passes setup-node without a cache next to a conditional install", () => {
    const text = job(`      - uses: ${SETUP}
      - if: steps.plan.outputs.release == 'true'
        run: pnpm install`);
    expect(checkWorkflowText("w.yml", text)).toEqual([]);
  });

  it("fails an unconditional cache with a conditional install (the bug)", () => {
    const text = job(`      - uses: ${SETUP}
        with:
          cache: pnpm
      - name: Install
        if: steps.plan.outputs.release == 'true'
        run: pnpm install --frozen-lockfile`);
    const problems = checkWorkflowText("w.yml", text);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('job "build"');
    expect(problems[0]).toContain("Install");
  });

  it("fails a conditional cache with an unconditional install", () => {
    const text = job(`      - if: github.event_name == 'push'
        uses: ${SETUP}
        with:
          cache: pnpm
      - run: pnpm install`);
    expect(checkWorkflowText("w.yml", text)).toHaveLength(1);
  });

  it("fails a cache with no install after it", () => {
    const text = job(`      - uses: ${SETUP}
        with:
          cache: npm
      - run: node scripts/release.mjs plan`);
    expect(checkWorkflowText("w.yml", text)[0]).toContain(
      "no npm install step",
    );
  });

  it("fails a pnpm/action-setup cache behind a conditional install", () => {
    const text = job(`      - uses: ${PNPM}
        with:
          cache: true
      - if: steps.plan.outputs.release == 'true'
        run: pnpm install`);
    const problems = checkWorkflowText("w.yml", text);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("pnpm/action-setup");
  });

  it("passes pnpm/action-setup with the cache off or unset", () => {
    for (const withBlock of ["", "        with:\n          cache: false\n"]) {
      const text = job(`      - uses: ${PNPM}
${withBlock}      - if: steps.plan.outputs.release == 'true'
        run: pnpm install`);
      expect(checkWorkflowText("w.yml", text)).toEqual([]);
    }
  });

  it("treats the same condition in another quote style as equal", () => {
    const text = job(`      - if: x == 'true'
        uses: ${SETUP}
        with:
          cache: pnpm
      - if: \${{ x == "true" }}
        run: pnpm install`);
    expect(checkWorkflowText("w.yml", text)).toEqual([]);
  });

  it("sees an install with flags before the subcommand", () => {
    const text = job(`      - uses: ${SETUP}
        with:
          cache: pnpm
      - run: pnpm -C sub install
      - run: pnpm --filter x install --frozen-lockfile`);
    expect(checkWorkflowText("w.yml", text)).toEqual([]);
  });

  it("does not take another package manager's install for the cached one", () => {
    const text = job(`      - uses: ${SETUP}
        with:
          cache: pnpm
      - run: npm install -g foo`);
    expect(checkWorkflowText("w.yml", text)[0]).toContain(
      "no pnpm install step",
    );
  });

  it("checks composite actions too", () => {
    const text = `
runs:
  using: composite
  steps:
    - uses: ${SETUP}
      with:
        cache: pnpm
    - if: inputs.install == 'true'
      shell: bash
      run: pnpm install
`;
    expect(checkWorkflowText("a/action.yml", text)).toHaveLength(1);
  });
});
