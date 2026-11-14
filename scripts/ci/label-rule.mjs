#!/usr/bin/env node
/**
 * The label rule of a pull request (CI job `static`):
 *  - exactly one of aurora:major, aurora:minor, aurora:patch, aurora:skip;
 *  - aurora:skip only when no file under packages/ changed (a package change
 *    always releases);
 *  - aurora:major only after 1.0, or once the repo variable AURORA_ALLOW_1_0
 *    is "true" (while 0.x, minor is the breaking level).
 *
 * Input through the environment, never through the shell:
 *   LABELS            JSON array of the pull request's label names
 *   PACKAGES_CHANGED  "true" when the diff touches packages/**
 *   ALLOW_1_0         "true" to allow aurora:major before 1.0
 * The latest version comes from the repo's v* tags (checkout with history).
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE = ["aurora:major", "aurora:minor", "aurora:patch", "aurora:skip"];

/**
 * @param {{ labels: string[], packagesChanged: boolean, latest: string | null, allow1?: boolean }} input
 *   latest: the latest release tag, null before the first one
 * @returns {string[]} the problems; empty when the rule holds
 */
export function labelProblems({
  labels,
  packagesChanged,
  latest,
  allow1 = false,
}) {
  const release = labels.filter((l) => RELEASE.includes(l));
  if (release.length !== 1)
    return [
      release.length
        ? `found ${release.join(", ")}: keep exactly one release label`
        : `add exactly one release label: ${RELEASE.join(", ")}`,
    ];
  const [label] = release;
  if (label === "aurora:skip" && packagesChanged)
    return [
      "aurora:skip, but files under packages/ changed: a package change releases (use aurora:patch or higher)",
    ];
  const major = latest ? Number(/^v?(\d+)\./.exec(latest)?.[1] ?? 0) : 0;
  if (label === "aurora:major" && major === 0 && !allow1)
    return [
      "aurora:major while Aurora is 0.x: use aurora:minor for a breaking change (1.0.0 is the owner's call)",
    ];
  return [];
}

/** The highest v<major>.<minor>.<patch> tag, or null. */
function latestTag() {
  const tags = execFileSync(
    "git",
    ["tag", "--list", "v*", "--sort=-v:refname"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  return tags[0] ?? null;
}

function main() {
  /** @type {unknown} */
  let labels;
  try {
    labels = JSON.parse(process.env["LABELS"] ?? "[]");
  } catch {
    labels = null;
  }
  if (!Array.isArray(labels) || !labels.every((l) => typeof l === "string")) {
    console.error("label-rule: LABELS is not a JSON array of strings");
    process.exit(2);
  }
  const problems = labelProblems({
    labels,
    packagesChanged: process.env["PACKAGES_CHANGED"] === "true",
    latest: latestTag(),
    allow1: process.env["ALLOW_1_0"] === "true",
  });
  for (const p of problems) console.error(`::error title=Label rule::${p}`);
  if (problems.length) process.exit(1);
  console.log(
    `label-rule: ${labels.filter((l) => RELEASE.includes(l))[0]} fits this change`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
