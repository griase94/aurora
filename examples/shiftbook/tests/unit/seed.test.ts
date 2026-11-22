import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/lib/domain/hash.ts";
import { periodStatus } from "../../src/lib/domain/periods.ts";
import { minutesBetween } from "../../src/lib/domain/time.ts";
import {
  TENANT_IDS,
  type PersonId,
  type Shift,
  type TenantId,
  type WorldState,
} from "../../src/lib/domain/types.ts";
import { buildWorld, seedHash, seedWorld } from "../../src/lib/world/seed.ts";
import { SCENARIOS, SCENARIO_IDS } from "../../src/lib/world/scenarios.ts";
import { BUSY_PEOPLE } from "../../src/lib/world/seed/people.ts";
import { BUSY_SHIFTS, SCRIPTED } from "../../src/lib/world/seed/shifts.ts";

const fullName = (p: { givenName: string; familyName: string }) =>
  [p.givenName, p.familyName].filter(Boolean).join(" ");
const shiftsOf = (w: WorldState, key: string, tenant: TenantId): Shift[] =>
  Object.values(w.shifts).filter(
    (s) => s.personId === (`person_${tenant}_${key}` as PersonId),
  );

describe("seed: determinism", () => {
  it("builds the same bytes twice for every tenant and dataset", () => {
    for (const t of TENANT_IDS)
      for (const s of [
        "evening",
        "empty",
        "review",
        "dst-autumn",
        "dst-spring",
      ] as const)
        expect(canonicalJson(buildWorld(t, s))).toBe(
          canonicalJson(buildWorld(t, s)),
        );
  });

  it("keeps a stable hash: a change to the seed changes these on purpose, never by accident", () => {
    const hashes = Object.fromEntries(
      TENANT_IDS.flatMap((t) =>
        SCENARIO_IDS.map((s) => [`${t}:${s}`, seedHash(t, s)]),
      ),
    );
    expect(hashes).toEqual({
      "hafenbar:busy": "77f53599",
      "hafenbar:dst-autumn": "b838b1a2",
      "hafenbar:dst-spring": "f12fdd99",
      "hafenbar:empty": "f756d0f8",
      "hafenbar:evening": "93f04598",
      "hafenbar:review": "16c86374",
      "kranich:busy": "65e4a5a4",
      "kranich:dst-autumn": "c32d790a",
      "kranich:dst-spring": "38cc932a",
      "kranich:empty": "5692e094",
      "kranich:evening": "b622535d",
      "kranich:review": "7eaee605",
    });
  });

  it("memoises and deep-freezes the world", () => {
    const w = seedWorld("kranich", "evening");
    expect(seedWorld("kranich", "evening")).toBe(w);
    expect(Object.isFrozen(w)).toBe(true);
    expect(Object.isFrozen(Object.values(w.shifts)[0])).toBe(true);
  });
});

