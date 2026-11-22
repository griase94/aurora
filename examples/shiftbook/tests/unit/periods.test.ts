import { describe, expect, it } from "vitest";
import {
  periodContaining,
  periodOfShift,
  periodStartIn,
  periodStatus,
  periodsBetween,
} from "../../src/lib/domain/periods.ts";
import type { Period, PeriodId } from "../../src/lib/domain/types.ts";

const BERLIN = "Europe/Berlin";

describe("rule 6, periods: the start day is clamped to a shorter month's last day", () => {
  it("start day 1 gives calendar months", () => {
    expect(periodContaining("2026-11-20", 1)).toEqual({
      start: "2026-11-01",
      end: "2026-11-30",
    });
    expect(periodContaining("2026-02-01", 1)).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });

  it("start day 21 runs from the 21st to the 20th", () => {
    expect(periodContaining("2026-11-20", 21)).toEqual({
      start: "2026-10-21",
      end: "2026-11-20",
    });
    expect(periodContaining("2026-11-21", 21)).toEqual({
      start: "2026-11-21",
      end: "2026-12-20",
    });
    expect(periodContaining("2026-01-05", 21)).toEqual({
      start: "2025-12-21",
      end: "2026-01-20",
    });
  });

  it("start day 31 means the last day of every month: 30 April, 28 February", () => {
    expect(periodStartIn(2026, 4, 31)).toBe("2026-04-30");
    expect(periodStartIn(2026, 2, 31)).toBe("2026-02-28");
    expect(periodContaining("2026-03-15", 31)).toEqual({
      start: "2026-02-28",
      end: "2026-03-30",
    });
    expect(periodContaining("2026-04-30", 31)).toEqual({
      start: "2026-04-30",
      end: "2026-05-30",
    });
  });

  it("start day 29 in a leap February is the 29th; in another year the 28th", () => {
    expect(periodStartIn(2028, 2, 29)).toBe("2028-02-29");
    expect(periodStartIn(2026, 2, 29)).toBe("2026-02-28");
    expect(periodStartIn(2028, 2, 31)).toBe("2028-02-29");
  });

  it("start day 30 clamps in February only", () => {
    expect(periodStartIn(2026, 2, 30)).toBe("2026-02-28");
    expect(periodStartIn(2026, 4, 30)).toBe("2026-04-30");
    expect(periodContaining("2026-03-01", 30)).toEqual({
      start: "2026-02-28",
      end: "2026-03-29",
    });
  });

  it("an impossible date is refused, not clamped into a period", () => {
    expect(() => periodContaining("2026-02-30", 21)).toThrow(RangeError);
    expect(() => periodContaining("2026-00-10", 21)).toThrow(RangeError);
  });

  it("a period ends on the day before the next one starts, so periods tile the calendar", () => {
    for (const day of [1, 21, 29, 30, 31]) {
      const list = periodsBetween("2026-01-01", "2028-12-31", day);
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1]!;
        const next = list[i]!;
        expect(periodContaining(prev.end, day)).toEqual(prev);
        expect(periodContaining(next.start, day)).toEqual(next);
        expect(prev.end < next.start).toBe(true);
      }
    }
  });
});

describe("rule 6, membership: a shift belongs to the period of its begin, as a local date at its location", () => {
  it("a shift from 22:00 on the period's last day counts for that period", () => {
    // 20 November 22:00 in Berlin is 21:00 UTC; the next day starts the next period.
    const period = periodOfShift({ begin: "2026-11-20T21:00:00Z" }, BERLIN, 21);
    expect(period).toEqual({ start: "2026-10-21", end: "2026-11-20" });
  });

  it("a begin shortly after local midnight belongs to the next local day", () => {
    // 23:30 UTC on 20 November is 00:30 on 21 November in Berlin.
    expect(
      periodOfShift({ begin: "2026-11-20T23:30:00Z" }, BERLIN, 21),
    ).toEqual({
      start: "2026-11-21",
      end: "2026-12-20",
    });
  });
});

describe("rule 6, periodStatus", () => {
  const base: Period = {
    id: "2026-10-21" as PeriodId,
    start: "2026-10-21",
    end: "2026-11-20",
    reopenings: [],
  };
  const lastEvening = "2026-11-20T17:42:00Z";
  const nextMorning = "2026-11-21T07:00:00Z";

  it("is running while the tenant's local date lies inside the period", () => {
    expect(periodStatus(base, lastEvening, BERLIN)).toBe("running");
  });

  it("is review once the tenant's local date is past the end", () => {
    expect(periodStatus(base, nextMorning, BERLIN)).toBe("review");
    // 23:30 UTC is already the next day in Berlin.
    expect(periodStatus(base, "2026-11-20T23:30:00Z", BERLIN)).toBe("review");
  });

  it("is confirming once confirmations are requested, closed once closed", () => {
    expect(
      periodStatus({ ...base, requestedAt: nextMorning }, nextMorning, BERLIN),
    ).toBe("confirming");
    expect(
      periodStatus(
        { ...base, requestedAt: nextMorning, closedAt: nextMorning },
        nextMorning,
        BERLIN,
      ),
    ).toBe("closed");
  });
});
