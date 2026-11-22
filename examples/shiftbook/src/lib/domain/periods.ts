/**
 * Periods (rule 6). A period starts on the tenant's start day, clamped to the
 * last day of a shorter month, and ends on the day before the next one starts.
 * Its status is derived from the clock, never stored.
 */
import { addDays, localDate, parseDate } from "./time.ts";
import type {
  Instant,
  Period,
  PeriodId,
  PeriodStatus,
  PlainDate,
  Shift,
  WorldState,
} from "./types.ts";

export interface PeriodRange {
  start: PlainDate;
  end: PlainDate;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function lastDayOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The day a period starts in a given month: the start day, clamped to the month's last day. */
export function periodStartIn(
  year: number,
  month: number,
  startDay: number,
): PlainDate {
  const day = Math.min(startDay, lastDayOf(year, month));
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function shiftMonth(year: number, month: number, by: number): [number, number] {
  const m = year * 12 + (month - 1) + by;
  return [Math.floor(m / 12), (m % 12) + 1];
}

/** The period that contains a date, for a start day from 1 to 31. */
export function periodContaining(
  date: PlainDate,
  startDay: number,
): PeriodRange {
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 31)
    throw new RangeError(`start day must be 1 to 31, got ${startDay}`);
  const [y, m] = parseDate(date);
  const thisStart = periodStartIn(y, m, startDay);
  const [sy, sm] = date >= thisStart ? [y, m] : shiftMonth(y, m, -1);
  const [ny, nm] = shiftMonth(sy, sm, 1);
  return {
    start: periodStartIn(sy, sm, startDay),
    end: addDays(periodStartIn(ny, nm, startDay), -1),
  };
}

/** Every period that overlaps `[from, to]`, oldest first. */
export function periodsBetween(
  from: PlainDate,
  to: PlainDate,
  startDay: number,
): PeriodRange[] {
  const list: PeriodRange[] = [];
  let p = periodContaining(from, startDay);
  while (p.start <= to) {
    list.push(p);
    p = periodContaining(addDays(p.end, 1), startDay);
  }
  return list;
}

/** A shift belongs to the period of its begin, as a local date at its location. */
export function periodOfShift(
  shift: Pick<Shift, "begin">,
  locationTimeZone: string,
  startDay: number,
): PeriodRange {
  return periodContaining(localDate(shift.begin, locationTimeZone), startDay);
}

/** Whether a date lies in a period (both edges inclusive). */
export function inPeriod(date: PlainDate, period: PeriodRange): boolean {
  return date >= period.start && date <= period.end;
}

/**
 * `closed` if closed; else `confirming` if confirmations were requested; else
 * `review` once the tenant's local date is past the end; else `running`.
 */
export function periodStatus(
  period: Period,
  now: Instant,
  tenantTimeZone: string,
): PeriodStatus {
  if (period.closedAt) return "closed";
  if (period.requestedAt) return "confirming";
  if (localDate(now, tenantTimeZone) > period.end) return "review";
  return "running";
}

/** A period record with nothing requested, closed or reopened. */
export function newPeriod(range: PeriodRange): Period {
  return {
    id: range.start as PeriodId,
    start: range.start,
    end: range.end,
    reopenings: [],
  };
}

/**
 * The record of a period: the stored one, or a fresh record when nothing was
 * requested, closed or reopened yet. Only the seed and the period commands
 * store records, so a period the clock has just entered has none; it is still
 * a period.
 */
export function periodRecord(state: WorldState, range: PeriodRange): Period {
  return state.periods[range.start as PeriodId] ?? newPeriod(range);
}

/**
 * The period whose id is `id`, if `id` is a period start for the tenant's
 * start day. Any other string, including a date inside a period, is no period.
 */
export function periodById(
  state: WorldState,
  id: PeriodId,
): Period | undefined {
  if (state.periods[id]) return state.periods[id];
  let range: PeriodRange;
  try {
    range = periodContaining(id, state.settings.periodStartDay);
  } catch (e) {
    if (e instanceof RangeError) return undefined;
    throw e;
  }
  return range.start === id ? newPeriod(range) : undefined;
}

/** The period record a shift falls in; always one, stored or fresh. */
export function periodRecordOfShift(state: WorldState, shift: Shift): Period {
  const zone =
    state.locations[shift.locationId]?.timeZone ?? state.settings.timeZone;
  return periodRecord(
    state,
    periodOfShift(shift, zone, state.settings.periodStartDay),
  );
}
