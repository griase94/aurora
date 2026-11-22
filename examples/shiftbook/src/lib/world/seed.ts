/**
 * `seedWorld(tenantId, scenario)` builds a tenant's world before any command:
 * pure, memoised and frozen. It returns the same bytes on every machine, so
 * the server and the first client render agree and two tabs fold the same log
 * over the same state.
 *
 * The part list is a closed registry: it names every area from the first day.
 * A part whose lane has not run adds no rows; that lane fills its own file and
 * never edits this list.
 */
import { hashOf } from "../domain/hash.ts";
import { periodContaining, type PeriodRange } from "../domain/periods.ts";
import { addDays, localDate } from "../domain/time.ts";
import type {
  AccessToken,
  AuditEvent,
  Confirmation,
  Conflict,
  DeviceStatus,
  ImportBatch,
  Location,
  LocationId,
  Period,
  PeriodId,
  Person,
  PersonId,
  Shift,
  ShiftId,
  TenantId,
  TenantSettings,
  TipEntry,
  TipId,
  TokenId,
  WorldState,
} from "../domain/types.ts";
import { createPrng, type Prng } from "./prng.ts";
import { SCENARIOS, type Scenario, type ScenarioId } from "./scenarios.ts";
import { part as devices } from "./seed/devices.ts";
import { part as imports } from "./seed/imports.ts";
import { part as people } from "./seed/people.ts";
import { part as periods } from "./seed/periods.ts";
import { part as shifts } from "./seed/shifts.ts";
import { part as tips } from "./seed/tips.ts";
import { tenantFacts, type TenantFacts } from "./tenants.ts";

/** The world while the parts build it: plain, mutable records. */
export interface Draft {
  settings: TenantSettings;
  locations: Record<LocationId, Location>;
  people: Record<PersonId, Person>;
  tokens: Record<TokenId, AccessToken>;
  shifts: Record<ShiftId, Shift>;
  tips: Record<TipId, TipEntry>;
  periods: Record<PeriodId, Period>;
  confirmations: Confirmation[];
  conflicts: Conflict[];
  devices: Record<LocationId, DeviceStatus>;
  imports: ImportBatch[];
  audit: AuditEvent[];
}

export interface SeedContext {
  tenant: TenantFacts;
  scenario: Scenario;
  /** Seeded from `tenantId + scenario`; parts draw from it in the part list's order. */
  prng: Prng;
  /** The three periods up to the one holding the scenario instant, oldest first. */
  periods: PeriodRange[];
}

export type SeedPart = (ctx: SeedContext, draft: Draft) => void;

/** Every area's part, in the order they run. */
export const SEED_PARTS = {
  people,
  periods,
  shifts,
  tips,
  devices,
  imports,
} as const satisfies Record<string, SeedPart>;

function threePeriods(tenant: TenantFacts, scenario: Scenario): PeriodRange[] {
  const day = tenant.settings.periodStartDay;
  const current = periodContaining(
    localDate(scenario.instant, tenant.settings.timeZone),
    day,
  );
  const previous = periodContaining(addDays(current.start, -1), day);
  const first = periodContaining(addDays(previous.start, -1), day);
  return [first, previous, current];
}

/** Builds a world without the memo or the freeze. Tests use it to prove determinism. */
export function buildWorld(
  tenantId: TenantId,
  scenarioId: ScenarioId,
): WorldState {
  const tenant = tenantFacts(tenantId);
  const scenario = SCENARIOS[scenarioId];
  const ctx: SeedContext = {
    tenant,
    scenario,
    prng: createPrng(`${tenantId}:${scenarioId}`),
    periods: threePeriods(tenant, scenario),
  };
  const draft: Draft = {
    settings: structuredClone(tenant.settings),
    locations: Object.fromEntries(
      tenant.locations.map((l) => [l.id, structuredClone(l)]),
    ) as Draft["locations"],
    people: {} as Draft["people"],
    tokens: {} as Draft["tokens"],
    shifts: {} as Draft["shifts"],
    tips: {} as Draft["tips"],
    periods: {} as Draft["periods"],
    confirmations: [],
    conflicts: [],
    devices: {} as Draft["devices"],
    imports: [],
    audit: [],
  };
  for (const part of Object.values(SEED_PARTS)) part(ctx, draft);
  return draft;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const worlds = new Map<string, WorldState>();
const hashes = new Map<string, string>();

/** The seeded world of a tenant and dataset: pure, memoised and deeply frozen. */
export function seedWorld(
  tenantId: TenantId,
  scenarioId: ScenarioId,
): WorldState {
  const key = `${tenantId}:${scenarioId}`;
  let world = worlds.get(key);
  if (!world) {
    world = deepFreeze(buildWorld(tenantId, scenarioId));
    worlds.set(key, world);
  }
  return world;
}

/** Eight hex characters over the seeded world; the session discards a log stored over another seed. */
export function seedHash(tenantId: TenantId, scenarioId: ScenarioId): string {
  const key = `${tenantId}:${scenarioId}`;
  let hash = hashes.get(key);
  if (!hash) {
    hash = hashOf(seedWorld(tenantId, scenarioId));
    hashes.set(key, hash);
  }
  return hash;
}
