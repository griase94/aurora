/**
 * The seed's `shifts` part: the scripted hard cases, then generated shifts over
 * the three periods. A scripted shift whose begin lies after the scenario
 * instant is left out; one whose end lies after it is open at the instant.
 * Generated shifts are closed, end before the instant and never overlap a
 * scripted shift of the same person.
 */
import {
  addDays,
  addMinutes,
  localDate,
  resolveWall,
} from "../../domain/time.ts";
import type {
  Correction,
  EmploymentType,
  Instant,
  Location,
  PersonId,
  Shift,
  ShiftId,
  TenantId,
} from "../../domain/types.ts";
import type { SeedPart } from "../seed.ts";

/** The busy dataset's shift count. */
export const BUSY_SHIFTS = 12_000;

export interface ScriptedShift {
  /** What the case proves, in one line. */
  case: string;
  person: string;
  location: number;
  begin: Instant;
  end: Instant | null;
  endSource?: "manual";
  correction?: Omit<Correction, "by"> & { by: string };
}

/** The hard cases of the time table and the dashboard, written as instants with their wall times beside them. */
export const SCRIPTED: Readonly<Record<TenantId, readonly ScriptedShift[]>> = {
  kranich: [
    // Thursday 19 November 06:55 in Berlin, never ended: open too long on Friday evening.
    {
      case: "open too long",
      person: "06",
      location: 0,
      begin: "2026-11-19T05:55:00Z",
      end: null,
    },
    // Friday 20 November 10:00, 14:30 and 16:00: at work at 18:42.
    {
      case: "present now",
      person: "03",
      location: 0,
      begin: "2026-11-20T09:00:00Z",
      end: null,
    },
    {
      case: "present now",
      person: "05",
      location: 1,
      begin: "2026-11-20T13:30:00Z",
      end: null,
    },
    {
      case: "present now",
      person: "14",
      location: 1,
      begin: "2026-11-20T15:00:00Z",
      end: null,
    },
    // Saturday 24 October 21:00 summer time to Sunday 04:00 winter time: 8 h, includes the change (+1 h).
    {
      case: "autumn change",
      person: "05",
      location: 1,
      begin: "2026-10-24T19:00:00Z",
      end: "2026-10-25T03:00:00Z",
    },
    // Tuesday 20 October 22:00 to 01:00: counts for the period that ends on the 20th.
    {
      case: "period edge",
      person: "10",
      location: 0,
      begin: "2026-10-20T20:00:00Z",
      end: "2026-10-20T23:00:00Z",
    },
    // A scan in and out within a minute: the shortest shift there is.
    {
      case: "one minute",
      person: "11",
      location: 0,
      begin: "2026-11-12T07:00:00Z",
      end: "2026-11-12T07:01:00Z",
    },
    // Ended by a manager the next morning: the end is manual and the correction is on record.
    {
      case: "corrected",
      person: "08",
      location: 0,
      begin: "2026-11-18T06:00:00Z",
      end: "2026-11-18T14:12:00Z",
      endSource: "manual",
      correction: {
        at: "2026-11-19T08:05:00Z",
        by: "02",
        reason:
          "Forgot to clock out; the end is taken from the closing checklist.",
        changes: [{ field: "end", from: null, to: "2026-11-18T14:12:00Z" }],
      },
    },
  ],
  hafenbar: [
    // Friday 20 November 17:00, 17:30, 18:00 in Hamburg and 19:00 in Helsinki: at work at 18:42 Berlin time.
    {
      case: "present now",
      person: "03",
      location: 0,
      begin: "2026-11-20T16:00:00Z",
      end: null,
    },
    {
      case: "present now",
      person: "04",
      location: 0,
      begin: "2026-11-20T16:30:00Z",
      end: null,
    },
    {
      case: "present now",
      person: "06",
      location: 0,
      begin: "2026-11-20T17:00:00Z",
      end: null,
    },
    {
      case: "present now",
      person: "08",
      location: 1,
      begin: "2026-11-20T17:00:00Z",
      end: null,
    },
    // Friday 13 November 22:00 to Saturday 03:30 in Hamburg: over midnight, counts for the 13th.
    {
      case: "over midnight",
      person: "05",
      location: 0,
      begin: "2026-11-13T21:00:00Z",
      end: "2026-11-14T02:30:00Z",
    },
    // Saturday 24 October 21:00 to Sunday 04:00 in Helsinki, where the clock goes back from 04:00 to 03:00.
    {
      case: "autumn change, Helsinki",
      person: "08",
      location: 1,
      begin: "2026-10-24T18:00:00Z",
      end: "2026-10-25T02:00:00Z",
    },
    // In at 02:50 summer time, out at 02:10 winter time on 25 October in Hamburg: 20 minutes.
    {
      case: "repeated hour",
      person: "14",
      location: 0,
      begin: "2026-10-25T00:50:00Z",
      end: "2026-10-25T01:10:00Z",
    },
    // Saturday 12 September 08:00 to Sunday 20:00: the longest shift, 36 hours.
    {
      case: "36 hours",
      person: "03",
      location: 0,
      begin: "2026-09-12T06:00:00Z",
      end: "2026-09-13T18:00:00Z",
    },
    // Saturday 28 March 21:00 to Sunday 04:00 in Hamburg: 6 h, includes the change (-1 h). Lies in the spring dataset only.
    {
      case: "spring change",
      person: "05",
      location: 0,
      begin: "2026-03-28T20:00:00Z",
      end: "2026-03-29T02:00:00Z",
    },
  ],
};

