/**
 * The session store: the one documented storage format, and the seam between
 * the browser (`localStorage` with the Web Locks API) and memory (SSR and unit
 * tests). Both adapters run the same code over a key-value surface; they
 * differ only in where the bytes live and in what serialises the writers.
 *
 * The keys:
 *
 *   shiftbook.v1.meta                          SessionMeta
 *   shiftbook.v1.head.<tenant>                 { epoch, seq }   the last envelope written
 *   shiftbook.v1.log.<tenant>.<epoch>.<seq>    Envelope         one key per accepted command
 *
 * Every write happens inside `transact`, which runs alone across every tab of
 * the origin. Reads outside it (`readMeta`, `readHead`, `readLog`) are how a
 * tab catches up after another tab's message.
 */
import type {
  Actor,
  Command,
  Instant,
  Lang,
  LocationId,
  PersonId,
  TenantId,
} from "../domain/types.ts";
import type { ScenarioId } from "../world/scenarios.ts";

export const SCHEMA_VERSION = 1;
const PREFIX = "shiftbook.v1.";

export const KEYS = {
  meta: `${PREFIX}meta`,
  head: (tenant: TenantId) => `${PREFIX}head.${tenant}`,
  log: (tenant: TenantId, epoch: number, seq: number) =>
    `${PREFIX}log.${tenant}.${epoch}.${seq}`,
  /** Every log key of a tenant starts with this. */
  logPrefix: (tenant: TenantId) => `${PREFIX}log.${tenant}.`,
} as const;

/** At most this many envelopes per tenant and epoch, so the log fits the storage quota; a commit beyond it is refused. */
export const LOG_CAP = 2000;

/** A session older than this much real time starts over. */
export const EXPIRY_MS = 12 * 60 * 60 * 1000;

export type PersonaRef =
  | { kind: "person"; personId: PersonId }
  | { kind: "kiosk"; locationId: LocationId };

export interface SessionPrefs {
  mode?: "light" | "dark" | "system";
  dir?: "ltr" | "rtl";
  pseudo?: boolean;
  /** The kiosk queues stamps as if the network were gone. */
  offline?: boolean;
  /** "Slow network": every commit and every load takes this long. */
  latencyMs?: number;
  /** The next commit resolves `unavailable`, then the switch clears itself. */
  failNextSave?: boolean;
  /** The next load ends in `error`, then the switch clears itself. */
  failNextLoad?: boolean;
  /** The kiosk tablet's own clock runs this far ahead of the scenario clock. */
  kioskSkewMinutes?: number;
}

export interface TenantMeta {
  scenario: ScenarioId;
  /** The hash of the seed the log was written over; another hash discards the log. */
  seedHash: string;
  /**
   * The session minute at which this dataset began. The tenant's clock is the
   * dataset's instant plus the session minutes since, so every dataset starts
   * at its own instant. Absent means 0.
   */
  clockBaseMinutes?: number;
  persona?: PersonaRef;
  recent?: PersonaRef[];
  /** The brand studio's override, opaque to the session; the app shell reads it. */
  brand?: Readonly<Record<string, unknown>>;
  language?: Lang;
}

export interface ClockMeta {
  mode: "live" | "frozen";
  /** Scenario minutes added to the dataset's instant by time travel. */
  offsetMinutes: number;
}

export interface SessionMeta {
  v: 1;
  /**
   * Drawn when the meta is written afresh (first visit, expiry, reset, a
   * cleared storage). Epochs count within one session id, so a tab that
   * folded another session's log notices even when the epoch numbers repeat.
   */
  id: string;
  /** Real time of the first visit; older than 12 hours resets the session. */
  startedAtMs: number;
  /**
   * The newest app build that wrote the session (its ordinal, such as the build
   * time); absent means 0. A tab of an older build writes nothing.
   */
  build?: number;
  clock: ClockMeta;
  tenants: Partial<Record<TenantId, TenantMeta>>;
  prefs: SessionPrefs;
}

/** One accepted command, as the log stores it. */
export interface Envelope {
  seq: number;
  id: string;
  /** The scenario instant of the commit, to the minute. */
  at: Instant;
  actor: Actor;
  command: Command;
  /** The token codes the command drew, read back on every replay. */
  codes?: string[];
}

export interface Head {
  epoch: number;
  seq: number;
}

/**
 * What the stored meta is: absent, written by another schema (or unreadable),
 * or ours. A meta of another schema still names the build that wrote it, when
 * it can be read, so an older tab never clears a newer build's session.
 */
export type MetaRead =
  | { kind: "none" }
  | { kind: "mismatch"; build: number }
  | { kind: "ok"; meta: SessionMeta };

