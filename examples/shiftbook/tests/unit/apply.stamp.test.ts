import { describe, expect, it } from "vitest";
import { apply, FAMILIES } from "../../src/lib/domain/apply.ts";
import { openShifts } from "../../src/lib/domain/selectors/shifts.ts";
import type {
  Actor,
  ApplyContext,
  Command,
  Instant,
  LocationId,
  Outcome,
  PersonId,
  WorldState,
} from "../../src/lib/domain/types.ts";
import { seedWorld } from "../../src/lib/world/seed.ts";

const world = seedWorld("kranich", "evening");
const MARKT = "loc_kranich_markt" as LocationId;
const KIOSK: Actor = { kind: "kiosk", locationId: MARKT };
const NOW = "2026-11-20T17:42:00Z";

let seq = 0;
const ctx = (now: Instant, actor: Actor = KIOSK): ApplyContext => {
  seq++;
  let n = 0;
  return {
    now,
    actor,
    newId: (kind) => `${kind}_${String(seq).padStart(6, "0")}_${++n}`,
    newCode: () => "sb_testtesttesttesttesttestte",
  };
};

const codeOf = (key: string, w: WorldState = world) => {
  const t = Object.values(w.tokens).find(
    (x) => x.personId === `person_kranich_${key}` && x.status === "active",
  );
  if (!t) throw new Error(`no active badge for ${key}`);
  return t.code;
};
const stamp = (
  w: WorldState,
  code: string,
  now = NOW,
  actor: Actor = KIOSK,
): Outcome =>
  apply(w, { type: "stamp", code, locationId: MARKT }, ctx(now, actor));
const accepted = (o: Outcome) => {
  if (!o.ok) throw new Error(`refused: ${JSON.stringify(o.refusal)}`);
  return o;
};
const openOf = (w: WorldState, key: string) =>
  Object.values(w.shifts).find(
    (s) => s.personId === `person_kranich_${key}` && s.end === null,
  );

