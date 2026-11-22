/**
 * Figures: the numbers Today shows. `periodSummary` asks each area for its
 * figure; an area that has not answered yet gives `null`, and the screen shows
 * a figure only when it is not `null`.
 */
import { periodById, periodOfShift } from "../periods.ts";
import { minutesBetween } from "../time.ts";
import type {
  Instant,
  MinorUnits,
  Minutes,
  PeriodId,
  WorldState,
} from "../types.ts";
import { confirmedSummary } from "./periods.ts";
import { presentNow } from "./shifts.ts";
import { tipsTotal } from "./tips.ts";

export interface PeriodSummary {
  /** Recorded time in the period, in minutes: closed shifts only, so the figure never runs. */
  hours: Minutes;
  /** People at work now. */
  present: number;
  tips: MinorUnits | null;
  confirmed: { done: number; total: number } | null;
}

export function periodSummary(
  state: WorldState,
  periodId: PeriodId,
  now: Instant,
): PeriodSummary {
  const period = periodById(state, periodId);
  let hours = 0;
  if (period) {
    for (const shift of Object.values(state.shifts)) {
      if (shift.end === null) continue;
      const zone =
        state.locations[shift.locationId]?.timeZone ?? state.settings.timeZone;
      if (
        periodOfShift(shift, zone, state.settings.periodStartDay).start !==
        period.start
      )
        continue;
      hours += minutesBetween(shift.begin, shift.end);
    }
  }
  return {
    hours,
    present: presentNow(state, now).length,
    tips: tipsTotal(state, periodId),
    confirmed: confirmedSummary(state, periodId),
  };
}