const STARTS: Record<TenantId, readonly string[]> = {
  kranich: ["06:30", "07:00", "08:00", "09:30", "11:00", "13:30"],
  hafenbar: ["16:00", "17:00", "18:00", "19:00", "20:00"],
};
const LENGTH: Record<TenantId, [number, number]> = {
  kranich: [240, 540],
  hafenbar: [300, 540],
};
const RATE: Record<EmploymentType, number> = {
  full_time: 0.62,
  part_time: 0.4,
  marginal: 0.18,
  zero_hours: 0,
};

export const part: SeedPart = (ctx, draft) => {
  const { tenant, scenario, prng, periods } = ctx;
  if (scenario.people === "owner") return;
  const instant = scenario.instant;
  const firstDay = periods[0]!.start;
  const today = localDate(instant, tenant.settings.timeZone);
  let count = 0;
  const nextId = () =>
    `shift_${tenant.id}_${String(++count).padStart(5, "0")}` as ShiftId;
  const personId = (key: string) => `person_${tenant.id}_${key}` as PersonId;

  // Busy intervals per person, so generated shifts keep an hour's distance from scripted ones.
  const taken = new Map<PersonId, Array<[Instant, Instant]>>();
  const take = (p: PersonId, b: Instant, e: Instant) => {
    const list = taken.get(p) ?? [];
    list.push([addMinutes(b, -60), addMinutes(e, 60)]);
    taken.set(p, list);
  };
  const free = (p: PersonId, b: Instant, e: Instant) =>
    !(taken.get(p) ?? []).some(([tb, te]) => b < te && e > tb);

  for (const s of SCRIPTED[tenant.id]) {
    const pid = personId(s.person);
    if (
      !draft.people[pid] ||
      s.begin >= instant ||
      localDate(s.begin, tenant.settings.timeZone) < firstDay
    )
      continue;
    const open = s.end === null || s.end > instant;
    const shift: Shift = {
      id: nextId(),
      personId: pid,
      locationId: tenant.locations[s.location]!.id,
      begin: s.begin,
      end: open ? null : s.end,
      beginSource: "kiosk",
      endSource: open ? null : (s.endSource ?? "kiosk"),
      corrections:
        !open && s.correction && s.correction.at < instant
          ? [{ ...s.correction, by: personId(s.correction.by) }]
          : [],
    };
    draft.shifts[shift.id] = shift;
    take(pid, s.begin, shift.end ?? instant);
  }

  const days: string[] = [];
  for (let d = firstDay; d <= today; d = addDays(d, 1)) days.push(d);

  const shiftOn = (
    pid: PersonId,
    location: Location,
    day: string,
  ): Shift | null => {
    const r = resolveWall(day, prng.pick(STARTS[tenant.id]), location.timeZone);
    if (r.kind !== "exact") return null;
    const [min, max] = LENGTH[tenant.id];
    const end = addMinutes(r.instant, prng.int(min / 15, max / 15) * 15);
    if (end > instant || !free(pid, r.instant, end)) return null;
    return {
      id: "" as ShiftId,
      personId: pid,
      locationId: location.id,
      begin: r.instant,
      end,
      beginSource: "kiosk",
      endSource: "kiosk",
      corrections: [],
    };
  };
  const add = (s: Shift) => {
    const shift = { ...s, id: nextId() };
    draft.shifts[shift.id] = shift;
    take(shift.personId, shift.begin, shift.end ?? instant);
  };

  const people = Object.values(draft.people);
  const roster = people.filter((p) => !p.id.includes("_g"));
  for (const person of roster) {
    const until =
      person.status === "left"
        ? (person.record.employment.leftOn ?? firstDay)
        : person.status === "inactive"
          ? periods[0]!.end
          : today;
    const rate = RATE[person.record.employment.type];
    for (const day of days) {
      if (day > until || !prng.chance(rate)) continue;
      const location = draft.locations[prng.pick(person.locationIds)]!;
      const s = shiftOn(person.id, location, day);
      if (s) add(s);
    }
  }

  // The busy dataset: the generated people share what is left of the 12,000 shifts.
  const generated = people.filter((p) => p.id.includes("_g"));
  if (generated.length === 0) return;
  const remaining = BUSY_SHIFTS - count;
  generated.forEach((person, i) => {
    const want =
      Math.floor(remaining / generated.length) +
      (i < remaining % generated.length ? 1 : 0);
    const order = [...days];
    let made = 0;
    for (let k = 0; k < order.length && made < want; k++) {
      const j = k + prng.int(0, order.length - 1 - k);
      [order[k], order[j]] = [order[j]!, order[k]!];
      const location = draft.locations[person.locationIds[0]!]!;
      const s = shiftOn(person.id, location, order[k]!);
      if (s) {
        add(s);
        made++;
      }
    }
  });
};
