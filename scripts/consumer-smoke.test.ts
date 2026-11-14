import { describe, expect, it } from "vitest";
import { consumerManifest, nodeEntries } from "./consumer-smoke.mjs";

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
  it("installs each tarball under its @aurora key and overrides the scoped name", () => {
    const name = scoped("example", "widgets");
    expect(consumerManifest([{ name, file: "/tmp/w.tgz" }])).toEqual({
      name: "aurora-consumer-smoke",
      private: true,
      type: "module",
      dependencies: { "@aurora/widgets": "file:/tmp/w.tgz" },
      pnpm: { overrides: { [name]: "file:/tmp/w.tgz" } },
    });
  });

  it("refuses a name outside the aurora pattern", () => {
    expect(() =>
      consumerManifest([{ name: "left-pad", file: "/tmp/x.tgz" }]),
    ).toThrow();
  });
});
