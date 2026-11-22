/**
 * Period selectors. The confirmation figures and the stale-confirmation
 * issues are filled when the periods area is built.
 */
import type { PeriodId, WorldState } from "../types.ts";
import type { IssueSource } from "./issues.ts";

/** Confirmations that no longer match the period's data. Not built: the periods lane fills it. */
export const staleConfirmationIssues: IssueSource = () => [];

/** How many people confirmed a period, of how many must. `null` until the periods lane answers. */
export function confirmedSummary(
  _state: WorldState,
  _periodId: PeriodId,
): { done: number; total: number } | null {
  return null;
}
