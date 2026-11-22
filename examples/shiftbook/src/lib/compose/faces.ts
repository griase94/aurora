/**
 * Faces: the one place a domain state gets its tone, mark and message, so two
 * screens can never disagree. Complete from the first day: a lane uses the
 * faces of its states and adds none.
 *
 * Colour marks the exception. The normal state of a person, a badge and a
 * running period has no pill (`tone: null`); a list where everything is normal
 * shows no pill at all. Status tones carry product meaning and no brand
 * recolours them.
 *
 * `message` is a key of the `faces` message family; the words live with the
 * app's messages, never here.
 */
import type {
  ConfirmationState,
  PeriodStatus,
  PersonStatus,
  TokenStatus,
} from "../domain/types.ts";
import type { IssueKind } from "../domain/selectors/issues.ts";
import type { ShiftState } from "../domain/selectors/shifts.ts";

export type Tone =
  "open" | "warn" | "neutral" | "success" | "info" | "critical";

/** The glyphs a face may carry; an icon of the kit stands for each. */
export type Mark =
  | "ring"
  | "clock-alert"
  | "split"
  | "pencil"
  | "lock"
  | "door-enter"
  | "door-exit"
  | "cloud-off";

export interface Face {
  /** `null`: the normal state, shown without a pill. */
  tone: Tone | null;
  mark: Mark | null;
  /** Shown as the kit's neutral classification chip (Badge) instead of a status pill. */
  badge?: true;
  /** A key of the `faces` message family. */
  message: string;
}

/** What the kiosk answered to a scan. */
export const KIOSK_RESULTS = ["in", "out", "repeat", "unknown"] as const;
export type KioskResult = (typeof KIOSK_RESULTS)[number];

/** A shift's state, or that it carries a correction or waits on a decision. */
export type ShiftFaceKey = ShiftState | "conflict" | "corrected";

const f = (
  tone: Tone | null,
  mark: Mark | null,
  message: string,
  badge?: true,
): Face => ({
  tone,
  mark,
  message,
  ...(badge ? { badge } : {}),
});

export const SHIFT_FACES: Readonly<Record<ShiftFaceKey, Face>> = {
  open: f("open", "ring", "shiftOpen"),
  warning: f("warn", "clock-alert", "shiftOpenTooLong"),
  closed: f(null, null, "shiftClosed"),
  conflict: f("warn", "split", "shiftConflict"),
  // No tone: the kit's neutral Badge, because a correction classifies, it does not alarm.
  corrected: f(null, "pencil", "shiftCorrected", true),
};

export const PERSON_FACES: Readonly<Record<PersonStatus, Face>> = {
  active: f(null, null, "personActive"),
  inactive: f("neutral", null, "personInactive"),
  left: f("neutral", null, "personLeft"),
};

export const TOKEN_FACES: Readonly<Record<TokenStatus, Face>> = {
  active: f(null, null, "tokenActive"),
  locked: f("neutral", "lock", "tokenLocked"),
  replaced: f("neutral", null, "tokenReplaced"),
};

export const PERIOD_FACES: Readonly<Record<PeriodStatus, Face>> = {
  running: f(null, null, "periodRunning"),
  review: f("warn", null, "periodReview"),
  confirming: f("info", null, "periodConfirming"),
  closed: f("neutral", "lock", "periodClosed"),
};

export const CONFIRMATION_FACES: Readonly<Record<ConfirmationState, Face>> = {
  none: f("neutral", null, "confirmationNone"),
  confirmed: f("success", null, "confirmationConfirmed"),
  stale: f("warn", null, "confirmationStale"),
};

/** The kiosk's four answers differ in field, word and glyph, not in colour alone. */
export const KIOSK_FACES: Readonly<Record<KioskResult, Face>> = {
  in: f("success", "door-enter", "kioskIn"),
  out: f("info", "door-exit", "kioskOut"),
  repeat: f("warn", null, "kioskRepeat"),
  unknown: f("critical", null, "kioskUnknown"),
};

export const ISSUE_FACES: Readonly<Record<IssueKind, Face>> = {
  open_too_long: f("warn", "clock-alert", "issueOpenTooLong"),
  conflict: f("warn", "split", "issueConflict"),
  stale_confirmation: f("warn", null, "issueStaleConfirmation"),
  clock_skew: f("warn", "clock-alert", "issueClockSkew"),
  sync_failed: f("warn", "cloud-off", "issueSyncFailed"),
  unassigned_import: f("warn", null, "issueUnassignedImport"),
};

/** Every face by domain, for screens and for the registry test. */
export const faces = {
  shift: (key: ShiftFaceKey): Face => SHIFT_FACES[key],
  person: (status: PersonStatus): Face => PERSON_FACES[status],
  token: (status: TokenStatus): Face => TOKEN_FACES[status],
  period: (status: PeriodStatus): Face => PERIOD_FACES[status],
  confirmation: (state: ConfirmationState): Face => CONFIRMATION_FACES[state],
  kiosk: (result: KioskResult): Face => KIOSK_FACES[result],
  issue: (kind: IssueKind): Face => ISSUE_FACES[kind],
} as const;

/** The face tables by domain. */
export const FACE_TABLES = {
  shift: SHIFT_FACES,
  person: PERSON_FACES,
  token: TOKEN_FACES,
  period: PERIOD_FACES,
  confirmation: CONFIRMATION_FACES,
  kiosk: KIOSK_FACES,
  issue: ISSUE_FACES,
} as const;
