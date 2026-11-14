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
    `file:/tmp/packed/${["example", "aurora", name, "0.1.0.tgz"].join("-")}`;

  it("lists only the top-level package and overrides every sibling", () => {
    const widgets = {
      name: scoped("example", "widgets"),
      version: "0.1.0",
      dependencies: { [scoped("example", "core")]: "0.1.0" },
    };
    const core = { name: scoped("example", "core"), version: "0.1.0" };
    expect(consumerManifest("/tmp/packed", [widgets, core])).toEqual({
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
      consumerManifest("/tmp/packed", [
        { name: scoped("example", "widgets"), version: "0.1.0" },
      ]).dependencies,
    ).toEqual({ "@aurora/widgets": tgz("widgets") });
  });

  it("refuses a name outside the aurora pattern or mixed versions", () => {
    expect(() =>
      consumerManifest("/tmp", [{ name: "left-pad", version: "1.0.0" }]),
    ).toThrow();
    expect(() =>
      consumerManifest("/tmp", [
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
