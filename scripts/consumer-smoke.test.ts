import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { consumerManifest, nodeEntries, topLevel } from "./consumer-smoke.mjs";

// Built from parts, so the scope check does not read these fixtures as real names.
const scoped = (scope: string, name: string) => `@${scope}/aurora-${name}`;

describe("nodeEntries", () => {
  it("keeps JavaScript entries and drops package.json, wildcards and stylesheets", () => {
    expect(
      nodeEntries({
        ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
        "./css": "./dist/aurora.css",
        "./*": "./dist/*.js",
        "./package.json": "./package.json",
      }),
    ).toEqual(["."]);
  });

  it("drops entries that need the Svelte condition", () => {
    expect(
      nodeEntries({
        "./button": {
          svelte: "./dist/b/index.js",
          default: "./dist/b/index.js",
        },
      }),
    ).toEqual([]);
  });
});

describe("consumerManifest", () => {
  const tgz = (name: string) =>
    `file:./${["example", "aurora", name, "0.1.0.tgz"].join("-")}`;

  it("lists only the top-level package and overrides every sibling", () => {
    const widgets = {
      name: scoped("example", "widgets"),
      version: "0.1.0",
      dependencies: { [scoped("example", "core")]: "0.1.0" },
    };
    const core = { name: scoped("example", "core"), version: "0.1.0" };
    expect(consumerManifest([widgets, core])).toEqual({
      name: "aurora-consumer-smoke",
      private: true,
      type: "module",
      dependencies: { "@aurora/widgets": tgz("widgets") },
      pnpm: {
        overrides: {
          [scoped("example", "core")]: tgz("core"),
          [scoped("example", "widgets")]: tgz("widgets"),
        },
      },
    });
  });

  it("installs a lone package under its @aurora key", () => {
    expect(
      consumerManifest([
        { name: scoped("example", "widgets"), version: "0.1.0" },
      ]).dependencies,
    ).toEqual({ "@aurora/widgets": tgz("widgets") });
  });

  it("refuses a name outside the aurora pattern or mixed versions", () => {
    expect(() =>
      consumerManifest([{ name: "left-pad", version: "1.0.0" }]),
    ).toThrow();
    expect(() =>
      consumerManifest([
        { name: scoped("example", "a"), version: "0.1.0" },
        { name: scoped("example", "b"), version: "0.2.0" },
      ]),
    ).toThrow(/disagree/);
  });
});

describe("topLevel", () => {
  it("falls back to every package when all depend on each other", () => {
    const a = {
      name: scoped("x", "a"),
      version: "1.0.0",
      peerDependencies: { [scoped("x", "b")]: "1.0.0" },
    };
    const b = {
      name: scoped("x", "b"),
      version: "1.0.0",
      dependencies: { [scoped("x", "a")]: "1.0.0" },
    };
    expect(topLevel([a, b])).toEqual([a, b]);
  });
});

describe("consumer-smoke on two packages", () => {
  // widgets imports core under its scoped name: the install works only when
  // the override sends that name to the core tarball, not to the npm registry.
  it("installs a package and its sibling from tarballs and imports them", () => {
    const work = mkdtempSync(join(tmpdir(), "aurora-smoke-fixture-"));
    try {
      const pack = (name: string, manifest: object, code: string) => {
        const root = join(work, "src", name, "package");
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
        writeFileSync(join(root, "index.js"), code);
        execFileSync("tar", [
          "-czf",
          join(work, `${["example", "aurora", name, "0.1.0.tgz"].join("-")}`),
          "-C",
          join(work, "src", name),
          "package",
        ]);
      };
      const base = { version: "0.1.0", type: "module", exports: "./index.js" };
      pack(
        "core",
        { ...base, name: scoped("example", "core") },
        'export const core = "core";\n',
      );
      pack(
        "widgets",
        {
          ...base,
          name: scoped("example", "widgets"),
          dependencies: { [scoped("example", "core")]: "0.1.0" },
        },
        `export { core } from "${scoped("example", "core")}";\nexport const widgets = 1;\n`,
      );
      rmSync(join(work, "src"), { recursive: true });
      const script = join(
        dirname(fileURLToPath(import.meta.url)),
        "consumer-smoke.mjs",
      );
      const out = execFileSync("node", [script, work], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect(out).toContain("@aurora/widgets: core, widgets");
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }, 60_000);
});
