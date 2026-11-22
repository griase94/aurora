import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../scripts/ledger.mjs";
import { buildWorld } from "../../src/lib/world/seed.ts";
import { canonicalJson } from "../../src/lib/domain/hash.ts";
import { denyList, safetyProblems } from "../helpers/public-safety.ts";

const SKIP = new Set([
  "node_modules",
  ".svelte-kit",
  "build",
  "dist",
  "coverage",
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const deny = denyList();

describe("public safety: the example's own strings (H17)", () => {
  it("every file of the example is safe to publish", () => {
    const problems = files(ROOT).flatMap((p) =>
      safetyProblems(relative(ROOT, p), readFileSync(p, "utf8"), deny),
    );
    expect(problems).toEqual([]);
  });

  it("every dataset's generated data is safe to publish: mail, phones, accounts", () => {
    for (const tenant of ["kranich", "hafenbar"] as const)
      for (const scenario of ["evening", "busy"] as const)
        expect(
          safetyProblems(
            `${tenant}/${scenario}`,
            canonicalJson(buildWorld(tenant, scenario)),
            deny,
          ),
        ).toEqual([]);
  });
});

describe("public safety: each rule fails on its inversion", () => {
  // The bad strings are assembled at run time, so this file itself stays clean.
  const at = "@";
  const cases: [string, string, RegExp][] = [
    ["a real mail domain", `lena${at}mail-provider.de`, /mail address/],
    [
      "a phone number outside the fiction ranges",
      `+49 30 ${"1234567"}`,
      /phone number/,
    ],
    [
      "an account on a real bank code",
      `DE89${"37040044"}0532013000`,
      /fiction bank code/,
    ],
    [
      "a national phone number outside the fiction ranges",
      `call 030 ${"1234567"}`,
      /phone number/,
    ],
    [
      "a postcode outside the fiction list in a data field",
      `${"postcode"}: "${"10999"}"`,
      /postcode/,
    ],
    [
      "a postcode outside the fiction list in generated data",
      `{"city":"Berlin","${"postcode"}":"${"10115"}"}`,
      /postcode/,
    ],
    ["a link to an unknown host", `https:${"//"}tracker.invalid/x`, /link to/],
    ["a local path", ["", "Users", "someone", "x"].join("/"), /local path/],
    ["a token", `ghp${"_"}${"a".repeat(30)}`, /GitHub token/],
    ["a private key", `-----BEGIN ${"RSA PRIVATE"} KEY-----`, /private key/],
  ];

  it.each(cases)("%s is reported", (_name, text, problem) => {
    const out = safetyProblems("f.ts", text);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(problem);
  });

  it("fiction passes: example.com, the film-and-television ranges in both formats, the fiction postcodes, the fiction bank code, reference links", () => {
    const text = [
      `lena.k${at}example.com`,
      "+49 30 23125 017",
      "+49 40 66969 500",
      "030 23125 017",
      'postcode: "10000"',
      '{"postcode":"20999"}',
      `DE${"02"}${"00010000"}0000000042`,
      `https:${"//"}developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API`,
    ].join("\n");
    expect(safetyProblems("f.ts", text)).toEqual([]);
  });

  it("a name from the deny list is reported without being repeated", () => {
    const names = denyList(" Acme Bistro , ");
    expect(names).toEqual(["acme bistro"]);
    expect(safetyProblems("f.ts", "Welcome to ACME Bistro", names)).toEqual([
      "f.ts: a name from the deny list",
    ]);
  });
});
