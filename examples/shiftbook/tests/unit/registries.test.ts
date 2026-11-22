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
});
