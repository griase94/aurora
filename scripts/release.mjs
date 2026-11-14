#!/usr/bin/env node
/**
 * Aurora's release logic. The release workflow (.github/workflows/release.yml)
 * calls it on every push to main; everything that decides something is a pure
 * function below and unit-tested (scripts/release.test.ts) without network.
 *
 *   release.mjs next  --level <major|minor|patch> [--allow-1.0]
 *       the version after the latest v* tag
 *   release.mjs prs   --head <sha> --repo <owner/repo> --out prs.json
 *       the merged pull requests since the latest tag (GitHub API through gh)
 *   release.mjs plan  --head <sha> --prs prs.json [--allow-1.0]
 *       release=true|false, version, tag, prerelease, reason as key=value lines
 *   release.mjs apply --version <x.y.z> --repository <owner/repo>
 *       sets version, private:false and repository in every package (runner only)
 *   release.mjs notes --version <x.y.z> --prs prs.json --repository <owner/repo> --out notes.md
 *   release.mjs sums  --dir <dir>
 *       writes <dir>/SHA256SUMS for the tarballs in <dir>
 *
 * Version policy: lockstep (every package under packages/ gets the same
 * version). While the major version is 0, `minor` is the breaking level and
 * `major` is refused unless --allow-1.0 is given. Re-running for a commit that
 * already carries a v* tag is a no-op that exits 0.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO, listPackages, parseName, tarballName } from "./lib/packages.mjs";

/** @typedef {"major" | "minor" | "patch"} Level */
/** @typedef {{ number: number, title: string, body: string, labels: string[], url?: string }} PullRequest */
/** @typedef {{ name: string, sha: string }} Tag */

const LEVELS = /** @type {const} */ (["major", "minor", "patch"]);
const VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/;

