/**
 * Shiftbook's domain model: every entity of the world, the complete command
 * union and the outcome of a command. Pure types: no Svelte, no DOM, no time.
 *
 * The command union is a closed registry: it names every family of the product
 * from the first day. A lane that builds a family fills its handler file
 * (`handlers/<family>.ts`); it never edits this union.
 */

/** UTC, whole minutes: "2026-11-20T17:42:00Z". */
export type Instant = string;
/** A calendar date without a zone: "2026-11-20". */
export type PlainDate = string;
/** A wall-clock time without a date or zone: "18:42". */
export type PlainTime = string;
/** An integer number of minutes. */
export type Minutes = number;
/** An integer amount in the tenant's currency's minor unit (cents for EUR). */
export type MinorUnits = number;

type Id<B extends string> = string & { readonly __id: B };

export const TENANT_IDS = ["kranich", "hafenbar"] as const;
export type TenantId = (typeof TENANT_IDS)[number];

export type PersonId = Id<"person">;
export type ShiftId = Id<"shift">;
export type TipId = Id<"tip">;
export type LocationId = Id<"location">;
export type TokenId = Id<"token">;
/** A period's id is its start date. */
export type PeriodId = Id<"period">;

export const ROLES = ["owner", "manager", "employee"] as const;
export type Role = (typeof ROLES)[number];

export type Lang = "de" | "en";

export interface Address {
  street: string;
  postcode: string;
  city: string;
  country: string;
}

export interface Location {
  id: LocationId;
  name: string;
  timeZone: string;
  address: Address;
}

