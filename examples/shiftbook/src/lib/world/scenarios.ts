/**
 * The datasets. `evening` is the default and the only one the app prerenders;
 * the others are chosen in the demo and live in the session.
 */
import type { Instant } from "../domain/types.ts";

export const SCENARIO_IDS = [
  "evening",
  "empty",
  "review",
  "busy",
  "dst-autumn",
  "dst-spring",
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export interface Scenario {
  id: ScenarioId;
  /** The scenario clock starts here. */
  instant: Instant;
  /** `owner`: only the owner (a business on its first day). `roster`: the hand-written roster. `busy`: the roster plus generated people. */
  people: "owner" | "roster" | "busy";
  /** One line for the demo's dataset picker. */
  summary: string;
}

/** Friday 20 November 2026, 18:42 in Berlin. */
export const SCENARIO_INSTANT: Instant = "2026-11-20T17:42:00Z";

export const SCENARIOS: Readonly<Record<ScenarioId, Scenario>> = {
  evening: {
    id: "evening",
    instant: SCENARIO_INSTANT,
    people: "roster",
    summary:
      "An ordinary Friday evening: people at work, one shift open too long.",
  },
  empty: {
    id: "empty",
    instant: SCENARIO_INSTANT,
    people: "owner",
    summary: "A business on its first day: every list is empty.",
  },
  review: {
    id: "review",
    // Saturday 21 November 2026, 08:30 in Berlin: the morning after Café Kranich's period ended.
    instant: "2026-11-21T07:30:00Z",
    people: "roster",
    summary: "The morning after a period ended.",
  },
  busy: {
    id: "busy",
    instant: SCENARIO_INSTANT,
    people: "busy",
    summary: "A busy season: 400 people and 12,000 shifts.",
  },
  "dst-autumn": {
    id: "dst-autumn",
    // Sunday 25 October 2026, 02:52 summer time in Berlin: eight minutes before the clock goes back.
    instant: "2026-10-25T00:52:00Z",
    people: "roster",
    summary: "A night a few minutes before the clock goes back.",
  },
  "dst-spring": {
    id: "dst-spring",
    // Sunday 29 March 2026, 01:55 winter time in Berlin: five minutes before the clock jumps forward.
    instant: "2026-03-29T00:55:00Z",
    people: "roster",
    summary: "A night a few minutes before the clock jumps forward.",
  },
};