/** @returns {[number, number, number] | null} */
export function parseVersion(/** @type {string} */ v) {
  const m = VERSION.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** The highest `vX.Y.Z` tag name (pre-release and other tags are ignored). */
export function latestTag(/** @type {string[]} */ names) {
  let best = /** @type {string | null} */ (null);
  let bestV = /** @type {[number, number, number] | null} */ (null);
  for (const name of names) {
    if (!name.startsWith("v")) continue;
    const v = parseVersion(name);
    if (!v) continue;
    if (!bestV || compare(v, bestV) > 0) {
      best = name;
      bestV = v;
    }
  }
  return best;
}

/** @param {[number, number, number]} a @param {[number, number, number]} b */
function compare(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * @param {string | null} current the latest version (`v` prefix optional), null before the first release
 * @param {string} level
 * @param {{ allow1?: boolean }} [opts]
 */
export function nextVersion(current, level, opts = {}) {
  if (!LEVELS.includes(/** @type {Level} */ (level)))
    throw new Error(`unknown level "${level}": use major, minor or patch`);
  /** @type {[number, number, number] | null} */
  const v = current ? parseVersion(current) : [0, 0, 0];
  if (!v) throw new Error(`not a version: ${current}`);
  const [major, minor, patch] = v;
  if (major === 0) {
    if (level === "major") {
      if (!opts.allow1)
        throw new Error(
          "while Aurora is 0.x, minor is the breaking level; major (1.0.0) needs --allow-1.0",
        );
      return "1.0.0";
    }
    return level === "minor" ? `0.${minor + 1}.0` : `0.${minor}.${patch + 1}`;
  }
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** The release labels a pull request carries (`aurora:major` → `major`, …, `skip`). */
export function releaseLabels(/** @type {string[]} */ labels) {
  return labels
    .filter((l) => l.startsWith("aurora:"))
    .map((l) => l.slice("aurora:".length));
}

/**
 * The highest release level among the pull requests; `skip` when none asks
 * for a release.
 * @param {PullRequest[]} prs
 * @returns {Level | "skip"}
 */
export function highestLevel(prs) {
  for (const level of LEVELS)
    if (prs.some((pr) => releaseLabels(pr.labels).includes(level)))
      return level;
  return "skip";
}

/**
 * Whether to release, and as which version.
 * @param {{ tags: Tag[], head: string, prs: PullRequest[], packagesChanged: boolean, allow1?: boolean }} input
 * @returns {{ release: false, reason: string } | { release: true, version: string, tag: string, level: Level, prerelease: boolean }}
 */
export function plan({ tags, head, prs, packagesChanged, allow1 = false }) {
  const atHead = tags.find((t) => t.sha === head && parseVersion(t.name));
  if (atHead)
    return {
      release: false,
      reason: `${head} is already released as ${atHead.name}`,
    };
  const last = latestTag(tags.map((t) => t.name));
  if (!packagesChanged)
    return {
      release: false,
      reason: `nothing under packages/ changed since ${last}`,
    };
  const level = highestLevel(prs);
  if (level === "skip")
    return {
      release: false,
      reason: prs.length
        ? `no pull request since ${last ?? "the start"} asks for a release (aurora:skip or no label)`
        : "no merged pull request found for the commits since the last release",
    };
  const version = nextVersion(last, level, { allow1 });
  return {
    release: true,
    version,
    tag: `v${version}`,
    level,
    prerelease: version.startsWith("0.0."),
  };
}

/**
 * The text of a `## <heading>` section of a Markdown body, HTML comments
 * (template hints) removed; "" when the section is missing or empty.
 */
export function section(
  /** @type {string} */ body,
  /** @type {string} */ heading,
) {
  const lines = (body ?? "").replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/);
  const start = lines.findIndex((l) =>
    new RegExp(`^##\\s+${heading}\\s*$`, "i").test(l.trim()),
  );
  if (start < 0) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,2}\s/.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

/** The "Visible in apps: fix | improvement | none" answer, or null. */
export function visibleInApps(/** @type {string} */ body) {
  const m = /^[\s>*_-]*Visible in apps:?[\s*_]*(fix|improvement|none)\b/im.exec(
    (body ?? "").replace(/<!--[\s\S]*?-->/g, ""),
  );
  return m ? /** @type {string} */ (m[1]).toLowerCase() : null;
}

/**
 * The GitHub release notes.
 * @param {{ version: string, prs: PullRequest[], repository: string, packages: string[] }} input
 *   packages: the package names (`@<scope>/aurora-<name>`)
 */
export function releaseNotes({ version, prs, repository, packages }) {
  const out = [];
  if (version.startsWith("0.0."))
    out.push(
      "> **Pipeline proof.** `0.0.x` releases exercise Aurora's CI and release workflow. They ship no kit code; do not depend on them.",
      "",
    );
  out.push("## Changes", "");
  const shown = prs.filter((pr) => highestLevel([pr]) !== "skip");
  if (!shown.length) out.push("No pull request with a release label.", "");
  for (const pr of shown) {
    out.push(`### ${pr.title.trim()} (#${pr.number})`, "");
    // The "Visible in apps" line sits in the template's Changelog section;
    // it is printed once, below.
    const changelog = section(pr.body, "Changelog")
      .split("\n")
      .filter((l) => !/^[\s>*_-]*Visible in apps\b/i.test(l))
      .join("\n")
      .trim();
    out.push(changelog || "No changelog entry.", "");
    out.push(`Visible in apps: ${visibleInApps(pr.body) ?? "not stated"}`, "");
  }
  const base = `https://github.com/${repository}/releases/download/v${version}`;
  const deps = /** @type {Record<string, string>} */ ({});
  const overrides = /** @type {Record<string, string>} */ ({});
  for (const name of packages) {
    const parsed = parseName(name);
    if (!parsed) continue;
    const url = `${base}/${tarballName(name, version)}`;
    deps[`@aurora/${parsed.name}`] = url;
    overrides[name] = url;
  }
  out.push(
    "## Install",
    "",
    "Pin the release assets (or run `scripts/consumer/aurora-pin.mjs " +
      version +
      "`, see `docs/CONSUMING.md`):",
    "",
    "```json",
    JSON.stringify({ dependencies: deps, pnpm: { overrides } }, null, 2),
    "```",
    "",
    "Check the downloads against `SHA256SUMS`; each tarball carries a build provenance attestation (`gh attestation verify <file> --repo " +
      repository +
      "`).",
  );
  return out.join("\n") + "\n";
}

/**
 * `SHA256SUMS` in the format `sha256sum -c` reads, sorted by file name.
 * @param {{ name: string, data: Buffer | string }[]} files
 */
export function sha256sums(files) {
  return (
    [...files]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map(
        (f) =>
          `${createHash("sha256").update(f.data).digest("hex")}  ${f.name}`,
      )
      .join("\n") + "\n"
  );
}

/**
 * A package manifest as it is released: the version, public, and the
 * repository it was built from (npm provenance checks it).
 * @param {Record<string, any>} manifest
 * @param {{ version: string, repository: string, directory: string }} opts
 * @returns {Record<string, any>}
 */
export function releasedManifest(manifest, { version, repository, directory }) {
  if (!parseVersion(version)) throw new Error(`not a version: ${version}`);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
    throw new Error(`not an owner/repo: ${repository}`);
  const { private: _private, ...rest } = manifest;
  return {
    ...rest,
    version,
    repository: {
      type: "git",
      url: `git+https://github.com/${repository}.git`,
      directory,
    },
  };
}

// ---------------------------------------------------------------- CLI

/** @param {string[]} args @param {string} name */
function flag(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--"))
    throw new Error(`${name} needs a value`);
  return v;
}

/** @param {string[]} args @param {string} name */
function required(args, name) {
  const v = flag(args, name);
  if (v === undefined) throw new Error(`missing ${name}`);
  return v;
}

/** @param {string[]} args */
function git(...args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
}

/** Every v* tag with the commit it points at (annotated tags dereferenced). */
function readTags() {
  const out = git(
    "tag",
    "--list",
    "v*",
    "--format=%(refname:short) %(objectname) %(*objectname)",
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name = "", sha = "", deref = ""] = line.split(" ");
      return { name, sha: deref || sha };
    });
}

