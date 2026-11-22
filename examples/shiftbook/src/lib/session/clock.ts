/**
 * The scenario clock: the only reads of real time in the app.
 *
 * Live: `now = start + offsetMinutes + (realNow − startedAtMs)`, the same in
 * every tab because the three inputs are shared through the stored meta.
 * Frozen: `now = start + offsetMinutes`; time moves only by `advance`.
 * Until the session restores, the clock stands at the dataset's instant, so
 * the server's HTML and the first client render agree.
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
  configure(o: { start: Instant; clock: ClockMeta; startedAtMs: number }): void;
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
): number {
  const base = instantMs(start) + clock.offsetMinutes * MINUTE;
  return clock.mode === "live"
    ? base + Math.max(0, realMs - startedAtMs)
    : base;
}

/** Whole minutes since the start, as a stored clock state counts them. */
function elapsedMinutes(
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

export function createClock(o: {
  start: Instant;
  /** Real time in milliseconds; the default reads the device. */
  nowMs?: () => number;
  /** Called with the new state when this tab changes the clock, so the session can store it. */
  onChange?: (clock: ClockMeta) => void;
}): SessionClock {
  const realNow = o.nowMs ?? (() => Date.now());
  let start = o.start;
  let state: ClockMeta = { mode: "frozen", offsetMinutes: 0 };
  let startedAtMs = 0;
  let visible = true;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const nowMs = () => scenarioMs(start, state, startedAtMs, realNow());
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

  const change = (next: ClockMeta) => {
    state = next;
    o.onChange?.(next);
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
      change({ ...state, offsetMinutes: state.offsetMinutes + minutes });
    },
    freeze() {
      if (state.mode === "frozen") return;
      change({
        mode: "frozen",
        offsetMinutes: elapsedMinutes(state, startedAtMs, realNow()),
      });
    },
    resume() {
      if (state.mode === "live") return;
      const passed = Math.floor(Math.max(0, realNow() - startedAtMs) / MINUTE);
      change({ mode: "live", offsetMinutes: state.offsetMinutes - passed });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    configure(c) {
      const modeChanged = c.clock.mode !== state.mode;
      start = c.start;
      state = { ...c.clock };
      startedAtMs = c.startedAtMs;
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
