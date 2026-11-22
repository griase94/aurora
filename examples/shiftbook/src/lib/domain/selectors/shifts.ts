/**
 * Shift selectors: open shifts and who is at work (rule 3), and the issues of
 * this area. `conflictIssues` is filled by the shifts lane (F.3).
 */
import { periodRecordOfShift } from "../periods.ts";
import { minutesBetween } from "../time.ts";
import type { Instant, Minutes, Person, Shift, WorldState } from "../types.ts";
import type { IssueSource } from "./issues.ts";

export const SHIFT_STATES = ["open", "warning", "closed"] as const;
/** Derived from the clock, never stored: an open shift is never ended by itself. */
export type ShiftState = (typeof SHIFT_STATES)[number];

/** `closed` with an end; `warning` when open for at least the tenant's threshold; else `open`. */
export function shiftState(
  shift: Shift,
  now: Instant,
  warningHours: number,
): ShiftState {
  if (shift.end !== null) return "closed";
  return minutesBetween(shift.begin, now) >= warningHours * 60
    ? "warning"
    : "open";
}

export interface OpenShift {
  shift: Shift;
  person: Person;
  state: Exclude<ShiftState, "closed">;
  /** Minutes since the begin. */
  elapsed: Minutes;
}

/** Every open shift, the longest open first. */
export function openShifts(state: WorldState, now: Instant): OpenShift[] {
  const hours = state.settings.openShiftWarningHours;
  const list: OpenShift[] = [];
  for (const shift of Object.values(state.shifts)) {
    if (shift.end !== null) continue;
    const person = state.people[shift.personId];
    if (!person) continue;
    list.push({
      shift,
      person,
      state: shiftState(shift, now, hours) as OpenShift["state"],
      elapsed: minutesBetween(shift.begin, now),
    });
  }
  return list.sort(
    (a, b) =>
      a.shift.begin.localeCompare(b.shift.begin) ||
      a.shift.id.localeCompare(b.shift.id),
  );
}

/** Who is at work now: the open shifts that are not yet past the threshold, earliest begin first. */
export function presentNow(state: WorldState, now: Instant): OpenShift[] {
  return openShifts(state, now).filter((o) => o.state === "open");
}

/** A shift open for at least the threshold blocks closing its period until someone ends it. */
export const openTooLongIssues: IssueSource = (state, now) =>
  openShifts(state, now)
    .filter((o) => o.state === "warning")
    .map((o) => {
      const period = periodRecordOfShift(state, o.shift);
      return {
        id: `open_too_long:${o.shift.id}`,
        kind: "open_too_long",
        severity: "blocks_closing",
        since: o.shift.begin,
        personId: o.person.id,
        locationId: o.shift.locationId,
        ...(period ? { periodId: period.id } : {}),
        fix: {
          screen: "shifts",
          query: { state: "open" },
          params: { shift: o.shift.id },
          open: "correction",
        },
      };
    });

/** Stamps that disagree with the record. Not built: the shifts lane fills it. */
export const conflictIssues: IssueSource = () => [];