describe("rule 1, stamp", () => {
  it("a scan without an open shift begins one now, from the kiosk", () => {
    expect(openOf(world, "10")).toBeUndefined();
    const o = accepted(stamp(world, codeOf("10")));
    expect(o.result).toMatchObject({
      kind: "in",
      person: "person_kranich_10",
      at: NOW,
    });
    expect(openOf(o.state, "10")).toMatchObject({
      begin: NOW,
      end: null,
      beginSource: "kiosk",
      locationId: MARKT,
    });
  });

  it("the next valid scan ends it, to the minute, and says how long it was", () => {
    const first = accepted(stamp(world, codeOf("10")));
    const later = "2026-11-20T21:59:00Z";
    const o = accepted(stamp(first.state, codeOf("10"), later));
    expect(o.result).toMatchObject({
      kind: "out",
      at: later,
      worked: 4 * 60 + 17,
    });
    expect(openOf(o.state, "10")).toBeUndefined();
  });

  it("an open shift from yesterday ends at the next scan; the employee chooses nothing", () => {
    expect(openOf(world, "06")).toBeDefined();
    const o = accepted(stamp(world, codeOf("06")));
    expect(o.result).toMatchObject({ kind: "out", worked: 35 * 60 + 47 });
  });

  it("an unknown code is refused with unknown_token and changes nothing", () => {
    expect(stamp(world, "sb_nobodyhasthiscodeatall000")).toEqual({
      ok: false,
      refusal: { code: "unknown_token", field: "code" },
    });
  });

  it("a locked or replaced badge is refused with locked_token", () => {
    const locked = Object.values(world.tokens).find(
      (t) => t.status === "locked",
    )!;
    const replaced = Object.values(world.tokens).find(
      (t) => t.status === "replaced",
    )!;
    expect(stamp(world, locked.code)).toMatchObject({
      ok: false,
      refusal: { code: "locked_token" },
    });
    expect(stamp(world, replaced.code)).toMatchObject({
      ok: false,
      refusal: { code: "locked_token" },
    });
  });

  it("a person who is not active is refused with inactive_person, even with an active badge", () => {
    expect(world.people["person_kranich_12" as PersonId]?.status).toBe(
      "inactive",
    );
    expect(stamp(world, codeOf("12"))).toMatchObject({
      ok: false,
      refusal: { code: "inactive_person" },
    });
  });

  it("a second scan within scanRepeatSeconds is a duplicate_scan with the earlier result, and books nothing", () => {
    const first = accepted(stamp(world, codeOf("10")));
    const again = stamp(first.state, codeOf("10"), "2026-11-20T17:42:40Z");
    expect(again).toEqual({
      ok: false,
      refusal: {
        code: "duplicate_scan",
        field: "code",
        detail: {
          previous: "in",
          at: NOW,
          shift: (first.result as { shift: string }).shift,
        },
      },
    });
    // Instants are minute-exact, so the next minute may still be seconds later.
    expect(
      stamp(first.state, codeOf("10"), "2026-11-20T17:43:00Z"),
    ).toMatchObject({ ok: false, refusal: { code: "duplicate_scan" } });
    expect(
      accepted(stamp(first.state, codeOf("10"), "2026-11-20T17:44:00Z")).result,
    ).toMatchObject({
      kind: "out",
      worked: 2,
    });
  });

  it("a double scan two seconds apart across a minute boundary is still a duplicate_scan", () => {
    const first = accepted(stamp(world, codeOf("10"), "2026-11-20T17:42:59Z"));
    expect(stamp(first.state, codeOf("10"), "2026-11-20T17:43:01Z")).toEqual({
      ok: false,
      refusal: {
        code: "duplicate_scan",
        field: "code",
        detail: {
          previous: "in",
          at: NOW,
          shift: (first.result as { shift: string }).shift,
        },
      },
    });
  });

  it("a kiosk stamps only at its own branch", () => {
    const o = apply(
      world,
      {
        type: "stamp",
        code: codeOf("10"),
        locationId: "loc_kranich_park" as LocationId,
      },
      ctx(NOW),
    );
    expect(o).toMatchObject({
      ok: false,
      refusal: { code: "forbidden", field: "locationId" },
    });
  });

  it("a person stamps only their own badge, never a colleague's", () => {
    const colleague = Object.values(world.people).find(
      (p) =>
        p.role === "employee" &&
        p.status === "active" &&
        p.id !== "person_kranich_10",
    )!;
    const actor: Actor = {
      kind: "person",
      personId: colleague.id,
      role: "employee",
    };
    expect(stamp(world, codeOf("10"), NOW, actor)).toMatchObject({
      ok: false,
      refusal: { code: "forbidden", field: "code" },
    });
    const own = Object.values(world.tokens).find(
      (t) => t.personId === colleague.id && t.status === "active",
    )!;
    expect(stamp(world, own.code, NOW, actor)).toMatchObject({ ok: true });
  });

  it("a branch that does not exist is refused at the location field", () => {
    expect(
      apply(
        world,
        {
          type: "stamp",
          code: codeOf("10"),
          locationId: "loc_x" as LocationId,
        },
        ctx(NOW),
      ),
    ).toEqual({
      ok: false,
      refusal: { code: "not_found", field: "locationId" },
    });
  });

  it("a person who may not act cannot stamp in their own name", () => {
    const inactive: Actor = {
      kind: "person",
      personId: "person_kranich_12" as PersonId,
      role: "employee",
    };
    expect(stamp(world, codeOf("10"), NOW, inactive)).toMatchObject({
      ok: false,
      refusal: { code: "forbidden" },
    });
  });

  it("an offline stamp waits for the kiosk's outbox: refused as not built", () => {
    const o = apply(
      world,
      {
        type: "stamp",
        code: codeOf("10"),
        locationId: MARKT,
        offline: { deviceAt: NOW, key: "k1" },
      },
      ctx(NOW),
    );
    expect(o).toMatchObject({
      ok: false,
      refusal: { code: "invalid", detail: { reason: "not built" } },
    });
  });
});

describe("rule 2, minute-exact", () => {
  it("an instant is truncated to its minute when it is taken", () => {
    const o = accepted(stamp(world, codeOf("10"), "2026-11-20T17:42:59.999Z"));
    expect(o.result).toMatchObject({ at: NOW });
    expect(o.events[0]?.at).toBe(NOW);
  });
});