const buildOf = (v: unknown): number =>
  isObject(v) && typeof v.build === "number" && Number.isFinite(v.build)
    ? v.build
    : 0;

/** What a writer may do while it holds the lock. */
export interface StoreTx {
  meta(): MetaRead;
  writeMeta(meta: SessionMeta): void;
  head(tenant: TenantId): Head;
  readLog(tenant: TenantId, epoch: number, afterSeq: number): Envelope[];
  /** Writes the envelope's key, then the head. The envelope must follow the head. */
  append(tenant: TenantId, envelope: Envelope): void;
  /** Removes the tenant's log and starts the next epoch (dataset switch, reset, seed mismatch). */
  startEpoch(tenant: TenantId): Head;
  /** Removes the meta and every log, and starts the next epoch of every tenant that had one. */
  clear(): void;
}

export interface SessionStore {
  /** Runs `fn` alone across every tab of the origin. Reads and writes inside `fn` see one consistent store. */
  transact<T>(fn: (tx: StoreTx) => T): Promise<T>;
  readMeta(): MetaRead;
  readHead(tenant: TenantId): Head;
  readLog(tenant: TenantId, epoch: number, afterSeq: number): Envelope[];
  /**
   * `false` when no lock serialises the tabs (no Web Locks API): the store
   * runs every transaction directly and the session works in single-tab mode.
   */
  readonly synced: boolean;
}

/** The part of the Web Storage interface the store uses. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

/** Runs `fn` while holding the origin-wide lock. */
export type LockRunner = <T>(fn: () => T) => Promise<T>;

/** `Storage` in memory: the memory adapter's bytes, and what tests inspect. */
export class MemoryStorage implements KeyValue {
  #items = new Map<string, string>();
  get length() {
    return this.#items.size;
  }
  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.#items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.#items.set(key, String(value));
  }
  removeItem(key: string): void {
    this.#items.delete(key);
  }
  /** Every key and value, sorted by key. */
  entries(): [string, string][] {
    return [...this.#items.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }
}

/** A lock that serialises callers in the order they asked, inside one JavaScript realm. */
export function createMemoryLock(): LockRunner {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => T): Promise<T> => {
    const run = tail.then(fn);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseMeta(raw: string | null): MetaRead {
  if (raw === null) return { kind: "none" };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: "mismatch", build: 0 };
  }
  if (
    !isObject(value) ||
    value.v !== SCHEMA_VERSION ||
    typeof value.id !== "string" ||
    typeof value.startedAtMs !== "number" ||
    !isObject(value.clock) ||
    (value.clock.mode !== "live" && value.clock.mode !== "frozen") ||
    typeof value.clock.offsetMinutes !== "number" ||
    !isObject(value.tenants) ||
    !isObject(value.prefs)
  )
    return { kind: "mismatch", build: buildOf(value) };
  return { kind: "ok", meta: value as unknown as SessionMeta };
}

function parseHead(raw: string | null): Head {
  if (raw === null) return { epoch: 0, seq: 0 };
  try {
    const v: unknown = JSON.parse(raw);
    if (isObject(v) && typeof v.epoch === "number" && typeof v.seq === "number")
      return { epoch: v.epoch, seq: v.seq };
  } catch {
    // An unreadable head counts as none; the next epoch starts above it.
  }
  return { epoch: 0, seq: 0 };
}

/**
 * What `readLog` hands back for an entry it cannot read (not JSON, not an
 * envelope's shape). Its `seq` follows no head, so every fold of it fails and
 * the reader takes the path of an envelope that no longer applies: the tenant
 * starts over with the notice `diverged`.
 */
export function unreadableEnvelope(): Envelope {
  return {
    seq: 0,
    id: "",
    at: "",
    actor: { kind: "system" },
    command: { type: "unreadable" } as unknown as Command,
  };
}

/** An envelope as stored, or `null` when the entry is not one. */
function parseEnvelope(raw: string): Envelope | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !isObject(v) ||
    !Number.isInteger(v.seq) ||
    typeof v.at !== "string" ||
    !isObject(v.actor) ||
    !isObject(v.command) ||
    (v.codes !== undefined &&
      !(Array.isArray(v.codes) && v.codes.every((c) => typeof c === "string")))
  )
    return null;
  return v as unknown as Envelope;
}

function keysWithPrefix(kv: KeyValue, prefix: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < kv.length; i++) {
    const k = kv.key(i);
    if (k !== null && k.startsWith(prefix)) keys.push(k);
  }
  return keys;
}