describe("seed: the scripted cases of the evening", () => {
  const kranich = seedWorld("kranich", "evening");
  const hafenbar = seedWorld("hafenbar", "evening");
  const instant = SCENARIOS.evening.instant;

  it("holds every scripted case whose begin lies in the three periods and before the instant", () => {
    for (const [tenant, world] of [
      ["kranich", kranich],
      ["hafenbar", hafenbar],
    ] as const)
      for (const c of SCRIPTED[tenant].filter(
        (c) => c.begin >= "2026-08-21" && c.begin < instant,
      )) {
        const found = shiftsOf(world, c.person, tenant).find(
          (s) => s.begin === c.begin,
        );
        expect(found, `${tenant}: ${c.case}`).toBeDefined();
        expect(found?.end, `${tenant}: ${c.case}`).toBe(c.end);
      }
  });

  it("the autumn night lasts 480 minutes in Berlin and in Helsinki; the repeated hour 20", () => {
    const kAutumn = shiftsOf(kranich, "05", "kranich").find(
      (s) => s.begin === "2026-10-24T19:00:00Z",
    )!;
    const hAutumn = shiftsOf(hafenbar, "08", "hafenbar").find(
      (s) => s.begin === "2026-10-24T18:00:00Z",
    )!;
    const repeated = shiftsOf(hafenbar, "14", "hafenbar").find(
      (s) => s.begin === "2026-10-25T00:50:00Z",
    )!;
    expect(minutesBetween(kAutumn.begin, kAutumn.end!)).toBe(480);
    expect(minutesBetween(hAutumn.begin, hAutumn.end!)).toBe(480);
    expect(minutesBetween(repeated.begin, repeated.end!)).toBe(20);
  });

  it("the shortest shift is one minute and the longest 36 hours", () => {
    const all = [
      ...Object.values(kranich.shifts),
      ...Object.values(hafenbar.shifts),
    ].filter((s) => s.end);
    const lengths = all.map((s) => minutesBetween(s.begin, s.end!));
    expect(Math.min(...lengths)).toBe(1);
    expect(Math.max(...lengths)).toBe(36 * 60);
  });

  it("the corrected shift carries its correction and a manual end", () => {
    const s = shiftsOf(kranich, "08", "kranich").find(
      (x) => x.begin === "2026-11-18T06:00:00Z",
    )!;
    expect(s.endSource).toBe("manual");
    expect(s.corrections).toEqual([
      expect.objectContaining({
        by: "person_kranich_02",
        changes: [{ field: "end", from: null, to: s.end }],
      }),
    ]);
  });

  it("names run from one word to 46 characters and include a right-to-left name", () => {
    const names = Object.values(hafenbar.people).map(fullName);
    expect(Math.max(...names.map((n) => n.length))).toBe(46);
    expect(names.some((n) => !n.includes(" "))).toBe(true);
    expect(names.some((n) => /[\u0590-\u08ff]/.test(n))).toBe(true);
  });

  it("the zero-hours employee has no shift", () => {
    const zero = Object.values(hafenbar.people).filter(
      (p) => p.record.employment.type === "zero_hours",
    );
    expect(zero).toHaveLength(1);
    expect(shiftsOf(hafenbar, "12", "hafenbar")).toEqual([]);
  });

  it("badges: one locked, one replaced by an active one, and a person who left has none active", () => {
    const tokens = Object.values(kranich.tokens);
    expect(tokens.filter((t) => t.status === "replaced")).toHaveLength(1);
    const left = Object.values(kranich.people).find(
      (p) => p.status === "left",
    )!;
    expect(
      tokens.filter((t) => t.personId === left.id && t.status === "active"),
    ).toEqual([]);
    expect(
      tokens.filter((t) => t.status === "locked").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("periods: Café Kranich closed its two earlier periods; Hafenbar Nord awaits October's confirmations", () => {
    const status = (w: WorldState) =>
      Object.values(w.periods)
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((p) => [p.start, periodStatus(p, instant, w.settings.timeZone)]);
    expect(status(kranich)).toEqual([
      ["2026-08-21", "closed"],
      ["2026-09-21", "closed"],
      ["2026-10-21", "running"],
    ]);
    expect(status(hafenbar)).toEqual([
      ["2026-09-01", "closed"],
      ["2026-10-01", "confirming"],
      ["2026-11-01", "running"],
    ]);
  });
});

describe("seed: every dataset is a consistent world", () => {
  it.each(TENANT_IDS.flatMap((t) => SCENARIO_IDS.map((s) => [t, s] as const)))(
    "%s, %s",
    (t, s) => {
      const w = seedWorld(t, s);
      const instant = SCENARIOS[s].instant;
      const byPerson = new Map<string, Shift[]>();
      for (const shift of Object.values(w.shifts)) {
        expect(w.people[shift.personId], shift.id).toBeDefined();
        expect(w.locations[shift.locationId], shift.id).toBeDefined();
        expect(shift.begin < instant, shift.id).toBe(true);
        if (shift.end)
          expect(
            shift.begin < shift.end && shift.end <= instant,
            shift.id,
          ).toBe(true);
        byPerson.set(shift.personId, [
          ...(byPerson.get(shift.personId) ?? []),
          shift,
        ]);
      }
      for (const [person, list] of byPerson) {
        list.sort((a, b) => a.begin.localeCompare(b.begin));
        expect(
          list.filter((x) => x.end === null).length,
          person,
        ).toBeLessThanOrEqual(1);
        for (let i = 1; i < list.length; i++)
          expect(
            (list[i - 1]!.end ?? instant) <= list[i]!.begin,
            `${person} overlaps at ${list[i]!.begin}`,
          ).toBe(true);
      }
      for (const token of Object.values(w.tokens))
        expect(w.people[token.personId]).toBeDefined();
      expect(new Set(Object.values(w.tokens).map((x) => x.code)).size).toBe(
        Object.keys(w.tokens).length,
      );
      expect(new Set(Object.values(w.people).map((p) => p.number)).size).toBe(
        Object.keys(w.people).length,
      );
    },
  );

  it("empty: the owner alone, no shift, the running period only", () => {
    for (const t of TENANT_IDS) {
      const w = seedWorld(t, "empty");
      expect(Object.values(w.people).map((p) => p.role)).toEqual(["owner"]);
      expect(Object.keys(w.shifts)).toEqual([]);
      expect(Object.keys(w.periods)).toHaveLength(1);
    }
  });

  it("busy: 400 people and 12,000 shifts per tenant", () => {
    for (const t of TENANT_IDS) {
      const w = seedWorld(t, "busy");
      expect(Object.keys(w.people)).toHaveLength(BUSY_PEOPLE);
      expect(Object.keys(w.shifts)).toHaveLength(BUSY_SHIFTS);
    }
  });
});

describe("seed: budgets (ten times the design's ceilings, so a loaded machine does not flake)", () => {
  const time = (fn: () => void) => {
    const t0 = performance.now();
    fn();
    return performance.now() - t0;
  };

  it("builds the evening in under 100 ms and the busy season in under 2 s", () => {
    buildWorld("kranich", "evening");
    expect(time(() => buildWorld("kranich", "evening"))).toBeLessThan(100);
    expect(time(() => buildWorld("kranich", "busy"))).toBeLessThan(2000);
  });
});
