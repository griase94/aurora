import { describe, expect, it } from "vitest";
import {
  CONFIRMATION_STATES,
  PERIOD_STATUSES,
  PERSON_STATUSES,
  TOKEN_STATUSES,
  type Instant,
  type LocationId,
  type PeriodId,
  type WorldState,
} from "../../src/lib/domain/types.ts";
import { apply } from "../../src/lib/domain/apply.ts";
import { minutesBetween } from "../../src/lib/domain/time.ts";
import {
  ISSUE_KINDS,
  ISSUE_SOURCES,
  issues,
  orderIssues,
  type Issue,
} from "../../src/lib/domain/selectors/issues.ts";
import { periodSummary } from "../../src/lib/domain/selectors/figures.ts";
import {
  presentNow,
  SHIFT_STATES,
} from "../../src/lib/domain/selectors/shifts.ts";
import { FACE_TABLES, KIOSK_RESULTS } from "../../src/lib/compose/faces.ts";
import { seedWorld } from "../../src/lib/world/seed.ts";

const NOW = "2026-11-20T17:42:00Z";
const MARKT = "loc_kranich_markt" as LocationId;

/** A kiosk scan of a kranich person's active badge; throws if refused. */
function stamp(w: WorldState, person: string, now: Instant): WorldState {
  const token = Object.values(w.tokens).find(
    (t) => t.personId === `person_kranich_${person}` && t.status === "active",
  )!;
  let n = 0;
  const o = apply(
    w,
    { type: "stamp", code: token.code, locationId: MARKT },
    {
      now,
      actor: { kind: "kiosk", locationId: MARKT },
      newId: (kind) => `${kind}_issues_${now}_${++n}`,
      newCode: () => "sb_testtesttesttesttesttestte",
    },
  );
  if (!o.ok) throw new Error(`refused: ${JSON.stringify(o.refusal)}`);
  return o.state;
}
const kranich = seedWorld("kranich", "evening");
const hafenbar = seedWorld("hafenbar", "evening");

describe("issues: open_too_long", () => {
  it("lists the shift open since Thursday morning as blocking its period, with the fix", () => {
    expect(issues(kranich, NOW)).toEqual([
      {
        id: expect.stringMatching(/^open_too_long:shift_kranich_/),
        kind: "open_too_long",
        severity: "blocks_closing",
        since: "2026-11-19T05:55:00Z",
        personId: "person_kranich_06",
        locationId: "loc_kranich_markt",
        periodId: "2026-10-21",
        fix: {
          screen: "shifts",
          query: { state: "open" },
          params: { shift: expect.stringMatching(/^shift_kranich_/) },
          open: "correction",
        },
      },
    ]);
  });

  it("an open shift under the threshold is no issue; at the threshold it is", () => {
    // Hafenbar's crew began between 17:00 and 19:00 local time on Friday.
    expect(issues(hafenbar, NOW)).toEqual([]);
    expect(
      issues(hafenbar, "2026-11-21T07:00:00Z").map((i) => i.personId),
    ).toEqual(["person_hafenbar_03"]);
    expect(issues(hafenbar, "2026-11-21T08:00:00Z")).toHaveLength(4);
  });
});

describe("issues: the order", () => {
  const issue = (
    id: string,
    severity: Issue["severity"],
    since: string,
  ): Issue => ({
    id,
    kind: "open_too_long",
    severity,
    since,
    fix: { screen: "shifts" },
  });

  it("puts blockers first, then the oldest first, then by id", () => {
    const list = [
      issue("d", "warn", "2026-11-01T00:00:00Z"),
      issue("c", "blocks_closing", "2026-11-03T00:00:00Z"),
      issue("b", "blocks_closing", "2026-11-02T00:00:00Z"),
      issue("a", "blocks_closing", "2026-11-02T00:00:00Z"),
      issue("e", "warn", "2026-10-01T00:00:00Z"),
    ];
    expect(orderIssues(list).map((i) => i.id)).toEqual([
      "a",
      "b",
      "c",
      "e",
      "d",
    ]);
  });

  it("asks every kind's source", () => {
    expect(Object.keys(ISSUE_SOURCES).sort()).toEqual([...ISSUE_KINDS].sort());
  });
});

