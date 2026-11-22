#!/usr/bin/env node
/**
 * The ledger's pull-request rule (`pnpm ledger:diff`): compares `gaps/` with
 * the merge base and fails when a new row is not named in the pull request's
 * `## Ledger` section, or when a row that was already merged still has no
 * public issue.
 *
 * Input through the environment, never through the shell:
 *   BASE_REF   the branch or commit to compare with (default: origin/main)
 *   PR_BODY    the pull request's body
 */
import { execFileSync } from "node:child_process";
import { ledgerDiffProblems, readLedger, ROOT } from "./ledger.mjs";

/** @param {string[]} args @param {string} [cwd] */
const git = (args, cwd = ROOT) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const base = process.env.BASE_REF || "origin/main";
const mergeBase = git(["merge-base", "HEAD", base]);
// Paths from the repository's root, wherever the example lives.
const top = git(["rev-parse", "--show-toplevel"]);
const folder = `${git(["rev-parse", "--show-prefix"])}gaps/`;
const names = git(["ls-tree", "--name-only", mergeBase, folder], top)
  .split("\n")
  .filter((n) => n.endsWith(".json"));
const baseRows = names.map(
  (n) =>
    /** @type {import("./ledger.mjs").Gap} */ (
      JSON.parse(git(["show", `${mergeBase}:${n}`], top))
    ),
);

const problems = ledgerDiffProblems({
  baseRows,
  headRows: readLedger().map((f) => f.row),
  body: process.env.PR_BODY ?? "",
});
if (problems.length) {
  for (const p of problems) console.error(`ledger: ${p}`);
  process.exitCode = 1;
} else
  console.log(
    "ledger: every new row is named and every merged row has its issue",
  );
