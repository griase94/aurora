import { describe, expect, it } from "vitest";
import {
  assetPins,
  checkAssets,
  currentSource,
  parseCli,
  parseSums,
  pin,
  releasePackages,
  sha256,
} from "./aurora-pin.mjs";

// Built from parts, so the scope check does not read these fixtures as real names.
const scoped = (scope: string, name: string) => `@${scope}/aurora-${name}`;
const url = (owner: string, scope: string, name: string, v: string) =>
  `https://github.com/${owner}/aurora/releases/download/v${v}/${[scope, "aurora", name, v].join("-")}.tgz`;

const pinned = {
  name: "some-app",
  dependencies: {
    "@aurora/svelte": url("someone", "acme", "svelte", "0.1.0"),
    "@aurora/tokens": url("someone", "acme", "tokens", "0.1.0"),
    "left-pad": "1.3.0",
  },
  pnpm: {
    overrides: {
      [scoped("acme", "tokens")]: url("someone", "acme", "tokens", "0.1.0"),
      "some-dep": "2.0.0",
    },
    onlyBuiltDependencies: ["esbuild"],
  },
};

describe("currentSource", () => {
  it("reads owner, repo and scope from asset pins", () => {
    expect(currentSource(pinned)).toEqual({
      owner: "someone",
      repo: "aurora",
      scope: "acme",
    });
  });

  it("reads the scope from npm pins", () => {
    expect(
      currentSource({
        dependencies: {
          "@aurora/svelte": `npm:${scoped("acme", "svelte")}@0.4.0`,
        },
      }),
    ).toEqual({
      scope: "acme",
    });
  });
});

const both = ["svelte", "tokens"];

describe("pin to release assets", () => {
  const next = pin(pinned, { version: "0.2.0", packages: both });

  it("moves every @aurora dependency to the new version's asset", () => {
    expect(next.dependencies).toEqual({
      "@aurora/svelte": url("someone", "acme", "svelte", "0.2.0"),
      "@aurora/tokens": url("someone", "acme", "tokens", "0.2.0"),
      "left-pad": "1.3.0",
    });
  });

  it("overrides every scoped name to the same asset and keeps unrelated overrides", () => {
    expect(next.pnpm).toEqual({
      overrides: {
        "some-dep": "2.0.0",
        [scoped("acme", "svelte")]: url("someone", "acme", "svelte", "0.2.0"),
        [scoped("acme", "tokens")]: url("someone", "acme", "tokens", "0.2.0"),
      },
      onlyBuiltDependencies: ["esbuild"],
    });
  });

  it("leaves the input untouched", () => {
    expect(pinned.dependencies["@aurora/svelte"]).toBe(
      url("someone", "acme", "svelte", "0.1.0"),
    );
  });

  it("follows an account rename with --owner and a scope move with --scope", () => {
    const moved = pin(pinned, {
      version: "0.2.0",
      owner: "renamed",
      scope: "fresh",
      packages: both,
    });
    expect(moved.dependencies["@aurora/svelte"]).toBe(
      url("renamed", "fresh", "svelte", "0.2.0"),
    );
    expect(Object.keys(moved.pnpm.overrides).sort()).toEqual(
      [scoped("fresh", "svelte"), scoped("fresh", "tokens"), "some-dep"].sort(),
    );
  });

  it("adds a package with --add", () => {
    const fresh = pin(
      { name: "x" },
      {
        version: "0.0.1",
        owner: "someone",
        scope: "acme",
        add: ["canary"],
        packages: ["canary"],
      },
    );
    expect(fresh.dependencies).toEqual({
      "@aurora/canary": url("someone", "acme", "canary", "0.0.1"),
    });
    expect(fresh.pnpm.overrides).toEqual({
      [scoped("acme", "canary")]: url("someone", "acme", "canary", "0.0.1"),
    });
  });

  it("overrides every package of the release when the app lists only one", () => {
    const one = pin(
      {},
      {
        version: "0.1.0",
        owner: "o",
        scope: "s",
        add: ["svelte"],
        packages: ["svelte", "tokens"],
      },
    );
    expect(Object.keys(one.dependencies)).toEqual(["@aurora/svelte"]);
    expect(one.pnpm.overrides).toEqual({
      [scoped("s", "svelte")]: url("o", "s", "svelte", "0.1.0"),
      [scoped("s", "tokens")]: url("o", "s", "tokens", "0.1.0"),
    });
  });

  it("drops overrides of packages the new release no longer has", () => {
    const fewer = pin(pinned, {
      version: "0.3.0",
      packages: ["svelte", "tokens"],
    });
    const after = pin(
      {
        ...fewer,
        dependencies: {
          "@aurora/svelte": fewer.dependencies["@aurora/svelte"],
        },
      },
      { version: "0.4.0", packages: ["svelte"] },
    );
    expect(Object.keys(after.pnpm.overrides).sort()).toEqual(
      [scoped("acme", "svelte"), "some-dep"].sort(),
    );
  });

  it("refuses a package the release does not have", () => {
    expect(() =>
      pin(pinned, { version: "0.2.0", packages: ["svelte"] }),
    ).toThrow(/no package tokens/);
  });

  it("refuses to pin assets without the release's package list", () => {
    expect(() => pin(pinned, { version: "0.2.0" })).toThrow(/packages/);
  });

  it("records the release's checksums and replaces the previous ones", () => {
    const sums = { "a.tgz": "1".repeat(64) };
    const withSums = pin(
      {
        ...pinned,
        aurora: { sha256: { "old.tgz": "0".repeat(64) }, other: 1 },
      },
      { version: "0.2.0", packages: both, sha256: sums },
    );
    expect(withSums.aurora).toEqual({ sha256: sums, other: 1 });
  });

  it("writes the tarballs of another base (the consumer smoke)", () => {
    const local = pin(
      {},
      {
        version: "0.0.1",
        scope: "s",
        add: ["canary"],
        packages: ["canary"],
        base: "file:/tmp/packed",
      },
    );
    expect(local.dependencies["@aurora/canary"]).toBe(
      `file:/tmp/packed/${["s", "aurora", "canary", "0.0.1.tgz"].join("-")}`,
    );
  });
});

