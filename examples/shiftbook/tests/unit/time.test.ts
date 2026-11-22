import { afterEach, describe, expect, it } from "vitest";
import {
  clockChange,
  fromInstant,
  instantMs,
  localDate,
  minutesBetween,
  resolveWall,
  toMinuteInstant,
  truncate,
} from "../../src/lib/domain/time.ts";

const BERLIN = "Europe/Berlin";
const HELSINKI = "Europe/Helsinki";

/** Turns a wall time in a zone into its instant, failing loudly on a gap or an overlap. */
function at(date: string, time: string, zone: string) {
  const r = resolveWall(date, time, zone);
  if (r.kind !== "exact") throw new Error(`${date} ${time} is a ${r.kind}`);
  return r.instant;
}

describe("the runtime's time-zone data (checked before any rule)", () => {
  // Shiftbook uses only Europe's 2026 transitions: 29 March and 25 October at 01:00 UTC.
  it.each([BERLIN, HELSINKI])(
    "%s changes its offset at 01:00 UTC on 29 March and 25 October 2026",
    (zone) => {
      const before = (i: string) => fromInstant(i, zone).offsetMinutes;
      expect(before("2026-03-29T00:59:00Z")).toBe(zone === BERLIN ? 60 : 120);
      expect(before("2026-03-29T01:00:00Z")).toBe(zone === BERLIN ? 120 : 180);
      expect(before("2026-10-25T00:59:00Z")).toBe(zone === BERLIN ? 120 : 180);
      expect(before("2026-10-25T01:00:00Z")).toBe(zone === BERLIN ? 60 : 120);
    },
  );
});

describe("rule 2, minute-exact", () => {
  it("truncates an instant to its minute and never rounds up", () => {
    expect(toMinuteInstant(Date.UTC(2026, 10, 20, 17, 42, 59, 999))).toBe(
      "2026-11-20T17:42:00Z",
    );
  });

  it("counts the minutes between two instants", () => {
    expect(minutesBetween("2026-11-20T17:42:00Z", "2026-11-20T17:43:00Z")).toBe(
      1,
    );
    expect(minutesBetween("2026-11-19T05:42:00Z", "2026-11-20T17:42:00Z")).toBe(
      36 * 60,
    );
  });
});

