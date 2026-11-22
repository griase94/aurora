/**
 * The session: the only way a screen reaches the world.
 *
 * One ordered log, one writer at a time. A commit waits for the simulated
 * network, takes the origin-wide lock, catches up with what other tabs
 * appended, runs `apply` on exactly that state and appends the command only if
 * it was accepted. Every tab therefore folds the same prefix in the same
 * order, and an envelope is never refused on arrival.
 *
 * Framework-free: reactivity is `subscribe`; `context.ts` makes it Svelte's.
 */
import { apply } from "../domain/apply.ts";
import type {
  Actor,
  ApplyContext,
  Command,
  Lang,
  LocationId,
  Outcome,
  TenantId,
  WorldState,
} from "../domain/types.ts";
import { SCENARIOS, type ScenarioId } from "../world/scenarios.ts";
import { seedHash, seedWorld } from "../world/seed.ts";
import { tenantFacts, type TenantFacts } from "../world/tenants.ts";
import type { SessionChannel } from "./channel.ts";
import { createClock, scenarioMs, type Clock } from "./clock.ts";
import {
  EXPIRY_MS,
  LOG_CAP,
  type Envelope,
  type Head,
  type PersonaRef,
  type SessionMeta,
  type SessionPrefs,
  type SessionStore,
  type StoreTx,
  type TenantMeta,
} from "./store.ts";
import { toMinuteInstant } from "../domain/time.ts";
import { ALWAYS_VISIBLE, type Visibility } from "./visibility.ts";

export type LoadStatus = "ready" | "loading" | "error";

/**
 * Why the session started over, for the toast that says so: the stored
 * session was older than 12 hours, was written by another schema, was stored
 * over another seed, or (a bug) a stored envelope no longer applied.
 */
export type Notice = "expired" | "schema" | "seed" | "diverged";

export interface Session {
  readonly tenantId: TenantId;
  readonly tenant: TenantFacts;
  readonly scenario: ScenarioId;
  /** Replaced on every accepted command of this tab or another. */
  readonly world: WorldState;
  readonly clock: Clock;
  readonly persona: PersonaRef;
  readonly recent: readonly PersonaRef[];
  readonly actor: Actor;
  readonly language: Lang;
  readonly locale: string;
  readonly dir: "ltr" | "rtl";
  readonly mode: "light" | "dark" | "system";
  readonly prefs: Readonly<SessionPrefs>;
  readonly brand: TenantMeta["brand"] | null;
  /** `false` in SSR and in the first client render; `true` once the stored session is folded in. */
  readonly restored: boolean;
  /** `false` in single-tab mode, where the browser has no Web Locks API. */
  readonly synced: boolean;
  /** Set when the session started over; the app shows it once and dismisses it. */
  readonly notice: Notice | null;
  /** What a list shows. `ready` in SSR, in the first client render and whenever the network switches are off. */
  readonly load: { readonly status: LoadStatus; reload(): void };
  /** Commit a command as the persona at the clock's instant. Never rejects: a refusal is a value. */
  dispatch(command: Command): Promise<Outcome>;
  /** The same for the kiosk and the system actor. */
  dispatchAs(actor: Actor, command: Command): Promise<Outcome>;
  setPersona(p: PersonaRef): Promise<void>;
  setLanguage(l: Lang): Promise<void>;
  /** Switches the dataset: a new epoch, and every tab re-seeds. */
  setScenario(s: ScenarioId): Promise<void>;
  setPrefs(p: Partial<SessionPrefs>): Promise<void>;
  setBrand(b: TenantMeta["brand"] | null): Promise<void>;
  /** Starts the whole session over: every tenant's log, the clock and the preferences. */
  reset(): Promise<void>;
  /** Folds the stored session in. The app calls it once, after mount. */
  restore(): Promise<void>;
  /** Runs a load where an app with a server would fetch: the tenant layout calls it after every navigation. */
  navigated(): void;
  dismissNotice(): void;
  /** Called after any change of any value above. */
  subscribe(fn: () => void): () => void;
  destroy(): void;
}

export interface SessionOptions {
  tenantId: TenantId;
  store: SessionStore;
  channel: SessionChannel;
  visibility?: Visibility;
  /** Real time in milliseconds; the default reads the device. */
  nowMs?: () => number;
  /** Draws one token code; the default uses the platform's random source. */
  newCode?: () => string;
}