describe("pin to npm", () => {
  const next = pin(pinned, { version: "0.4.0", registry: "npm" });

  it("uses npm aliases under the same keys", () => {
    expect(next.dependencies["@aurora/svelte"]).toBe(
      `npm:${scoped("acme", "svelte")}@0.4.0`,
    );
    expect(next.dependencies["@aurora/tokens"]).toBe(
      `npm:${scoped("acme", "tokens")}@0.4.0`,
    );
  });

  it("drops the Aurora overrides and keeps the rest", () => {
    expect(next.pnpm).toEqual({
      overrides: { "some-dep": "2.0.0" },
      onlyBuiltDependencies: ["esbuild"],
    });
  });

  it("drops the recorded checksums", () => {
    const npm = pin(
      { ...pinned, aurora: { sha256: { "a.tgz": "1".repeat(64) } } },
      { version: "0.4.0", registry: "npm" },
    );
    expect(npm.aurora).toBeUndefined();
  });

  it("removes an empty pnpm block", () => {
    const only = pin(
      {
        dependencies: { "@aurora/svelte": "x" },
        pnpm: { overrides: { [scoped("acme", "svelte")]: "x" } },
      },
      { version: "0.4.0", registry: "npm", scope: "acme" },
    );
    expect(only.pnpm).toBeUndefined();
  });
});

describe("refusals", () => {
  it("refuses a malformed version", () => {
    expect(() => pin(pinned, { version: "latest" })).toThrow(/not a version/);
  });

  it("asks for the owner and scope when the pins do not say", () => {
    expect(() =>
      pin({ dependencies: { "@aurora/svelte": "x" } }, { version: "0.1.0" }),
    ).toThrow(/--scope/);
    expect(() =>
      pin(
        { dependencies: { "@aurora/svelte": "x" } },
        { version: "0.1.0", scope: "acme" },
      ),
    ).toThrow(/--owner/);
  });

  it("refuses an app without an Aurora dependency", () => {
    expect(() =>
      pin({ name: "x" }, { version: "0.1.0", owner: "o", scope: "acme" }),
    ).toThrow(/--add/);
  });
});

const tgz = (scope: string, name: string, v: string) =>
  [scope, "aurora", name, v].join("-") + ".tgz";

