import { describe, expect, it } from "vitest";
import { FAMILIES } from "../../src/lib/domain/apply.ts";
import { readSources } from "../../scripts/ledger.mjs";
import { SEED_PARTS as RUN_PARTS } from "../../src/lib/world/seed.ts";
import {
  commandFamilies,
  purityProblems,
  registryProblems,
  SEED_PARTS,
} from "../helpers/registries.ts";

const { files } = readSources();

describe("registries: every family of every closed registry has its file", () => {
  it("the example's registries hold", () => {
    expect(registryProblems(files)).toEqual([]);
  });

  it("the handler table names exactly the families of the Command union", () => {
    const fromTypes = commandFamilies(
      files.get("src/lib/domain/types.ts") ?? "",
    );
    expect([...FAMILIES].sort()).toEqual(fromTypes);
    expect(fromTypes).toEqual([
      "confirmation",
      "conflict",
      "device",
      "import",
      "period",
      "person",
      "roles",
      "settings",
      "shift",
      "stamp",
      "tip",
      "token",
    ]);
  });

  it("the seed runs exactly its parts", () => {
    expect(Object.keys(RUN_PARTS).sort()).toEqual([...SEED_PARTS].sort());
  });
});

describe("registries: each rule fails on its inversion", () => {
  const without = (path: string) => {
    const f = new Map(files);
    f.delete(path);
    return f;
  };
  const withFile = (path: string, text: string) =>
    new Map(files).set(path, text);

  it("a handler file that is missing", () => {
    expect(registryProblems(without("src/lib/domain/handlers/tip.ts"))).toEqual(
      ['the command family "tip" has no handlers/tip.ts'],
    );
  });

  it("a handler file for no family", () => {
    expect(
      registryProblems(withFile("src/lib/domain/handlers/payroll.ts", "")),
    ).toEqual(["handlers/payroll.ts is not a family of the Command union"]);
  });

  it("a handler the table does not import", () => {
    const apply = files
      .get("src/lib/domain/apply.ts")!
      .replace(/^import .*handlers\/roles\.ts";$/m, "");
    expect(
      registryProblems(withFile("src/lib/domain/apply.ts", apply)),
    ).toEqual(["apply.ts does not import handlers/roles.ts"]);
  });

  it("a selector area that is missing, and one the index does not re-export", () => {
    expect(
      registryProblems(without("src/lib/domain/selectors/audit.ts")),
    ).toEqual(['the selector area "audit" has no selectors/audit.ts']);
    const index = files
      .get("src/lib/domain/selectors/index.ts")!
      .replace('export * from "./me.ts";', "");
    expect(
      registryProblems(withFile("src/lib/domain/selectors/index.ts", index)),
    ).toEqual(["selectors/index.ts does not re-export me.ts"]);
  });

  it("a seed part that is missing, and one outside the list", () => {
    expect(registryProblems(without("src/lib/world/seed/tips.ts"))).toEqual([
      'the seed part "tips" has no seed/tips.ts',
    ]);
    expect(
      registryProblems(withFile("src/lib/world/seed/weather.ts", "")),
    ).toEqual(["seed/weather.ts is not a seed part"]);
  });

  it("a second list of handlers or seed parts outside its registry", () => {
    expect(
      registryProblems(
        withFile(
          "src/lib/screens/today/all.ts",
          'import { handle } from "../../domain/handlers/stamp.ts";\nimport { part } from "../../world/seed/people.ts";',
        ),
      ),
    ).toEqual([
      "src/lib/screens/today/all.ts imports ../../domain/handlers/stamp.ts: only apply.ts lists the handlers",
      "src/lib/screens/today/all.ts imports ../../world/seed/people.ts: only seed.ts lists the seed's parts",
    ]);
  });
});

describe("registries: the domain and the world stay pure", () => {
  it("no file under domain/ or world/ imports Svelte or the session, reads real time, draws randomness or touches the DOM", () => {
    expect(purityProblems(files)).toEqual([]);
  });

  it("each of those fails on its inversion", () => {
    const bad = new Map([
      [
        "src/lib/domain/selectors/me.ts",
        'import { getContext } from "svelte";\nimport { useSession } from "../../session/context.ts";\nconst t = Date.now();\nconst r = Math.random();\nconst w = window.innerWidth;',
      ],
      ["src/lib/session/session.ts", "const t = Date.now();"],
    ]);
    expect(purityProblems(bad)).toEqual([
      "src/lib/domain/selectors/me.ts imports svelte: the domain and the world are framework-free",
      "src/lib/domain/selectors/me.ts imports ../../session/context.ts: the domain and the world never reach the session",
      "src/lib/domain/selectors/me.ts reads the real time (Date.now)",
      "src/lib/domain/selectors/me.ts draws randomness (Math.random)",
      "src/lib/domain/selectors/me.ts touches the DOM",
    ]);
  });

  it.each([
    [
      'import "svelte";',
      "imports svelte: the domain and the world are framework-free",
    ],
    [
      'const m = await import("svelte");',
      "imports svelte: the domain and the world are framework-free",
    ],
    [
      'import X from "../ui/X.svelte";',
      "imports ../ui/X.svelte: the domain and the world are framework-free",
    ],
    [
      'export * from "../../session/store.ts";',
      "imports ../../session/store.ts: the domain and the world never reach the session",
    ],
    ["const t = performance.now();", "reads the real time (performance.now)"],
    ["const t = Date();", "reads the real time (Date())"],
    ["const t = Temporal.Now.instant();", "reads the real time (Temporal.Now)"],
    ["const id = crypto.randomUUID();", "draws randomness (crypto)"],
    ["const d = globalThis.document;", "touches the DOM"],
    ["const n = globalThis.navigator.language;", "touches the DOM"],
    [
      'import { now, today, getLocalTimeZone } from "@internationalized/date";',
      "reads the real time or the device zone (now, today, getLocalTimeZone from @internationalized/date)",
    ],
    [
      'import { today } from "@internationalized/date";',
      "reads the real time or the device zone (now, today, getLocalTimeZone from @internationalized/date)",
    ],
    ["const t = new Date;", "reads the real time (new Date)"],
    [
      "const z = Intl.DateTimeFormat().resolvedOptions().timeZone;",
      "reads the device zone (Intl or toLocale* without an explicit timeZone)",
    ],
    [
      'const s = new Intl.DateTimeFormat("de-DE").format(d);',
      "reads the device zone (Intl or toLocale* without an explicit timeZone)",
    ],
    [
      'const s = d.toLocaleTimeString("de-DE");',
      "reads the device zone (Intl or toLocale* without an explicit timeZone)",
    ],
    [
      "const h = new Date(ms).getHours();",
      "reads the device zone (a local-zone Date getter)",
    ],
    [
      "const o = d.getTimezoneOffset();",
      "reads the device zone (a local-zone Date getter)",
    ],
    [
      "const s = d.getDate();",
      "reads the device zone (a local-zone Date getter)",
    ],
    [
      "const s = d.toString();",
      "reads the device zone (a local-zone Date getter)",
    ],
    ["const D = Date;\nnew D();", "passes Date on as a value"],
    ["const t = Reflect.construct(Date, []);", "passes Date on as a value"],
    ["const z = process.env.TZ;", "reads the environment (process.env)"],
    [
      "setTimeout(tick, 1000);",
      "schedules on the real clock (setTimeout and friends)",
    ],
  ])("the guard catches %s", (source, problem) => {
    expect(
      purityProblems(new Map([["src/lib/world/seed/people.ts", source]])),
    ).toEqual([`src/lib/world/seed/people.ts ${problem}`]);
  });

  it("pure uses of Date stay allowed: a given instant, Date.UTC, Date.parse, UTC getters and a zone named outright", () => {
    const ok =
      'const a = new Date(ms);\nconst b = Date.UTC(2026, 0, 1);\nconst c = Date.parse(i);\nfunction f(d: Date, e: Map<string, Date>): Date { return d; }\nconst h = a.getUTCHours() + a.getUTCDate();\nconst x = h.toString(16);\nconst s = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(a);\nconst t = a.toLocaleString("de-DE", { timeZone: zone });\nimport { parseAbsolute, toZoned } from "@internationalized/date";';
    expect(purityProblems(new Map([["src/lib/domain/time.ts", ok]]))).toEqual(
      [],
    );
  });
});