export const PERSON_STATUSES = ["active", "inactive", "left"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "marginal",
  "zero_hours",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** The personnel record: everything payroll needs about a person. */
export interface PersonnelRecord {
  birthDate: PlainDate;
  address: Address;
  contact: { email: string; phone: string };
  emergencyContact?: { name: string; phone: string };
  employment: {
    type: EmploymentType;
    since: PlainDate;
    leftOn?: PlainDate;
    weeklyMinutes?: Minutes;
  };
  pay: { hourly: MinorUnits };
  tax: { id: string; class: number; healthInsurer?: string };
  bank: { holder: string; iban: string };
}

export const PERSONNEL_FIELD_KEYS = [
  "birthDate",
  "address",
  "contact",
  "emergencyContact",
  "employment",
  "pay",
  "tax",
  "healthInsurer",
  "bank",
] as const;
export type PersonnelFieldKey = (typeof PERSONNEL_FIELD_KEYS)[number];
export type FieldRule = "required" | "optional" | "hidden";

export interface Person {
  id: PersonId;
  /** Personnel number, unique per tenant: "K-0007". */
  number: string;
  givenName: string;
  familyName: string;
  /** What the kiosk shows: given name and initial, "Lena K.". */
  kioskName: string;
  role: Role;
  status: PersonStatus;
  locationIds: LocationId[];
  tipEligible: boolean;
  record: PersonnelRecord;
}

/** What a form submits for a person: the person without the fields the domain owns. */
export type PersonInput = Omit<Person, "id" | "status">;

export const TOKEN_STATUSES = ["active", "locked", "replaced"] as const;
export type TokenStatus = (typeof TOKEN_STATUSES)[number];

export interface AccessToken {
  id: TokenId;
  personId: PersonId;
  kind: "qr" | "nfc";
  /** Opaque: "sb_" and 26 base32 characters. Holds no personal data. */
  code: string;
  status: TokenStatus;
  issuedAt: Instant;
  endedAt?: Instant;
}

export type StampSource = "kiosk" | "offline" | "manual";

export interface Correction {
  at: Instant;
  by: PersonId;
  reason: string;
  changes: Array<{
    field: "begin" | "end";
    from: Instant | null;
    to: Instant | null;
  }>;
}

export interface Shift {
  id: ShiftId;
  personId: PersonId;
  locationId: LocationId;
  begin: Instant;
  end: Instant | null;
  beginSource: StampSource;
  endSource: StampSource | null;
  /** Reserved: assignment to an event or business day is deferred. */
  eventId?: string;
  /** Append-only. */
  corrections: Correction[];
}

export type TipSource =
  | { kind: "manual" }
  | {
      kind: "import";
      batchId: string;
      sourceId: string;
      reference?: string;
      importedAt: Instant;
    };

export interface TipEntry {
  id: TipId;
  personId: PersonId;
  date: PlainDate;
  amount: MinorUnits;
  kind: "cash" | "card";
  shiftId?: ShiftId;
  eventId?: string;
  note?: string;
  source: TipSource;
  removed?: { at: Instant; by: PersonId; reason: string };
  changes: Array<{
    at: Instant;
    by: PersonId;
    reason: string;
    from: MinorUnits;
    to: MinorUnits;
  }>;
}

/** What a form submits for a tip. */
export type TipInput = Pick<
  TipEntry,
  "personId" | "date" | "amount" | "kind" | "shiftId" | "eventId" | "note"
>;

export interface Period {
  id: PeriodId;
  /** Inclusive. */
  start: PlainDate;
  /** Inclusive. */
  end: PlainDate;
  /** Confirmations requested. */
  requestedAt?: Instant;
  closedAt?: Instant;
  closedBy?: PersonId;
  reopenings: Array<{ at: Instant; by: PersonId; reason: string }>;
}

export const PERIOD_STATUSES = [
  "running",
  "review",
  "confirming",
  "closed",
] as const;
/** Derived, never stored: see `periodStatus`. */
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export interface Confirmation {
  personId: PersonId;
  periodId: PeriodId;
  at: Instant;
  method: "button" | "qr" | "nfc";
  /** Eight hex characters over the person's hashed period data (rule 7). */
  version: string;
}

export const CONFIRMATION_STATES = ["none", "confirmed", "stale"] as const;
export type ConfirmationState = (typeof CONFIRMATION_STATES)[number];

export interface Conflict {
  id: string;
  personId: PersonId;
  /** The queued stamp disagrees with a hand-made end, or falls inside a recorded shift. */
  kind: "offline_stamp" | "overlap";
  /** The recorded shift the stamp disagrees with. */
  shiftId: ShiftId;
  stamp: { deviceAt: Instant; receivedAt: Instant; locationId: LocationId };
  /** The one change that applying the stamp would make. */
  proposal: { field: "begin" | "end"; from: Instant | null; to: Instant };
  detectedAt: Instant;
  resolved?: {
    at: Instant;
    by: PersonId;
    choice: "apply" | "discard";
    reason: string;
  };
}

/** The last report of a kiosk tablet (rule 11). */
export interface DeviceStatus {
  locationId: LocationId;
  lastSeenAt: Instant;
  /** Device clock minus scenario clock at the last report; 0 when in step. */
  skewMinutes: number;
  /** Stamps waiting on the device. */
  pending: number;
  /** Deliveries that failed since the last success. */
  failed: number;
  lastFailureAt?: Instant;
}

export interface ImportRow {
  sourceId: string;
  /** The person the row was matched to; absent while unassigned. */
  personId?: PersonId;
  name: string;
  date: PlainDate;
  amount: MinorUnits;
  kind: "cash" | "card";
  reference?: string;
}

/** What the import screen commits: the parsed, matched rows of one file. */
export interface ImportInput {
  fileName: string;
  rows: ImportRow[];
}

export interface ImportBatch {
  id: string;
  fileName: string;
  importedAt: Instant;
  importedBy: PersonId;
  rows: ImportRow[];
  /** Source ids that already existed and were skipped. */
  skipped: string[];
}

export type Actor =
  | { kind: "person"; personId: PersonId; role: Role }
  | { kind: "kiosk"; locationId: LocationId }
  | { kind: "system" };

export type AuditObjectKind =
  | "person"
  | "token"
  | "shift"
  | "tip"
  | "period"
  | "confirmation"
  | "conflict"
  | "device"
  | "settings"
  | "roles"
  | "brand"
  | "import";

export interface AuditChange {
  field: string;
  kind: "instant" | "money" | "text" | "boolean" | "list";
  from: unknown;
  to: unknown;
}

export interface AuditEvent {
  id: string;
  at: Instant;
  actor: Actor;
  /** "stamp.in", "shift.correct", "tip.add", "period.close", … */
  action: string;
  object: { kind: AuditObjectKind; id: string };
  changes?: AuditChange[];
  reason?: string;
  origin: {
    surface: "admin" | "kiosk" | "phone";
    offline?: { deviceAt: Instant; receivedAt: Instant };
  };
}

/** The mutable part of a tenant: period start, thresholds, roles, field config, wording. */
export interface TenantSettings {
  /** The tenant's primary zone: "today", period edges, exports. */
  timeZone: string;
  currency: "EUR";
  /** 1 to 31; a day a month lacks is clamped to the month's last day (rule 6). */
  periodStartDay: number;
  openShiftWarningHours: number;
  scanRepeatSeconds: number;
  clockSkewWarningMinutes: number;
  /** The one permission switch the owner holds. */
  managerMayClose: boolean;
  personnelFields: Record<PersonnelFieldKey, FieldRule>;
  /** The tenant's own words for staff, location and roles, per language. */
  wording: Partial<Record<Lang, Record<string, string>>>;
}

export interface WorldState {
  readonly settings: TenantSettings;
  readonly locations: Readonly<Record<LocationId, Location>>;
  readonly people: Readonly<Record<PersonId, Person>>;
  readonly tokens: Readonly<Record<TokenId, AccessToken>>;
  readonly shifts: Readonly<Record<ShiftId, Shift>>;
  readonly tips: Readonly<Record<TipId, TipEntry>>;
  readonly periods: Readonly<Record<PeriodId, Period>>;
  readonly confirmations: readonly Confirmation[];
  readonly conflicts: readonly Conflict[];
  readonly devices: Readonly<Record<LocationId, DeviceStatus>>;
  readonly imports: readonly ImportBatch[];
  /** Append-only. */
  readonly audit: readonly AuditEvent[];
}

/** Every command of the product. Closed: a family's lane fills its handler, never this union. */
export type Command =
  | {
      type: "stamp";
      code: string;
      locationId: LocationId;
      offline?: { deviceAt: Instant; key: string };
    }
  | { type: "person.create"; record: PersonInput }
  | { type: "person.update"; id: PersonId; record: PersonInput }
  | {
      type: "person.setStatus";
      id: PersonId;
      status: PersonStatus;
      leftOn?: PlainDate;
    }
  | {
      type: "token.issue";
      personId: PersonId;
      kind: "qr" | "nfc";
      code?: string;
    }
  | { type: "token.lock"; id: TokenId }
  | { type: "token.replace"; id: TokenId }
  | {
      type: "shift.correct";
      id: ShiftId;
      begin: Instant;
      end: Instant | null;
      reason: string;
    }
  | {
      type: "shift.add";
      personId: PersonId;
      locationId: LocationId;
      begin: Instant;
      end: Instant;
      reason: string;
    }
  | {
      type: "conflict.resolve";
      id: string;
      choice: "apply" | "discard";
      reason: string;
    }
  | {
      type: "device.report";
      locationId: LocationId;
      deviceNow: Instant;
      pending: number;
      failed: number;
    }
  | { type: "tip.add"; entry: TipInput }
  | { type: "tip.change"; id: TipId; amount: MinorUnits; reason: string }
  | { type: "tip.remove"; id: TipId; reason: string }
  | { type: "import.commit"; batch: ImportInput }
  | { type: "period.requestConfirmations"; id: PeriodId }
  | { type: "period.close"; id: PeriodId }
  | { type: "period.reopen"; id: PeriodId; reason: string }
  | {
      type: "confirmation.confirm";
      periodId: PeriodId;
      method: Confirmation["method"];
    }
  | { type: "settings.update"; patch: Partial<TenantSettings> }
  | { type: "roles.update"; managerMayClose: boolean };

export type CommandType = Command["type"];

/** A command's family: the part of its type before the dot ("shift.correct" → "shift"). */
export type FamilyOf<T extends string> = T extends `${infer F}.${string}`
  ? F
  : T;
export type Family = FamilyOf<CommandType>;

/** The commands of one family. */
export type CommandOf<F extends Family> = Extract<
  Command,
  { type: F | `${F}.${string}` }
>;

export interface ApplyContext {
  /** From the scenario clock; truncated to its minute by `apply`. */
  now: Instant;
  actor: Actor;
  /**
   * Deterministic: derived from the envelope's place in the log
   * ("shift_000412_1"), so every tab mints the same id for the same envelope.
   */
  newId(kind: string): string;
  /**
   * Token codes, the only randomness. Drawn once by the committing tab, stored
   * in the envelope's `codes` and read back from there on every replay.
   */
  newCode(): string;
}

export type RefusalCode =
  | "forbidden"
  | "not_found"
  | "invalid"
  | "unknown_token"
  | "locked_token"
  | "inactive_person"
  | "duplicate_scan"
  | "overlap"
  | "closed_period"
  | "blocked"
  /**
   * Transient: the (simulated) network refused and nothing changed. `apply`
   * never returns it; the session does. Trying again is the right answer.
   */
  | "unavailable";

/** One shape for every error a form can show. With a field it belongs at the field. */
export interface Refusal {
  code: RefusalCode;
  field?: string;
  detail?: Record<string, string | number>;
}

export type StampResult =
  | { kind: "in"; person: PersonId; shift: ShiftId; at: Instant }
  | {
      kind: "out";
      person: PersonId;
      shift: ShiftId;
      at: Instant;
      worked: Minutes;
    };

export type Outcome =
  | {
      ok: true;
      state: WorldState;
      events: AuditEvent[];
      result?: StampResult | { id: string };
    }
  | { ok: false; refusal: Refusal };