const UNAVAILABLE = (reason: string): Outcome => ({
  ok: false,
  refusal: { code: "unavailable", detail: { reason } },
});

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** An opaque token code, "sb_" and 26 base32 characters, from the platform's random source. */
export function randomCode(): string {
  const bytes = new Uint8Array(26);
  globalThis.crypto.getRandomValues(bytes);
  let s = "sb_";
  for (const b of bytes) s += BASE32[b & 31];
  return s;
}

/** The id a command mints: its kind, the envelope's place in the log and a counter ("shift_000412_1"). */
export function idAt(kind: string, seq: number, n: number): string {
  return `${kind}_${String(seq).padStart(6, "0")}_${n}`;
}

/** The context an envelope replays under: its instant, its actor, ids from its seq and codes from itself. */
export function replayContext(envelope: Envelope): ApplyContext {
  let n = 0;
  let c = 0;
  return {
    now: envelope.at,
    actor: envelope.actor,
    newId: (kind) => idAt(kind, envelope.seq, ++n),
    newCode() {
      const code = envelope.codes?.[c++];
      if (code === undefined)
        throw new Error(`envelope ${envelope.seq} has no code ${c}`);
      return code;
    },
  };
}

interface Position {
  world: WorldState;
  scenario: ScenarioId;
  epoch: number;
  seq: number;
}

/** Folds envelopes onto a position; `null` when one does not apply (a bug the tests pin). */
function fold(base: Position, envelopes: Envelope[]): Position | null {
  let { world, seq } = base;
  for (const e of envelopes) {
    if (e.seq !== seq + 1) return null;
    let out: Outcome;
    try {
      out = apply(world, e.command, replayContext(e));
    } catch {
      return null;
    }
    if (!out.ok) return null;
    world = out.state;
    seq = e.seq;
  }
  return { ...base, world, seq };
}

const seeded = (
  tenantId: TenantId,
  scenario: ScenarioId,
  epoch: number,
): Position => ({
  world: seedWorld(tenantId, scenario),
  scenario,
  epoch,
  seq: 0,
});

/** The owner of a world: who acts until a persona is chosen. */
export function defaultPersona(world: WorldState): PersonaRef {
  const owner = Object.values(world.people)
    .filter((p) => p.role === "owner" && p.status === "active")
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  if (owner) return { kind: "person", personId: owner.id };
  const location = Object.keys(world.locations).sort()[0];
  if (!location) throw new Error("a world without an owner and a location");
  return { kind: "kiosk", locationId: location as LocationId };
}

function personaIn(world: WorldState, p: PersonaRef | undefined): boolean {
  if (!p) return false;
  return p.kind === "person"
    ? world.people[p.personId] !== undefined
    : world.locations[p.locationId] !== undefined;
}

function samePersona(a: PersonaRef, b: PersonaRef): boolean {
  return a.kind === "person"
    ? b.kind === "person" && a.personId === b.personId
    : b.kind === "kiosk" && a.locationId === b.locationId;
}

const RECENT = 5;

