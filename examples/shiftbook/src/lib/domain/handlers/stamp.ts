/**
 * The `stamp` family: rules 1 (stamp), 2 (minute-exact) and 3 (open shifts).
 * The code resolves to a token, the token to a person; an open shift ends now,
 * else a shift begins now. The employee chooses nothing.
 *
 * Offline stamps (rule 9) arrive with the kiosk's outbox and are not built yet.
 */
import { refuse, type Handler } from "../handler.ts";
import { can } from "../permissions.ts";
import { minutesBetween } from "../time.ts";
import type {
  CommandOf,
  Instant,
  Shift,
  ShiftId,
  WorldState,
} from "../types.ts";

/** The person's last accepted stamp: the latest begin or end a scan recorded. */
function lastStamp(
  state: WorldState,
  personId: Shift["personId"],
): { kind: "in" | "out"; at: Instant; shift: ShiftId } | null {
  let last: { kind: "in" | "out"; at: Instant; shift: ShiftId } | null = null;
  for (const s of Object.values(state.shifts)) {
    if (s.personId !== personId) continue;
    if (s.beginSource !== "manual" && (!last || s.begin > last.at))
      last = { kind: "in", at: s.begin, shift: s.id };
    if (
      s.end &&
      s.endSource &&
      s.endSource !== "manual" &&
      (!last || s.end > last.at)
    )
      last = { kind: "out", at: s.end, shift: s.id };
  }
  return last;
}

export const handle: Handler<CommandOf<"stamp">> = (state, command, ctx) => {
  const allowed = can(state, ctx.actor, "stamp");
  if (allowed !== true) return { ok: false, refusal: allowed };
  if (command.offline)
    return refuse("invalid", undefined, {
      reason: "not built",
      family: "stamp.offline",
    });
  if (!state.locations[command.locationId])
    return refuse("not_found", "locationId");

  const token = Object.values(state.tokens).find(
    (t) => t.code === command.code,
  );
  if (!token) return refuse("unknown_token", "code");
  if (token.status !== "active")
    return refuse("locked_token", "code", { status: token.status });
  const person = state.people[token.personId];
  if (!person) return refuse("unknown_token", "code");
  if (person.status !== "active")
    return refuse("inactive_person", "code", { status: person.status });

  const now = ctx.now;
  const last = lastStamp(state, person.id);
  if (
    last &&
    minutesBetween(last.at, now) * 60 < state.settings.scanRepeatSeconds
  )
    return refuse("duplicate_scan", "code", {
      previous: last.kind,
      at: last.at,
      shift: last.shift,
    });

  const open = Object.values(state.shifts).find(
    (s) => s.personId === person.id && s.end === null,
  );
  if (open) {
    const ended: Shift = { ...open, end: now, endSource: "kiosk" };
    const worked = minutesBetween(open.begin, now);
    return {
      ok: true,
      state: { ...state, shifts: { ...state.shifts, [open.id]: ended } },
      events: [
        ctx.event({
          action: "stamp.out",
          object: { kind: "shift", id: open.id },
          changes: [{ field: "end", kind: "instant", from: null, to: now }],
        }),
      ],
      result: {
        kind: "out",
        person: person.id,
        shift: open.id,
        at: now,
        worked,
      },
    };
  }

  const id = ctx.newId("shift") as ShiftId;
  const shift: Shift = {
    id,
    personId: person.id,
    locationId: command.locationId,
    begin: now,
    end: null,
    beginSource: "kiosk",
    endSource: null,
    corrections: [],
  };
  return {
    ok: true,
    state: { ...state, shifts: { ...state.shifts, [id]: shift } },
    events: [
      ctx.event({
        action: "stamp.in",
        object: { kind: "shift", id },
        changes: [{ field: "begin", kind: "instant", from: null, to: now }],
      }),
    ],
    result: { kind: "in", person: person.id, shift: id, at: now },
  };
};