function reader(kv: KeyValue) {
  const readHead = (tenant: TenantId) =>
    parseHead(kv.getItem(KEYS.head(tenant)));
  return {
    readMeta: () => parseMeta(kv.getItem(KEYS.meta)),
    readHead,
    /**
     * The envelopes after `afterSeq` up to the head, in order; nothing when the
     * epoch has moved on. An entry that is missing or not an envelope ends the read with
     * `unreadableEnvelope()`, which no fold accepts.
     */
    readLog(tenant: TenantId, epoch: number, afterSeq: number): Envelope[] {
      const head = readHead(tenant);
      if (head.epoch !== epoch) return [];
      const out: Envelope[] = [];
      for (let seq = afterSeq + 1; seq <= head.seq; seq++) {
        const raw = kv.getItem(KEYS.log(tenant, epoch, seq));
        // A missing entry under the head is as unreadable as a corrupt one.
        const envelope = raw === null ? null : parseEnvelope(raw);
        if (!envelope) {
          out.push(unreadableEnvelope());
          break;
        }
        out.push(envelope);
      }
      return out;
    },
  };
}

function transaction(kv: KeyValue): StoreTx {
  const r = reader(kv);
  const startEpoch = (tenant: TenantId): Head => {
    const old = r.readHead(tenant);
    for (const k of keysWithPrefix(kv, KEYS.logPrefix(tenant)))
      kv.removeItem(k);
    const head = { epoch: old.epoch + 1, seq: 0 };
    kv.setItem(KEYS.head(tenant), JSON.stringify(head));
    return head;
  };
  return {
    meta: r.readMeta,
    writeMeta: (meta) => kv.setItem(KEYS.meta, JSON.stringify(meta)),
    head: r.readHead,
    readLog: r.readLog,
    append(tenant, envelope) {
      const head = r.readHead(tenant);
      if (envelope.seq !== head.seq + 1)
        throw new Error(
          `envelope ${envelope.seq} does not follow the head ${head.seq}`,
        );
      kv.setItem(
        KEYS.log(tenant, head.epoch, envelope.seq),
        JSON.stringify(envelope),
      );
      kv.setItem(
        KEYS.head(tenant),
        JSON.stringify({ epoch: head.epoch, seq: envelope.seq }),
      );
    },
    startEpoch,
    clear() {
      // Epochs only grow, even across a clear, so a tab that holds an old
      // epoch always notices that it must re-seed.
      const tenants = keysWithPrefix(kv, `${PREFIX}head.`).map(
        (k) => k.slice(`${PREFIX}head.`.length) as TenantId,
      );
      for (const t of tenants) startEpoch(t);
      for (const k of keysWithPrefix(kv, PREFIX))
        if (!k.startsWith(`${PREFIX}head.`)) kv.removeItem(k);
    },
  };
}

/** A store over any key-value surface; `lock: null` runs each transaction directly (single-tab mode). */
export function createStore(
  kv: KeyValue,
  lock: LockRunner | null,
): SessionStore {
  const r = reader(kv);
  const tx = transaction(kv);
  return {
    synced: lock !== null,
    transact<T>(fn: (tx: StoreTx) => T): Promise<T> {
      if (lock) return lock(() => fn(tx));
      try {
        return Promise.resolve(fn(tx));
      } catch (e) {
        return Promise.reject(e);
      }
    },
    readMeta: r.readMeta,
    readHead: r.readHead,
    readLog: r.readLog,
  };
}

/** The memory adapter: SSR, unit tests, and two sessions in one test that share it. */
export function createMemoryStore(
  storage: KeyValue = new MemoryStorage(),
): SessionStore {
  return createStore(storage, createMemoryLock());
}

/** The part of `navigator.locks` the browser adapter uses. */
export interface LockManagerLike {
  request<T>(name: string, callback: () => T | Promise<T>): Promise<T>;
}

/** The lock's name: one per origin, for every tenant. */
export const LOCK_NAME = "shiftbook.v1";

/** The origin's `localStorage`, or `null` where site data is blocked (reading it throws) or absent. */
function siteStorage(): KeyValue | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * The browser adapter: `localStorage`, serialised by the Web Locks API. Where
 * the API is missing (an origin that is not secure, an old browser) the store
 * runs in single-tab mode. Where site storage is blocked (cookie blocking,
 * some private modes, a sandboxed frame) it runs single-tab in memory.
 */
export function createBrowserStore(
  o: { storage?: KeyValue; locks?: LockManagerLike | undefined } = {},
): SessionStore {
  const storage = o.storage ?? siteStorage();
  if (!storage) return createStore(new MemoryStorage(), null);
  const locks =
    "locks" in o
      ? o.locks
      : (globalThis.navigator as { locks?: LockManagerLike } | undefined)
          ?.locks;
  const lock: LockRunner | null = locks
    ? <T>(fn: () => T) => locks.request(LOCK_NAME, () => fn())
    : null;
  return createStore(storage, lock);
}