export function createSession(o: SessionOptions): Session {
  const { tenantId, store, channel } = o;
  const tenant = tenantFacts(tenantId);
  const visibility = o.visibility ?? ALWAYS_VISIBLE;
  const realNow = o.nowMs ?? (() => Date.now());
  const drawCode = o.newCode ?? randomCode;

  // The prerendered state: the default dataset at its instant, nothing restored.
  let pos: Position = seeded(tenantId, "evening", -1);
  let meta: SessionMeta | null = null;
  let restored = false;
  let notice: Notice | null = null;
  let loadStatus: LoadStatus = "ready";
  let loadToken = 0;
  let destroyed = false;
  const unsubscribe: (() => void)[] = [];
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const fn of listeners) fn();
  };

  const clock = createClock({
    start: SCENARIOS.evening.instant,
    nowMs: realNow,
    onChange: (c) => void updateMeta((m) => ({ ...m, clock: c })),
  });
  unsubscribe.push(clock.subscribe(notify));

  const entry = (): TenantMeta | undefined => meta?.tenants[tenantId];
  const prefs = (): SessionPrefs => meta?.prefs ?? {};

  const freshMeta = (realMs: number): SessionMeta => ({
    v: 1,
    startedAtMs: realMs,
    clock: { mode: "live", offsetMinutes: 0 },
    tenants: {},
    prefs: {},
  });

  /**
   * Reads the stored meta inside the lock and repairs what must be repaired
   * before anything is folded: another schema, an expired session, a log
   * stored over another seed (H2, H4).
   */
  function ensureMeta(
    tx: StoreTx,
    realMs: number,
  ): { meta: SessionMeta; notice: Notice | null } {
    let found: Notice | null = null;
    let read = tx.meta();
    if (read.kind === "mismatch") {
      tx.clear();
      found = "schema";
      read = { kind: "none" };
    }
    let m = read.kind === "ok" ? read.meta : null;
    if (m && realMs - m.startedAtMs > EXPIRY_MS) {
      tx.clear();
      found = "expired";
      m = null;
    }
    let dirty = false;
    if (!m) {
      m = freshMeta(realMs);
      dirty = true;
    }
    let e = m.tenants[tenantId];
    if (!e || !(e.scenario in SCENARIOS)) {
      if (tx.head(tenantId).seq > 0) tx.startEpoch(tenantId);
      e = {
        ...e,
        scenario: "evening",
        seedHash: seedHash(tenantId, "evening"),
      };
      dirty = true;
    } else if (e.seedHash !== seedHash(tenantId, e.scenario)) {
      tx.startEpoch(tenantId);
      e = { ...e, seedHash: seedHash(tenantId, e.scenario) };
      found ??= "seed";
      dirty = true;
    }
    if (dirty) {
      m = { ...m, tenants: { ...m.tenants, [tenantId]: e } };
      tx.writeMeta(m);
    }
    return { meta: m, notice: found };
  }

  /** Takes the stored meta as this tab's: preferences, persona, language, the clock. */
  function adoptMeta(m: SessionMeta) {
    meta = m;
    const e = m.tenants[tenantId];
    if (restored && e)
      clock.configure({
        start: SCENARIOS[e.scenario].instant,
        clock: m.clock,
        startedAtMs: m.startedAtMs,
      });
  }

  /** Takes a position if it is newer than this tab's. */
  function adopt(next: Position, force = false) {
    if (
      force ||
      next.epoch > pos.epoch ||
      (next.epoch === pos.epoch &&
        (next.seq > pos.seq || next.scenario !== pos.scenario))
    )
      pos = next;
  }

  function setNotice(n: Notice | null) {
    if (n) notice = n;
  }

  /** Reads the whole log inside the lock and folds it from the seed; starts over if it does not apply. */
  async function resync() {
    const realMs = realNow();
    const r = await store.transact((tx) => {
      const ens = ensureMeta(tx, realMs);
      const e = ens.meta.tenants[tenantId]!;
      const head = tx.head(tenantId);
      const folded = fold(
        seeded(tenantId, e.scenario, head.epoch),
        tx.readLog(tenantId, head.epoch, 0),
      );
      if (folded) return { ...ens, pos: folded, diverged: false };
      const next = tx.startEpoch(tenantId);
      return {
        ...ens,
        pos: seeded(tenantId, e.scenario, next.epoch),
        diverged: true,
      };
    });
    adopt(r.pos, true);
    adoptMeta(r.meta);
    setNotice(r.diverged ? "diverged" : r.notice);
    if (r.diverged)
      channel.post({
        kind: "log",
        tenant: tenantId,
        epoch: r.pos.epoch,
        seq: 0,
      });
    notify();
  }

  /** Reads what other tabs appended, from this tab's own position, outside the lock. */
  function catchUp() {
    const e = entry();
    if (!e) return;
    const head = store.readHead(tenantId);
    const base =
      head.epoch !== pos.epoch || e.scenario !== pos.scenario
        ? seeded(tenantId, e.scenario, head.epoch)
        : pos;
    const envelopes = store.readLog(tenantId, base.epoch, base.seq);
    if (base === pos && envelopes.length === 0) return;
    const next = fold(base, envelopes);
    if (!next) {
      void resync();
      return;
    }
    const reseeded = base !== pos;
    adopt(next, reseeded);
    if (reseeded) runLoad();
    notify();
  }

  /** Re-reads the store after another tab's message or when the page shows again. */
  function syncFromStore() {
    if (destroyed || !restored) return;
    const read = store.readMeta();
    if (read.kind !== "ok" || realNow() - read.meta.startedAtMs > EXPIRY_MS) {
      void restore();
      return;
    }
    adoptMeta(read.meta);
    catchUp();
    notify();
  }

  /** Writes a change of the meta inside the lock and tells the other tabs. */
  async function updateMeta(change: (m: SessionMeta) => SessionMeta) {
    const realMs = realNow();
    const r = await store.transact((tx) => {
      const ens = ensureMeta(tx, realMs);
      const next = change(ens.meta);
      tx.writeMeta(next);
      return { meta: next, notice: ens.notice };
    });
    adoptMeta(r.meta);
    setNotice(r.notice);
    channel.post({ kind: "meta" });
    if (r.notice) catchUp();
    notify();
  }

  const updateEntry = (change: (e: TenantMeta) => TenantMeta) =>
    updateMeta((m) => ({
      ...m,
      tenants: { ...m.tenants, [tenantId]: change(m.tenants[tenantId]!) },
    }));

  function setLoad(s: LoadStatus) {
    if (s === loadStatus) return;
    loadStatus = s;
    notify();
  }

  /**
   * A load: with the network switches off a no-op that never leaves `ready`;
   * otherwise `loading` for `latencyMs`, then `error` once if `failNextLoad`
   * was set (the switch clears itself), else `ready`.
   */
  function runLoad() {
    const token = ++loadToken;
    const { latencyMs = 0, failNextLoad } = prefs();
    if (latencyMs <= 0 && !failNextLoad) {
      setLoad("ready");
      return;
    }
    setLoad("loading");
    setTimeout(() => {
      if (token !== loadToken) return;
      void store
        .transact((tx) => {
          const read = tx.meta();
          if (read.kind !== "ok" || !read.meta.prefs.failNextLoad) return null;
          const next: SessionMeta = {
            ...read.meta,
            prefs: { ...read.meta.prefs, failNextLoad: false },
          };
          tx.writeMeta(next);
          return next;
        })
        .then((cleared) => {
          if (cleared) {
            adoptMeta(cleared);
            channel.post({ kind: "meta" });
          }
          if (token === loadToken) setLoad(cleared ? "error" : "ready");
        });
    }, latencyMs);
  }

  const load = {
    get status() {
      return loadStatus;
    },
    reload: () => runLoad(),
  };

  async function restore() {
    const realMs = realNow();
    const r = await store.transact((tx) => {
      const ens = ensureMeta(tx, realMs);
      const head = tx.head(tenantId);
      return { ...ens, head, log: tx.readLog(tenantId, head.epoch, 0) };
    });
    const e = r.meta.tenants[tenantId]!;
    const folded = fold(seeded(tenantId, e.scenario, r.head.epoch), r.log);
    const firstTime = !restored;
    restored = true;
    adoptMeta(r.meta);
    setNotice(r.notice);
    if (folded) adopt(folded, true);
    else await resync();
    if (firstTime) {
      if (store.synced) unsubscribe.push(channel.subscribe(syncFromStore));
      clock.setVisible(visibility.visible());
      unsubscribe.push(
        visibility.subscribe((visible) => {
          clock.setVisible(visible);
          if (visible) syncFromStore();
        }),
      );
    }
    runLoad();
    notify();
  }

  async function dispatchAs(actor: Actor, command: Command): Promise<Outcome> {
    const latencyMs = prefs().latencyMs ?? 0;
    if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs));
    const realMs = realNow();
    const r = await store.transact((tx) => {
      const ens = ensureMeta(tx, realMs);
      const m = ens.meta;
      if (m.prefs.failNextSave) {
        const next = { ...m, prefs: { ...m.prefs, failNextSave: false } };
        tx.writeMeta(next);
        return { ...ens, meta: next, outcome: UNAVAILABLE("fail next save") };
      }
      // Catch up with what other tabs appended, inside the lock.
      const e = m.tenants[tenantId]!;
      const head: Head = tx.head(tenantId);
      const base =
        head.epoch !== pos.epoch || e.scenario !== pos.scenario
          ? seeded(tenantId, e.scenario, head.epoch)
          : pos;
      const caught = fold(base, tx.readLog(tenantId, base.epoch, base.seq));
      if (!caught) {
        const next = tx.startEpoch(tenantId);
        return {
          ...ens,
          notice: "diverged" as const,
          pos: seeded(tenantId, e.scenario, next.epoch),
          outcome: UNAVAILABLE("diverged"),
          posted: true,
        };
      }
      if (caught.seq >= LOG_CAP)
        return { ...ens, pos: caught, outcome: UNAVAILABLE("log full") };

      const at = toMinuteInstant(
        scenarioMs(
          SCENARIOS[e.scenario].instant,
          m.clock,
          m.startedAtMs,
          realMs,
        ),
      );
      const seq = caught.seq + 1;
      const codes: string[] = [];
      let n = 0;
      const outcome = apply(caught.world, command, {
        now: at,
        actor,
        newId: (kind) => idAt(kind, seq, ++n),
        newCode() {
          const c = drawCode();
          codes.push(c);
          return c;
        },
      });
      if (!outcome.ok) return { ...ens, pos: caught, outcome };
      tx.append(tenantId, {
        seq,
        id: `${tenantId}.${caught.epoch}.${seq}`,
        at,
        actor,
        command,
        ...(codes.length > 0 ? { codes } : {}),
      });
      return {
        ...ens,
        pos: { ...caught, world: outcome.state, seq },
        outcome,
        posted: true,
      };
    });
    if ("pos" in r && r.pos) adopt(r.pos, r.notice === "diverged");
    adoptMeta(r.meta);
    setNotice(r.notice);
    if ("posted" in r && r.posted)
      channel.post({
        kind: "log",
        tenant: tenantId,
        epoch: pos.epoch,
        seq: pos.seq,
      });
    if (!("pos" in r)) channel.post({ kind: "meta" });
    notify();
    return r.outcome;
  }

  const actorOf = (): Actor => {
    const p = session.persona;
    if (p.kind === "kiosk") return { kind: "kiosk", locationId: p.locationId };
    const person = pos.world.people[p.personId]!;
    return { kind: "person", personId: person.id, role: person.role };
  };

  const session: Session = {
    tenantId,
    tenant,
    get scenario() {
      return pos.scenario;
    },
    get world() {
      return pos.world;
    },
    clock,
    get persona() {
      const p = entry()?.persona;
      return p && personaIn(pos.world, p) ? p : defaultPersona(pos.world);
    },
    get recent() {
      return (entry()?.recent ?? []).filter((p) => personaIn(pos.world, p));
    },
    get actor() {
      return actorOf();
    },
    get language() {
      return entry()?.language ?? tenant.language;
    },
    get locale() {
      const lang = entry()?.language ?? tenant.language;
      if (lang === tenant.language) return tenant.locale;
      // Another language keeps the tenant's formats: English words with German dates ("en-DE").
      const region = tenant.locale.split("-")[1];
      return region ? `${lang}-${region}` : lang;
    },
    get dir() {
      return prefs().dir ?? "ltr";
    },
    get mode() {
      return prefs().mode ?? "system";
    },
    get prefs() {
      return prefs();
    },
    get brand() {
      return entry()?.brand ?? null;
    },
    get restored() {
      return restored;
    },
    synced: store.synced,
    get notice() {
      return notice;
    },
    load,
    dispatch: (command) => dispatchAs(actorOf(), command),
    dispatchAs,
    async setPersona(p) {
      await updateEntry((e) => ({
        ...e,
        persona: p,
        recent: [
          p,
          ...(e.recent ?? []).filter((r) => !samePersona(r, p)),
        ].slice(0, RECENT),
      }));
      runLoad();
    },
    setLanguage: (language) => updateEntry((e) => ({ ...e, language })),
    async setBrand(brand) {
      await updateEntry((e) => {
        const { brand: _old, ...rest } = e;
        return brand ? { ...rest, brand } : rest;
      });
    },
    async setPrefs(p) {
      // This tab at once; the stored meta inside the lock, own fields only.
      if (meta) meta = { ...meta, prefs: { ...meta.prefs, ...p } };
      notify();
      await updateMeta((m) => ({ ...m, prefs: { ...m.prefs, ...p } }));
    },
    async setScenario(scenario) {
      const realMs = realNow();
      const r = await store.transact((tx) => {
        const ens = ensureMeta(tx, realMs);
        const e: TenantMeta = {
          ...ens.meta.tenants[tenantId]!,
          scenario,
          seedHash: seedHash(tenantId, scenario),
        };
        const m = {
          ...ens.meta,
          tenants: { ...ens.meta.tenants, [tenantId]: e },
        };
        tx.writeMeta(m);
        return { meta: m, head: tx.startEpoch(tenantId) };
      });
      adopt(seeded(tenantId, scenario, r.head.epoch), true);
      adoptMeta(r.meta);
      channel.post({
        kind: "log",
        tenant: tenantId,
        epoch: r.head.epoch,
        seq: 0,
      });
      runLoad();
      notify();
    },
    async reset() {
      const realMs = realNow();
      const r = await store.transact((tx) => {
        tx.clear();
        const ens = ensureMeta(tx, realMs);
        return { meta: ens.meta, head: tx.head(tenantId) };
      });
      adopt(seeded(tenantId, "evening", r.head.epoch), true);
      adoptMeta(r.meta);
      channel.post({
        kind: "log",
        tenant: tenantId,
        epoch: r.head.epoch,
        seq: 0,
      });
      channel.post({ kind: "meta" });
      runLoad();
      notify();
    },
    restore,
    navigated: () => runLoad(),
    dismissNotice() {
      notice = null;
      notify();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      destroyed = true;
      loadToken++;
      clock.stop();
      for (const u of unsubscribe.splice(0)) u();
      listeners.clear();
    },
  };
  return session;
}
