/**
 * The scenario clock: the only reads of real time in the app.
 *
 * The session counts minutes: live, `offsetMinutes + (realNow − startedAtMs)`;
 * frozen, `offsetMinutes` alone, so time moves only by `advance`. A tenant's
 * clock is its dataset's instant plus the session minutes since the dataset
 * began (`baseMinutes`), so a dataset switch starts at the dataset's own
 * instant. All inputs are shared through the stored meta, so every tab of a
 * tenant shows the same time. Until the session restores, the clock stands at
 * the dataset's instant, so the server's HTML and the first client render
 * agree.
 *
 * A change (advance, freeze, resume) is relative: the session applies it to
 * the stored state inside the lock, so a tab that has not heard of another
 * tab's change never overwrites it.
 */
import { instantMs, toMinuteInstant } from "../domain/time.ts";
import type { Instant } from "../domain/types.ts";
import type { ClockMeta } from "./store.ts";

const MINUTE = 60_000;

export interface Clock {
  /** The scenario's current moment; what the app passes to the kit as `now`. */
  now(): Date;
  /** The current scenario minute; changes once per minute while live. */
  readonly instant: Instant;
  readonly mode: "live" | "frozen";
  /** Moves the scenario forward; a negative or zero step is refused. */
  advance(minutes: number): void;
  freeze(): void;
  resume(): void;
  /** Called whenever `instant` or `mode` changes. */
  subscribe(fn: () => void): () => void;
}

/** What the session uses beyond the public interface. */
export interface SessionClock extends Clock {
  /** Adopts the stored state: after restore, and when another tab changed it. */
  configure(o: {
    start: Instant;
    clock: ClockMeta;
    startedAtMs: number;
    baseMinutes?: number;
  }): void;
  /** The minute tick stops while the page is hidden. */
  setVisible(visible: boolean): void;
  /** Stops the tick for good. */
  stop(): void;
}

/** The scenario time in milliseconds for a stored clock state at a real time. */
export function scenarioMs(
  start: Instant,
  clock: ClockMeta,
  startedAtMs: number,
  realMs: number,
  baseMinutes = 0,
): number {
  const at = instantMs(start) + (clock.offsetMinutes - baseMinutes) * MINUTE;
  return clock.mode === "live" ? at + Math.max(0, realMs - startedAtMs) : at;
}

/** Whole session minutes at a real time, as a stored clock state counts them. Never decreases. */
export function sessionMinutes(
  clock: ClockMeta,
  startedAtMs: number,
  realMs: number,
): number {
  return (
    clock.offsetMinutes +
    (clock.mode === "live"
      ? Math.floor(Math.max(0, realMs - startedAtMs) / MINUTE)
      : 0)
  );
}

/** A change of the stored clock, applied to whatever is stored when the lock is held. */
export type ClockChange = (
  clock: ClockMeta,
  startedAtMs: number,
  realMs: number,
) => ClockMeta;

export const advanced =
  (minutes: number): ClockChange =>
  (c) => ({ ...c, offsetMinutes: c.offsetMinutes + minutes });

export const frozen: ClockChange = (c, startedAtMs, realMs) =>
  c.mode === "frozen"
    ? c
    : { mode: "frozen", offsetMinutes: sessionMinutes(c, startedAtMs, realMs) };

export const resumed: ClockChange = (c, startedAtMs, realMs) =>
  c.mode === "live"
    ? c
    : {
        mode: "live",
        offsetMinutes:
          c.offsetMinutes -
          Math.floor(Math.max(0, realMs - startedAtMs) / MINUTE),
      };

export function createClock(o: {
  start: Instant;
  /** Real time in milliseconds; the default reads the device. */
  nowMs?: () => number;
  /**
   * Called with the change when this tab changes the clock, so the session
   * applies it to the stored state and configures the clock with the result.
   */
  onChange?: (change: ClockChange) => void;
}): SessionClock {
  const realNow = o.nowMs ?? (() => Date.now());
  let start = o.start;
  let state: ClockMeta = { mode: "frozen", offsetMinutes: 0 };
  let startedAtMs = 0;
  let baseMinutes = 0;
  let visible = true;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const nowMs = () =>
    scenarioMs(start, state, startedAtMs, realNow(), baseMinutes);
  let instant = toMinuteInstant(nowMs());

  const refresh = () => {
    const next = toMinuteInstant(nowMs());
    if (next !== instant) {
      instant = next;
      for (const fn of listeners) fn();
    }
  };

  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (stopped || !visible || state.mode !== "live") return;
    const intoMinute = (realNow() - startedAtMs) % MINUTE;
    timer = setTimeout(
      () => {
        timer = undefined;
        refresh();
        schedule();
      },
      MINUTE - (intoMinute < 0 ? 0 : intoMinute),
    );
  };

  /** Shows the change in this tab at once; the stored result follows through `configure`. */
  const change = (c: ClockChange) => {
    state = c(state, startedAtMs, realNow());
    o.onChange?.(c);
    refresh();
    for (const fn of listeners) fn();
    schedule();
  };

  return {
    now: () => new Date(nowMs()),
    get instant() {
      return instant;
    },
    get mode() {
      return state.mode;
    },
    advance(minutes) {
      if (!(minutes > 0) || !Number.isInteger(minutes))
        throw new RangeError("the clock moves forward by whole minutes only");
      change(advanced(minutes));
    },
    // No early return on this tab's own mode: it may not have heard of
    // another tab's change yet, and both changes are idempotent.
    freeze: () => change(frozen),
    resume: () => change(resumed),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    configure(c) {
      const modeChanged = c.clock.mode !== state.mode;
      start = c.start;
      state = { ...c.clock };
      startedAtMs = c.startedAtMs;
      baseMinutes = c.baseMinutes ?? 0;
      const before = instant;
      refresh();
      if (modeChanged && before === instant) for (const fn of listeners) fn();
      schedule();
    },
    setVisible(v) {
      visible = v;
      if (v) refresh();
      schedule();
    },
    stop() {
      stopped = true;
      schedule();
    },
  };
}