/** @param {string | null} last */
function packagesChangedSince(last) {
  if (!last) return true;
  try {
    git("diff", "--quiet", last, "HEAD", "--", "packages/");
    return false;
  } catch {
    return true;
  }
}

/** @param {string} file @returns {PullRequest[]} */
function readPrs(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

/** @param {string[]} args */
function cmdPrs(args) {
  const head = required(args, "--head");
  const repo = required(args, "--repo");
  const out = required(args, "--out");
  const last = latestTag(readTags().map((t) => t.name));
  const range = last ? [`${last}..${head}`] : [head];
  const commits = git("rev-list", "--first-parent", "--max-count=50", ...range)
    .split("\n")
    .filter(Boolean);
  /** @type {Map<number, PullRequest>} */
  const prs = new Map();
  for (const sha of commits) {
    const json = execFileSync(
      "gh",
      [
        "api",
        `repos/${repo}/commits/${sha}/pulls`,
        "--jq",
        "[.[] | select(.merged_at != null)]",
      ],
      { encoding: "utf8" },
    );
    for (const pr of JSON.parse(json || "[]"))
      prs.set(pr.number, {
        number: pr.number,
        title: String(pr.title ?? ""),
        body: String(pr.body ?? ""),
        labels: (pr.labels ?? []).map(
          (/** @type {{ name: string }} */ l) => l.name,
        ),
        url: pr.html_url,
      });
  }
  writeFileSync(out, JSON.stringify([...prs.values()], null, 2) + "\n");
  console.log(
    `release: ${prs.size} merged pull request(s) in ${commits.length} commit(s) since ${last ?? "the start"}`,
  );
}

/** @param {string[]} args */
function cmdPlan(args) {
  const head = required(args, "--head");
  const tags = readTags();
  const last = latestTag(tags.map((t) => t.name));
  const result = plan({
    tags,
    head,
    prs: readPrs(required(args, "--prs")),
    packagesChanged: packagesChangedSince(last),
    allow1: args.includes("--allow-1.0"),
  });
  const lines = result.release
    ? [
        "release=true",
        `version=${result.version}`,
        `tag=${result.tag}`,
        `level=${result.level}`,
        `prerelease=${result.prerelease}`,
      ]
    : ["release=false", `reason=${result.reason.replace(/\n/g, " ")}`];
  console.log(lines.join("\n"));
}

/** @param {string[]} args */
function cmdApply(args) {
  const version = required(args, "--version");
  const repository = required(args, "--repository");
  for (const pkg of listPackages()) {
    const next = releasedManifest(pkg.manifest, {
      version,
      repository,
      directory: pkg.dir,
    });
    writeFileSync(pkg.path, JSON.stringify(next, null, 2) + "\n");
    console.log(`release: ${next["name"]} → ${version}`);
  }
}

/** @param {string[]} args */
function cmdNotes(args) {
  const notes = releaseNotes({
    version: required(args, "--version"),
    prs: readPrs(required(args, "--prs")),
    repository: required(args, "--repository"),
    packages: listPackages().map((p) => String(p.manifest["name"])),
  });
  writeFileSync(required(args, "--out"), notes);
}

/** @param {string[]} args */
function cmdSums(args) {
  const dir = resolve(required(args, "--dir"));
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".tgz"))
    .map((name) => ({ name, data: readFileSync(join(dir, name)) }));
  if (!files.length) throw new Error(`no tarballs in ${dir}`);
  writeFileSync(join(dir, "SHA256SUMS"), sha256sums(files));
  console.log(`release: SHA256SUMS for ${files.length} tarball(s)`);
}

/** @param {string[]} args */
function cmdNext(args) {
  const last = latestTag(readTags().map((t) => t.name));
  console.log(
    nextVersion(last, required(args, "--level"), {
      allow1: args.includes("--allow-1.0"),
    }),
  );
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  /** @type {Record<string, (args: string[]) => void>} */
  const commands = {
    next: cmdNext,
    prs: cmdPrs,
    plan: cmdPlan,
    apply: cmdApply,
    notes: cmdNotes,
    sums: cmdSums,
  };
  const fn = cmd ? commands[cmd] : undefined;
  if (!fn) {
    console.error(
      `usage: release.mjs <${Object.keys(commands).join("|")}> [options]`,
    );
    process.exit(2);
  }
  try {
    fn(args);
  } catch (e) {
    console.error(`release: ${/** @type {Error} */ (e).message}`);
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