describe("the time table", () => {
  it("a night shift over the autumn change lasts 8 h and includes the change (+1 h)", () => {
    const begin = at("2026-10-24", "21:00", BERLIN);
    const end = at("2026-10-25", "04:00", BERLIN);
    expect(minutesBetween(begin, end)).toBe(480);
    expect(clockChange(begin, end, BERLIN)).toEqual({ minutes: 60 });
  });

  it("a night shift over the spring change lasts 6 h and includes the change (-1 h)", () => {
    const begin = at("2026-03-28", "21:00", BERLIN);
    const end = at("2026-03-29", "04:00", BERLIN);
    expect(minutesBetween(begin, end)).toBe(360);
    expect(clockChange(begin, end, BERLIN)).toEqual({ minutes: -60 });
  });

  it("a scan in the repeated hour: in 02:50 CEST, out 02:10 CET is 20 min with two offsets", () => {
    const r = resolveWall("2026-10-25", "02:50", BERLIN);
    expect(r.kind).toBe("overlap");
    if (r.kind !== "overlap") return;
    const out = resolveWall("2026-10-25", "02:10", BERLIN);
    if (out.kind !== "overlap") throw new Error("02:10 repeats as well");
    expect(minutesBetween(r.earlier, out.later)).toBe(20);
    expect(fromInstant(r.earlier, BERLIN)).toEqual({
      date: "2026-10-25",
      time: "02:50",
      offsetMinutes: 120,
    });
    expect(fromInstant(out.later, BERLIN)).toEqual({
      date: "2026-10-25",
      time: "02:10",
      offsetMinutes: 60,
    });
    expect(clockChange(r.earlier, out.later, BERLIN)).toEqual({ minutes: 60 });
  });

  it("a wall time typed into the spring gap is refused with the time an hour later as a suggestion", () => {
    expect(resolveWall("2026-03-29", "02:30", BERLIN)).toEqual({
      kind: "gap",
      suggestion: "03:30",
      skippedMinutes: 60,
    });
  });

  it("an impossible date or time is refused, never shifted silently: 30 February, 25:00, 10:75", () => {
    expect(() => resolveWall("2026-02-30", "10:00", BERLIN)).toThrow(
      RangeError,
    );
    expect(() => resolveWall("2026-13-01", "10:00", BERLIN)).toThrow(
      RangeError,
    );
    expect(() => resolveWall("2026-11-20", "25:00", BERLIN)).toThrow(
      RangeError,
    );
    expect(() => resolveWall("2026-11-20", "10:75", BERLIN)).toThrow(
      RangeError,
    );
    expect(() => resolveWall("2026-11-20", "24:00", BERLIN)).toThrow(
      RangeError,
    );
    // The last real day of a leap February still resolves.
    expect(resolveWall("2028-02-29", "10:00", BERLIN)).toEqual({
      kind: "exact",
      instant: "2028-02-29T09:00:00Z",
    });
  });

  it("a wall time typed into the repeated hour offers both instants and picks neither", () => {
    expect(resolveWall("2026-10-25", "02:30", BERLIN)).toEqual({
      kind: "overlap",
      earlier: "2026-10-25T00:30:00Z",
      later: "2026-10-25T01:30:00Z",
    });
  });

  it("the same night in Helsinki changes from 04:00 to 03:00 by the branch's own zone", () => {
    expect(resolveWall("2026-10-25", "03:30", HELSINKI)).toEqual({
      kind: "overlap",
      earlier: "2026-10-25T00:30:00Z",
      later: "2026-10-25T01:30:00Z",
    });
    expect(resolveWall("2026-10-25", "02:30", BERLIN).kind).toBe("overlap");
    expect(resolveWall("2026-03-29", "03:30", HELSINKI)).toEqual({
      kind: "gap",
      suggestion: "04:30",
      skippedMinutes: 60,
    });
  });

  it("a shift over midnight counts for the day of its begin", () => {
    const begin = at("2026-11-13", "22:00", BERLIN);
    const end = at("2026-11-14", "03:30", BERLIN);
    expect(minutesBetween(begin, end)).toBe(330);
    expect(localDate(begin, BERLIN)).toBe("2026-11-13");
    expect(localDate(end, BERLIN)).toBe("2026-11-14");
    expect(clockChange(begin, end, BERLIN)).toBeNull();
  });

  it("a branch in another zone: 23:30 in Helsinki is 22:30 in Hamburg", () => {
    const i = at("2026-11-13", "23:30", HELSINKI);
    expect(fromInstant(i, BERLIN).time).toBe("22:30");
    expect(fromInstant(i, HELSINKI).time).toBe("23:30");
  });

  describe("a device far away", () => {
    const saved = process.env["TZ"];
    afterEach(() => {
      if (saved === undefined) delete process.env["TZ"];
      else process.env["TZ"] = saved;
    });

    it("changes nothing: no function reads the device's zone", () => {
      const run = () => [
        resolveWall("2026-10-25", "02:30", BERLIN),
        fromInstant("2026-11-20T17:42:00Z", BERLIN),
        localDate("2026-11-20T23:30:00Z", BERLIN),
        clockChange("2026-10-24T19:00:00Z", "2026-10-25T03:00:00Z", BERLIN),
      ];
      process.env["TZ"] = "UTC";
      const utc = run();
      process.env["TZ"] = "Pacific/Auckland";
      expect(run()).toEqual(utc);
    });

    it.each(["UTC", "Pacific/Auckland"])(
      "under TZ=%s an instant without its Z, or with an offset, is refused: only the documented shape is an instant",
      (zone) => {
        process.env["TZ"] = zone;
        for (const bad of [
          "2026-11-20T17:42",
          "2026-11-20T17:42:00",
          "2026-11-20T18:42:00+01:00",
          "2026-11-20",
          "Fri Nov 20 2026 17:42:00",
          "2026-11-20 17:42:00Z",
        ]) {
          expect(() => instantMs(bad), bad).toThrow(RangeError);
          expect(() => truncate(bad), bad).toThrow(RangeError);
        }
        const ms = Date.UTC(2026, 10, 20, 17, 42);
        expect(instantMs("2026-11-20T17:42Z")).toBe(ms);
        expect(instantMs("2026-11-20T17:42:00Z")).toBe(ms);
        expect(instantMs("2026-11-20T17:42:00.000Z")).toBe(ms);
        expect(truncate("2026-11-20T17:42:31.5Z")).toBe("2026-11-20T17:42:00Z");
      },
    );
  });
});
