import { describe, expect, it } from "vitest";
import { currentSource, pin } from "./aurora-pin.mjs";

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

describe("pin to release assets", () => {
  const next = pin(pinned, { version: "0.2.0" });

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
      { version: "0.0.1", owner: "someone", scope: "acme", add: ["canary"] },
    );
    expect(fresh.dependencies).toEqual({
      "@aurora/canary": url("someone", "acme", "canary", "0.0.1"),
    });
    expect(fresh.pnpm.overrides).toEqual({
      [scoped("acme", "canary")]: url("someone", "acme", "canary", "0.0.1"),
    });
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