describe("periodSummary", () => {
  it("adds the recorded minutes of the period and counts who is at work; areas not built answer null", () => {
    const s = periodSummary(kranich, "2026-10-21" as PeriodId, NOW);
    expect(s.present).toBe(presentNow(kranich, NOW).length);
    expect(s.present).toBe(3);
    expect(s.tips).toBeNull();
    expect(s.confirmed).toBeNull();
    // Worked out from the scripted and generated closed shifts, summed by the
    // local date of their begin; the edge shift of 20 October (180) is in the previous one.
    expect(s.hours).toBe(66133);
    expect(periodSummary(kranich, "2026-09-21" as PeriodId, NOW).hours).toBe(
      63990,
    );
  });

  it("the edge shift moved past 20 October 22:00 local moves exactly its 180 minutes to the next period", () => {
    const edge = Object.values(kranich.shifts).find(
      (s) => s.begin === "2026-10-20T20:00:00Z",
    )!;
    expect(minutesBetween(edge.begin, edge.end!)).toBe(180);
    const moved: WorldState = {
      ...kranich,
      shifts: {
        ...kranich.shifts,
        // Midnight of 21 October in Berlin (CEST) to 03:00.
        [edge.id]: {
          ...edge,
          begin: "2026-10-20T22:00:00Z",
          end: "2026-10-21T01:00:00Z",
        },
      },
    };
    expect(periodSummary(moved, "2026-10-21" as PeriodId, NOW).hours).toBe(
      66133 + 180,
    );
    expect(periodSummary(moved, "2026-09-21" as PeriodId, NOW).hours).toBe(
      63990 - 180,
    );
  });

  it("after the clock passes the period end, the running period counts its shifts", () => {
    expect(kranich.periods["2026-11-21" as PeriodId]).toBeUndefined();
    const inAt = stamp(kranich, "10", "2026-11-21T07:00:00Z");
    const outAt = stamp(inAt, "10", "2026-11-21T12:00:00Z");
    expect(
      periodSummary(outAt, "2026-11-21" as PeriodId, "2026-11-21T12:00:00Z")
        .hours,
    ).toBe(300);
  });

  it("an open shift in a period without a record still names its period", () => {
    const open = stamp(kranich, "10", "2026-11-21T08:00:00Z");
    const mine = issues(open, "2026-11-22T00:00:00Z").filter(
      (i) => i.personId === "person_kranich_10",
    );
    expect(mine).toMatchObject([
      { kind: "open_too_long", periodId: "2026-11-21" },
    ]);
  });

  it("an unknown period has no hours: an id that is not a period start", () => {
    expect(periodSummary(kranich, "1999-01-01" as PeriodId, NOW).hours).toBe(0);
    expect(periodSummary(kranich, "2026-10-22" as PeriodId, NOW).hours).toBe(0);
    expect(periodSummary(kranich, "bogus" as PeriodId, NOW).hours).toBe(0);
  });
});

describe("faces: every domain state and every issue kind has a face and a message key", () => {
  const states = {
    shift: [...SHIFT_STATES, "conflict", "corrected"],
    person: PERSON_STATUSES,
    token: TOKEN_STATUSES,
    period: PERIOD_STATUSES,
    confirmation: CONFIRMATION_STATES,
    kiosk: KIOSK_RESULTS,
    issue: ISSUE_KINDS,
  } as const;

  it.each(Object.entries(states))("%s", (domain, keys) => {
    const table = FACE_TABLES[domain as keyof typeof FACE_TABLES] as Record<
      string,
      { message: string }
    >;
    expect(Object.keys(table).sort()).toEqual([...keys].sort());
    for (const k of keys)
      expect(table[k]?.message, `${domain}.${k}`).toMatch(/^[a-z][A-Za-z]+$/);
  });

  it("message keys are unique across every table", () => {
    const keys = Object.values(FACE_TABLES).flatMap((t) =>
      Object.values(t).map((f) => f.message),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("the normal states have no pill: colour marks the exception", () => {
    expect(FACE_TABLES.person.active.tone).toBeNull();
    expect(FACE_TABLES.token.active.tone).toBeNull();
    expect(FACE_TABLES.period.running.tone).toBeNull();
  });
});
