/**
 * Time: shifts are instants, a location has an IANA zone, and wall times exist
 * only at the two edges (display and typing). Pure: nothing here reads the
 * real clock or the device's zone.
 *
 * GAP G-018: the kit's date engine has no instants or clock changes yet, so this
 * file runs on `@internationalized/date`. The interface and its tests stay when
 * the implementation moves onto the kit's engine.
 */
import {
  CalendarDateTime,
  parseAbsolute,
  toZoned,
  type ZonedDateTime,
} from "@internationalized/date";
import type { Instant, Minutes, PlainDate, PlainTime } from "./types.ts";

export type WallResolution =
  | { kind: "exact"; instant: Instant }
  /** The wall time does not exist on that day: the clock jumped over it. */
  | { kind: "gap"; suggestion: PlainTime; skippedMinutes: number }
  /** The wall time happens twice: the clock went back over it. */
  | { kind: "overlap"; earlier: Instant; later: Instant };

const MINUTE = 60_000;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Milliseconds since the epoch, truncated to the minute, as an instant. */
export function toMinuteInstant(epochMs: number): Instant {
  const ms = Math.floor(epochMs / MINUTE) * MINUTE;
  return new Date(ms).toISOString().replace(/:\d\d\.\d{3}Z$/, ":00Z");
}

/** An instant's milliseconds since the epoch. */
export function instantMs(i: Instant): number {
  const ms = Date.parse(i);
  if (Number.isNaN(ms)) throw new RangeError(`not an instant: ${i}`);
  return ms;
}

/** Truncates any ISO instant to its minute. */
export function truncate(i: Instant): Instant {
  return toMinuteInstant(instantMs(i));
}

/** Adds whole minutes to an instant. */
export function addMinutes(i: Instant, minutes: Minutes): Instant {
  return toMinuteInstant(instantMs(i) + minutes * MINUTE);
}

/** The minutes from `a` to `b`; negative when `b` is earlier. Nothing is rounded. */
export function minutesBetween(a: Instant, b: Instant): Minutes {
  return Math.trunc((instantMs(b) - instantMs(a)) / MINUTE);
}

function zoned(i: Instant, timeZone: string): ZonedDateTime {
  return parseAbsolute(new Date(instantMs(i)).toISOString(), timeZone);
}

function wall(z: ZonedDateTime): { date: PlainDate; time: PlainTime } {
  return {
    date: `${pad(z.year, 4)}-${pad(z.month)}-${pad(z.day)}`,
    time: `${pad(z.hour)}:${pad(z.minute)}`,
  };
}

/** An instant as a wall date and time in a zone, with that zone's offset then. */
export function fromInstant(
  i: Instant,
  timeZone: string,
): { date: PlainDate; time: PlainTime; offsetMinutes: number } {
  const z = zoned(i, timeZone);
  return { ...wall(z), offsetMinutes: z.offset / MINUTE };
}

/** The calendar date of an instant in a zone. */
export function localDate(i: Instant, timeZone: string): PlainDate {
  return wall(zoned(i, timeZone)).date;
}

/** Days added to a plain date (negative to go back). */
export function addDays(date: PlainDate, days: number): PlainDate {
  const [y, m, d] = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function parseDate(date: PlainDate): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`not a date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function parseTime(time: PlainTime): [number, number] {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) throw new RangeError(`not a time: ${time}`);
  return [Number(m[1]), Number(m[2])];
}

/**
 * A wall time typed by a person, resolved in a zone. A time in a gap or in the
 * repeated hour is never guessed: the caller asks the person.
 */
export function resolveWall(
  date: PlainDate,
  time: PlainTime,
  timeZone: string,
): WallResolution {
  const [y, mo, d] = parseDate(date);
  const [h, mi] = parseTime(time);
  const dt = new CalendarDateTime(y, mo, d, h, mi);
  const earlier = toZoned(dt, timeZone, "earlier");
  const later = toZoned(dt, timeZone, "later");
  const e = toMinuteInstant(earlier.toDate().getTime());
  const l = toMinuteInstant(later.toDate().getTime());
  if (e === l) return { kind: "exact", instant: e };
  if (wall(earlier).time === time)
    return { kind: "overlap", earlier: e, later: l };
  return {
    kind: "gap",
    suggestion: wall(later).time,
    skippedMinutes: minutesBetween(e, l),
  };
}

/**
 * The clock change inside `[a, b]` in a zone: `+60` when the clock went back
 * (the span holds an hour more than its wall times say), `-60` when it jumped
 * forward; `null` when the offset is the same at both ends.
 */
export function clockChange(
  a: Instant,
  b: Instant,
  timeZone: string,
): { minutes: number } | null {
  const diff =
    fromInstant(a, timeZone).offsetMinutes -
    fromInstant(b, timeZone).offsetMinutes;
  return diff === 0 ? null : { minutes: diff };
}