describe("SHA256SUMS", () => {
  const text =
    `${"a".repeat(64)}  ${tgz("acme", "svelte", "0.2.0")}\n` +
    `${"b".repeat(64)} *${tgz("acme", "tokens", "0.2.0")}\n`;

  it("parses sha256sum lines, text and binary mode", () => {
    expect(parseSums(text)).toEqual([
      { file: tgz("acme", "svelte", "0.2.0"), sha256: "a".repeat(64) },
      { file: tgz("acme", "tokens", "0.2.0"), sha256: "b".repeat(64) },
    ]);
  });

  it("refuses an unreadable or empty file", () => {
    expect(() => parseSums("not a checksum line")).toThrow(/unreadable/);
    expect(() => parseSums("\n")).toThrow(/no file/);
  });

  it("reads the scope and every package of the release", () => {
    expect(releasePackages(parseSums(text), { version: "v0.2.0" })).toEqual({
      scope: "acme",
      packages: ["svelte", "tokens"],
    });
  });

  it("reads a scope with a hyphen", () => {
    expect(
      releasePackages([{ file: tgz("two-part", "date-time", "1.0.0") }], {
        version: "1.0.0",
      }),
    ).toEqual({ scope: "two-part", packages: ["date-time"] });
  });

  it("refuses a tarball of another scope or version", () => {
    expect(() =>
      releasePackages(parseSums(text), { version: "0.2.0", scope: "other" }),
    ).toThrow(/not @other/);
    expect(() =>
      releasePackages(parseSums(text), { version: "0.3.0" }),
    ).toThrow(/0\.3\.0/);
  });
});

describe("checkAssets", () => {
  const good = sha256("tarball bytes");

  it("passes when every download matches", () => {
    expect(checkAssets({ "a.tgz": good }, { "a.tgz": good })).toEqual([]);
  });

  it("names a re-uploaded asset and one without a recorded checksum", () => {
    expect(
      checkAssets(
        { "a.tgz": good },
        { "a.tgz": sha256("tampered bytes"), "b.tgz": good },
      ),
    ).toEqual([
      `a.tgz: sha256 ${sha256("tampered bytes")} does not match ${good}`,
      "b.tgz: no recorded sha256",
    ]);
  });
});

describe("assetPins", () => {
  it("lists each pinned asset URL once, dependencies and overrides", () => {
    const next = pin(pinned, { version: "0.2.0", packages: both });
    expect(assetPins(next)).toEqual([
      {
        url: url("someone", "acme", "svelte", "0.2.0"),
        file: tgz("acme", "svelte", "0.2.0"),
      },
      {
        url: url("someone", "acme", "tokens", "0.2.0"),
        file: tgz("acme", "tokens", "0.2.0"),
      },
    ]);
  });

  it("finds nothing to verify in npm pins", () => {
    expect(
      assetPins(pin(pinned, { version: "0.4.0", registry: "npm" })),
    ).toEqual([]);
  });
});

describe("parseCli", () => {
  it("accepts --x value and --x=value", () => {
    expect(
      parseCli(["0.3.0", "--registry=npm", "--scope", "acme", "--no-install"]),
    ).toEqual({
      verify: false,
      version: "0.3.0",
      registry: "npm",
      owner: undefined,
      repo: undefined,
      scope: "acme",
      add: undefined,
      install: false,
    });
    expect(parseCli(["v0.3.0", "--add=svelte,tokens"])).toMatchObject({
      version: "0.3.0",
      add: ["svelte", "tokens"],
      install: true,
    });
  });

  it("refuses unknown or misspelt flags", () => {
    expect(() => parseCli(["0.3.0", "--regsitry", "npm"])).toThrow();
    expect(() => parseCli(["0.3.0", "--registry", "yarn"])).toThrow(
      /unknown registry/,
    );
  });

  it("refuses a flag without its value", () => {
    expect(() => parseCli(["0.3.0", "--add", "--no-install"])).toThrow();
  });

  it("wants exactly one version, or --verify alone", () => {
    expect(() => parseCli([])).toThrow(/one version/);
    expect(() => parseCli(["0.3.0", "0.4.0"])).toThrow(/one version/);
    expect(parseCli(["--verify"])).toEqual({ verify: true });
    expect(() => parseCli(["--verify", "0.3.0"])).toThrow(/--verify/);
  });
});
