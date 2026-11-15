import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// `release.mjs plan` against a scratch git history, so the ancestry check
// runs on real commits: v0.0.1 at X, then A and B change packages/, v0.0.2
// at B, then C changes packages/ again.
const here = dirname(fileURLToPath(import.meta.url));
let repo = "";
const sha: Record<string, string> = {};

const git = (...args: string[]) =>
  execFileSync(
    "git",
    ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...args],
    { cwd: repo, encoding: "utf8" },
  ).trim();

const commit = (name: string) => {
  writeFileSync(join(repo, "packages/a/file.txt"), name);
  git("add", "-A");
  git("commit", "-q", "-m", name);
  sha[name] = git("rev-parse", "HEAD");
};

const planAt = (head: string, ...flags: string[]) =>
  execFileSync(
    "node",
    [
      "scripts/release.mjs",
      "plan",
      "--head",
      head,
      "--prs",
      "prs.json",
      ...flags,
    ],
    {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, GITHUB_ACTIONS: "" },
    },
  );

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "aurora-release-cli-"));
  mkdirSync(join(repo, "scripts/lib"), { recursive: true });
  mkdirSync(join(repo, "packages/a"), { recursive: true });
  copyFileSync(join(here, "release.mjs"), join(repo, "scripts/release.mjs"));
  copyFileSync(
    join(here, "lib/packages.mjs"),
    join(repo, "scripts/lib/packages.mjs"),
  );
  writeFileSync(join(repo, "prs.json"), "[]\n");
  git("init", "-q", "-b", "main");
  commit("X");
  git("tag", "v0.0.1");
  commit("A");
  commit("B");
  git("tag", "v0.0.2");
  commit("C");
});

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

describe("release.mjs plan on a real history", () => {
  it("releases nothing from an older commit at a level given by hand", () => {
    const out = planAt(sha["A"] ?? "", "--level", "patch");
    expect(out).toContain("release=false");
    expect(out).toContain("is not after v0.0.2");
  });

  it("is a no-op, not an error, when an older run is re-run after a newer release", () => {
    const out = planAt(sha["A"] ?? "");
    expect(out).toContain("release=false");
    expect(out).toContain("is not after v0.0.2");
  });

  it("releases the next version from a head after the latest release", () => {
    expect(planAt(sha["C"] ?? "", "--level", "patch")).toContain(
      "version=0.0.3",
    );
  });

  it("plans a release for a dry run and none for a dry run that assumes packages/ unchanged", () => {
    const level = ["--level", "patch"];
    expect(planAt(sha["C"] ?? "", "--dry-run", ...level)).toContain(
      "release=true",
    );
    const out = planAt(sha["C"] ?? "", "--assume-packages-unchanged", ...level);
    expect(out).toContain("release=false");
    expect(out).toContain("nothing under packages/ changed since v0.0.2");
  });
});
