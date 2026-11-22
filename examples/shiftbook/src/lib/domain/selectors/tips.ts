/**
 * Tip selectors. Filled when the tips area is built.
 */
import type { MinorUnits, PeriodId, WorldState } from "../types.ts";

/** The period's tips in minor units. `null` until the tips lane answers. */
export function tipsTotal(
  _state: WorldState,
  _periodId: PeriodId,
): MinorUnits | null {
  return null;
}
