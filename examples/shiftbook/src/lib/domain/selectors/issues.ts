/**
 * `issues`: what is wrong, in one list. It is the data behind "Needs
 * attention" and behind the blockers of a period. Every area contributes its
 * own cases from its own file; this file only names the sources and orders
 * the result. The source list is a closed registry: complete from the first
 * day, so a lane fills its own source and never edits this list.
 */
import type {
  Instant,
  LocationId,
  PeriodId,
  PersonId,
  WorldState,
} from "../types.ts";
import { unassignedImportIssues } from "./imports.ts";
import { clockSkewIssues, syncFailedIssues } from "./devices.ts";
import { staleConfirmationIssues } from "./periods.ts";
import { conflictIssues, openTooLongIssues } from "./shifts.ts";

export const ISSUE_KINDS = [
  "open_too_long",
  "conflict",
  "stale_confirmation",
  "clock_skew",
  "sync_failed",
  "unassigned_import",
] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

/** A screen by the id of its matrix definition ("shifts", "changes", "period", …); the navigation turns it into a link. */
export type ScreenId = string;

export interface Issue {
  id: string;
  kind: IssueKind;
  severity: "blocks_closing" | "warn";
  since: Instant;
  personId?: PersonId;
  locationId?: LocationId;
  periodId?: PeriodId;
  count?: number;
  /** Where the fix is: a screen with its filter in the query, or a dialog to open on it. */
  fix: {
    screen: ScreenId;
    params?: Record<string, string>;
    query?: Record<string, string>;
    open?: "correction" | "conflict";
  };
}

export type IssueSource = (state: WorldState, now: Instant) => Issue[];

/** Every kind's source. A missing kind is a type error. */
export const ISSUE_SOURCES: { readonly [K in IssueKind]: IssueSource } = {
  open_too_long: openTooLongIssues,
  conflict: conflictIssues,
  stale_confirmation: staleConfirmationIssues,
  clock_skew: clockSkewIssues,
  sync_failed: syncFailedIssues,
  unassigned_import: unassignedImportIssues,
};

/** Every source's issues: blockers first, then the oldest first. */
export function issues(state: WorldState, now: Instant): Issue[] {
  return orderIssues(
    Object.values(ISSUE_SOURCES).flatMap((source) => source(state, now)),
  );
}

/** Blockers first, then the oldest first, then by id so the order never depends on the sources' order. */
export function orderIssues(list: readonly Issue[]): Issue[] {
  const rank = (i: Issue) => (i.severity === "blocks_closing" ? 0 : 1);
  return [...list].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.since.localeCompare(b.since) ||
      a.id.localeCompare(b.id),
  );
}
