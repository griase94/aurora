import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clearPacks, contentProblems, exportedFiles } from "./pack.mjs";

const manifest = {
  exports: {
    ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
    "./package.json": "./package.json",
  },
};

describe("contentProblems", () => {
  it("accepts a tarball that ships every exported file from dist", () => {
    const files = [
      "package/package.json",
      "package/dist/index.js",
      "package/dist/index.d.ts",
    ];
    expect(contentProblems(files, manifest)).toEqual([]);
  });

  it("names an exported file the tarball lacks", () => {
    const files = ["package/package.json", "package/dist/index.js"];
    expect(contentProblems(files, manifest)).toEqual([
      "exports ./dist/index.d.ts, which is missing",
    ]);
  });

  it("refuses tests inside the tarball", () => {
    const files = [
      "package/package.json",
      "package/dist/index.js",
      "package/dist/index.d.ts",
      "package/dist/index.test.js",
    ];
    expect(contentProblems(files, manifest)).toEqual([
      "ships dist/index.test.js, which is not for consumers",
    ]);
  });

  it("catches exports that still point at the sources", () => {
    const repoManifest = { exports: { ".": { default: "./src/index.ts" } } };
    const problems = contentProblems(
      ["package/package.json", "package/src/index.ts"],
      repoManifest,
    );
    expect(problems).toEqual([
      "exports ./src/index.ts outside dist/: publishConfig.exports was not applied",
    ]);
  });

  it("matches wildcard exports against the files", () => {
    const wild = { exports: { "./*": "./dist/*.js" } };
    expect(contentProblems(["package/dist/a.js"], wild)).toEqual([]);
    expect(contentProblems(["package/dist/a.css"], wild)).toEqual([
      "exports ./dist/*.js, which matches no file",
    ]);
  });

  it("requires an exports map", () => {
    expect(contentProblems(["package/package.json"], {})).toEqual([
      "has no exports map",
    ]);
  });
});

describe("exportedFiles", () => {
  it("collects every target once", () => {
    expect(exportedFiles(manifest.exports)).toEqual([
      "./dist/index.d.ts",
      "./dist/index.js",
      "./package.json",
    ]);
  });
});

describe("clearPacks", () => {
  it("removes earlier tarballs and SHA256SUMS and keeps other files", () => {
    const dir = mkdtempSync(join(tmpdir(), "aurora-pack-out-"));
    // Built from parts, so the scope check does not read it as a real name.
    const old = ["old", "aurora", "canary", "0.0.0.tgz"].join("-");
    try {
      for (const f of [old, "SHA256SUMS", "notes.md"])
        writeFileSync(join(dir, f), "");
      expect(clearPacks(dir).sort()).toEqual(["SHA256SUMS", old]);
      expect(readdirSync(dir)).toEqual(["notes.md"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
