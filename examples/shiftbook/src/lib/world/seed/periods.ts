/**
 * The seed's `periods` part: the three periods up to the one holding the
 * scenario instant. Café Kranich's earlier periods are closed; Hafenbar Nord
 * has closed September and is collecting confirmations for October.
 * The empty dataset holds only the running period.
 */
import { newPeriod } from "../../domain/periods.ts";
import { addDays } from "../../domain/time.ts";
import type { Period, PersonId } from "../../domain/types.ts";
import { ROSTERS } from "../people.ts";
import type { SeedPart } from "../seed.ts";

/** Hafenbar Nord asked its crew to confirm October on this morning. */
export const HAFENBAR_OCTOBER_REQUESTED = "2026-11-02T09:00:00Z";

export const part: SeedPart = ({ tenant, scenario, periods }, draft) => {
  const owner = ROSTERS[tenant.id].find((r) => r.role === "owner");
  const ownerId = `person_${tenant.id}_${owner?.key ?? "01"}` as PersonId;
  const list = scenario.people === "owner" ? periods.slice(-1) : periods;
  const current = periods[periods.length - 1]!;

  for (const range of list) {
    let period: Period = newPeriod(range);
    const isCurrent = range.start === current.start;
    if (!isCurrent && scenario.people !== "owner") {
      const closedAt = `${addDays(range.end, 4)}T09:00:00Z`;
      const isHafenbarOctober =
        tenant.id === "hafenbar" && range.start.endsWith("-10-01");
      if (isHafenbarOctober && HAFENBAR_OCTOBER_REQUESTED < scenario.instant)
        period = { ...period, requestedAt: HAFENBAR_OCTOBER_REQUESTED };
      else if (!isHafenbarOctober && closedAt < scenario.instant)
        period = { ...period, closedAt, closedBy: ownerId };
    }
    draft.periods[period.id] = period;
  }
};