describe("rule 3, open shifts", () => {
  it("an open shift turns into a warning at the threshold and is never ended by itself", () => {
    const o = accepted(stamp(world, codeOf("10")));
    const at = (h: number) =>
      openShifts(
        o.state,
        new Date(Date.parse(NOW) + h * 3_600_000)
          .toISOString()
          .replace(".000", ""),
      ).find((x) => x.person.id === "person_kranich_10");
    expect(at(14.9)?.state).toBe("open");
    expect(at(15)?.state).toBe("warning");
    expect(at(100)?.shift.end).toBeNull();
  });
});

describe("rule 10, audit", () => {
  it("every accepted stamp appends one event; a refusal appends none", () => {
    const o = accepted(stamp(world, codeOf("10")));
    expect(o.state.audit).toHaveLength(world.audit.length + 1);
    expect(o.state.audit.at(-1)).toEqual({
      id: expect.stringMatching(/^audit_/),
      at: NOW,
      actor: KIOSK,
      action: "stamp.in",
      object: { kind: "shift", id: (o.result as { shift: string }).shift },
      changes: [{ field: "begin", kind: "instant", from: null, to: NOW }],
      origin: { surface: "kiosk" },
    });
    const out = accepted(stamp(o.state, codeOf("10"), "2026-11-20T19:00:00Z"));
    expect(out.state.audit.slice(0, o.state.audit.length)).toEqual(
      o.state.audit,
    );
    expect(out.state.audit.at(-1)?.action).toBe("stamp.out");
  });
});

describe("apply: the dispatcher", () => {
  it("is pure: the same state, command and context give the same outcome, and the input is untouched", () => {
    const before = JSON.stringify(world);
    const fixed = (): ApplyContext => ({
      now: NOW,
      actor: KIOSK,
      newId: (k) => `${k}_000001_1`,
      newCode: () => "sb_x",
    });
    const cmd: Command = {
      type: "stamp",
      code: codeOf("10"),
      locationId: MARKT,
    };
    expect(apply(world, cmd, fixed())).toEqual(apply(world, cmd, fixed()));
    expect(JSON.stringify(world)).toBe(before);
  });

  it('every family but stamp is a stub that refuses with invalid and reason "not built"', () => {
    const one: Record<string, Command> = {
      person: {
        type: "person.setStatus",
        id: "person_kranich_10" as PersonId,
        status: "inactive",
      },
      token: { type: "token.lock", id: Object.keys(world.tokens)[0] as never },
      shift: {
        type: "shift.correct",
        id: Object.keys(world.shifts)[0] as never,
        begin: NOW,
        end: null,
        reason: "x",
      },
      conflict: {
        type: "conflict.resolve",
        id: "c1",
        choice: "apply",
        reason: "x",
      },
      device: {
        type: "device.report",
        locationId: MARKT,
        deviceNow: NOW,
        pending: 0,
        failed: 0,
      },
      tip: { type: "tip.remove", id: "tip_1" as never, reason: "x" },
      import: { type: "import.commit", batch: { fileName: "a.csv", rows: [] } },
      period: { type: "period.close", id: "2026-10-21" as never },
      confirmation: {
        type: "confirmation.confirm",
        periodId: "2026-10-21" as never,
        method: "button",
      },
      settings: { type: "settings.update", patch: {} },
      roles: { type: "roles.update", managerMayClose: true },
    };
    expect(Object.keys(one).sort()).toEqual(
      FAMILIES.filter((f) => f !== "stamp").sort(),
    );
    for (const [family, cmd] of Object.entries(one))
      expect(apply(world, cmd, ctx(NOW, { kind: "system" })), family).toEqual({
        ok: false,
        refusal: { code: "invalid", detail: { reason: "not built", family } },
      });
  });

  it("refuses a command type it does not know, also one named like an object's own property or a known family's unknown member", () => {
    for (const type of [
      "nonsense.do",
      "stamp.evil",
      "person.bogus",
      "person",
      "stamp.",
      "constructor",
      "hasOwnProperty.x",
      "__proto__.x",
      "toString",
    ]) {
      const o = apply(
        world,
        { type, code: codeOf("10"), locationId: MARKT } as unknown as Command,
        ctx(NOW),
      );
      expect(o, type).toEqual({
        ok: false,
        refusal: { code: "invalid", detail: { reason: "unknown command" } },
      });
    }
  });
});
