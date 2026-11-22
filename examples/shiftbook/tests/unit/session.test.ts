import { afterEach, describe, expect, it, vi } from "vitest";
import { hashOf } from "../../src/lib/domain/hash.ts";
import type {
  Actor,
  Command,
  LocationId,
  PersonId,
  TenantId,
  WorldState,
} from "../../src/lib/domain/types.ts";
import { createPrng } from "../../src/lib/world/prng.ts";
import { SCENARIOS } from "../../src/lib/world/scenarios.ts";
import { seedHash, seedWorld } from "../../src/lib/world/seed.ts";
import { createFakeChannelBus } from "../../src/lib/session/channel.ts";
import {
  createSession,
  replayContext,
  type Session,
} from "../../src/lib/session/session.ts";
import {
  createBrowserStore,
  createMemoryLock,
  createMemoryStore,
  createStore,
  EXPIRY_MS,
  KEYS,
  LOG_CAP,
  MemoryStorage,
  type LockRunner,
  type SessionStore,
} from "../../src/lib/session/store.ts";
import { createVisibilitySwitch } from "../../src/lib/session/visibility.ts";

const MARKT = "loc_kranich_markt" as LocationId;
const KIOSK: Actor = { kind: "kiosk", locationId: MARKT };
const START_MS = Date.parse("2030-01-01T00:00:00Z");
const MINUTE = 60_000;

/** One origin: a shared storage, its store, a channel bus and one real clock for every tab. */
function origin(o: { storage?: MemoryStorage; store?: SessionStore } = {}) {
  const storage = o.storage ?? new MemoryStorage();
  const store = o.store ?? createMemoryStore(storage);
  const bus = createFakeChannelBus();
  const time = { ms: START_MS };
  let codes = 0;
  const tab = (
    extra: {
      visibility?: ReturnType<typeof createVisibilitySwitch>;
      tenantId?: TenantId;
    } = {},
  ) =>
    createSession({
      tenantId: "kranich",
      store,
      channel: bus.channel(),
      nowMs: () => time.ms,
      newCode: () => `sb_test${String(++codes).padStart(22, "0")}`,
      ...extra,
    });
  return { storage, store, bus, time, tab };
}

/** The instants of the tenant's stored log, in log order. */
function storedInstants(storage: MemoryStorage, tenant: TenantId = "kranich") {
  const head = JSON.parse(storage.getItem(KEYS.head(tenant)) ?? "null") as {
    epoch: number;
    seq: number;
  } | null;
  const out: string[] = [];
  for (let q = 1; head && q <= head.seq; q++) {
    const raw = storage.getItem(KEYS.log(tenant, head.epoch, q));
    if (raw) out.push((JSON.parse(raw) as { at: string }).at);
  }
  return out;
}

const neverBackwards = (ats: readonly string[]) =>
  ats.every((a, i) => i === 0 || a >= ats[i - 1]!);

/** Empties the storage, as "Clear site data" or an eviction does. */
const wipe = (storage: MemoryStorage) => {
  for (const [k] of storage.entries()) storage.removeItem(k);
};

const sessions: Session[] = [];
afterEach(() => {
  for (const s of sessions.splice(0)) s.destroy();
  vi.useRealTimers();
});
async function restored(s: Session) {
  sessions.push(s);
  await s.restore();
  return s;
}

/** Lets queued microtasks (channel deliveries, lock grants) run. */
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

/** Badge codes of active people of the evening dataset, by person. */
function badges(world: WorldState = seedWorld("kranich", "evening")) {
  return Object.values(world.tokens)
    .filter(
      (t) =>
        t.status === "active" && world.people[t.personId]?.status === "active",
    )
    .map((t) => ({ personId: t.personId, code: t.code }))
    .sort((a, b) => (a.personId < b.personId ? -1 : 1));
}
const stamp = (code: string): Command => ({
  type: "stamp",
  code,
  locationId: MARKT,
});

/** The stored log of the tenant, as raw entries. */
const storedLog = (storage: MemoryStorage) =>
  storage.entries().filter(([k]) => k.startsWith("shiftbook.v1.log.kranich."));

describe("session: the commit", () => {
  it("before restore the session holds the prerendered world: evening's seed, ready, not restored", () => {
    const { tab } = origin();
    const s = tab();
    sessions.push(s);
    expect(s.world).toBe(seedWorld("kranich", "evening"));
    expect(s.restored).toBe(false);
    expect(s.load.status).toBe("ready");
    expect(s.clock.instant).toBe(SCENARIOS.evening.instant);
  });

  it("an accepted command is appended under its own key, then the head; ids come from the log position", async () => {
    const { tab, storage } = origin();
    const s = await restored(tab());
    const [first] = badges();
    const out = await s.dispatchAs(KIOSK, stamp(first!.code));
    expect(out.ok).toBe(true);
    expect(storage.getItem(KEYS.head("kranich"))).toBe(
      JSON.stringify({ epoch: 0, seq: 1 }),
    );
    const env = JSON.parse(storage.getItem(KEYS.log("kranich", 0, 1))!);
    expect(env).toMatchObject({
      seq: 1,
      actor: KIOSK,
      at: SCENARIOS.evening.instant,
    });
    expect(out.ok && out.result).toMatchObject({
      kind: "in",
      shift: "shift_000001_1",
    });
    expect(s.world).toBe(out.ok && out.state);
  });

  it("a refused command writes nothing and leaves the world as it was", async () => {
    const { tab, storage } = origin();
    const s = await restored(tab());
    const before = s.world;
    const out = await s.dispatchAs(KIOSK, stamp("sb_nobodyhasthiscode"));
    expect(out).toMatchObject({
      ok: false,
      refusal: { code: "unknown_token" },
    });
    expect(storedLog(storage)).toEqual([]);
    expect(s.world).toBe(before);
  });

  it("dispatch acts as the persona: the owner until another is chosen", async () => {
    const { tab } = origin();
    const s = await restored(tab());
    expect(s.actor).toMatchObject({ kind: "person", role: "owner" });
    const employee = Object.values(s.world.people).find(
      (p) => p.role === "employee",
    )!;
    await s.setPersona({ kind: "person", personId: employee.id });
    expect(s.actor).toEqual({
      kind: "person",
      personId: employee.id,
      role: "employee",
    });
    expect(s.recent[0]).toEqual({ kind: "person", personId: employee.id });
  });

  it("replay reads token codes from the envelope, in order, and never draws new ones", () => {
    const ctx = replayContext({
      seq: 7,
      id: "kranich.0.7",
      at: "2026-11-20T17:42:00Z",
      actor: KIOSK,
      command: stamp("x"),
      codes: ["sb_one", "sb_two"],
    });
    expect([ctx.newCode(), ctx.newCode()]).toEqual(["sb_one", "sb_two"]);
    expect(() => ctx.newCode()).toThrow(/no code/);
    expect([ctx.newId("shift"), ctx.newId("audit")]).toEqual([
      "shift_000007_1",
      "audit_000007_2",
    ]);
  });
});

describe("session: two tabs, one log", () => {
  it("two sessions on one store commit at once and end with the same world hash and the same stored log", async () => {
    const { tab, storage } = origin();
    const a = await restored(tab());
    const b = await restored(tab());
    const [p1, p2] = badges();
    const [oa, ob] = await Promise.all([
      a.dispatchAs(KIOSK, stamp(p1!.code)),
      b.dispatchAs(KIOSK, stamp(p2!.code)),
    ]);
    expect(oa.ok && ob.ok).toBe(true);
    await settle();
    expect(hashOf(a.world)).toBe(hashOf(b.world));
    expect(storedLog(storage).map(([k]) => k)).toEqual([
      "shiftbook.v1.log.kranich.0.1",
      "shiftbook.v1.log.kranich.0.2",
    ]);
    // A third tab that restores from storage folds the same world.
    const c = await restored(tab());
    expect(hashOf(c.world)).toBe(hashOf(a.world));
  });

  it("a dropped channel message is healed by the next commit", async () => {
    const { tab, bus } = origin();
    const a = await restored(tab());
    const b = await restored(tab());
    const [p1, p2] = badges();
    bus.mode = "drop";
    await a.dispatchAs(KIOSK, stamp(p1!.code));
    await settle();
    expect(hashOf(b.world)).not.toBe(hashOf(a.world));
    bus.mode = "deliver";
    await b.dispatchAs(KIOSK, stamp(p2!.code));
    await settle();
    expect(hashOf(b.world)).toBe(hashOf(a.world));
    expect(Object.keys(b.world.shifts).length).toBe(
      Object.keys(seedWorld("kranich", "evening").shifts).length + 2,
    );
  });

  it("a dropped channel message is healed when the tab becomes visible", async () => {
    const o = origin();
    const a = await restored(o.tab());
    const page = createVisibilitySwitch(true);
    const b = await restored(o.tab({ visibility: page }));
    o.bus.mode = "drop";
    page.set(false);
    await a.dispatchAs(KIOSK, stamp(badges()[0]!.code));
    await settle();
    expect(hashOf(b.world)).not.toBe(hashOf(a.world));
    page.set(true);
    expect(hashOf(b.world)).toBe(hashOf(a.world));
  });

  it("a held message arrives late and changes nothing that the next read did not already fold", async () => {
    const { tab, bus } = origin();
    const a = await restored(tab());
    const b = await restored(tab());
    bus.mode = "hold";
    await a.dispatchAs(KIOSK, stamp(badges()[0]!.code));
    await b.dispatchAs(KIOSK, stamp(badges()[1]!.code));
    bus.flush();
    await settle();
    expect(hashOf(a.world)).toBe(hashOf(b.world));
  });

  it("an epoch change re-seeds the other session: a dataset switch in one tab reaches the other", async () => {
    const { tab, storage } = origin();
    const a = await restored(tab());
    const b = await restored(tab());
    await a.dispatchAs(KIOSK, stamp(badges()[0]!.code));
    await settle();
    await a.setScenario("empty");
    await settle();
    expect(b.scenario).toBe("empty");
    expect(b.world).toBe(seedWorld("kranich", "empty"));
    expect(storedLog(storage)).toEqual([]);
    expect(JSON.parse(storage.getItem(KEYS.head("kranich"))!)).toEqual({
      epoch: 1,
      seq: 0,
    });
    // Both write the new epoch's log from its first position.
    await b.setScenario("evening");
    await settle();
    await a.dispatchAs(KIOSK, stamp(badges()[0]!.code));
    await settle();
    expect(storedLog(storage).map(([k]) => k)).toEqual([
      "shiftbook.v1.log.kranich.2.1",
    ]);
    expect(hashOf(a.world)).toBe(hashOf(b.world));
  });

  it("reset starts every tab over on the evening dataset", async () => {
    const { tab, storage } = origin();
    const a = await restored(tab());
    const b = await restored(tab());
    await a.setScenario("busy");
    await a.dispatchAs(KIOSK, stamp("sb_unknown"));
    await b.reset();
    await settle();
    expect(a.scenario).toBe("evening");
    expect(a.world).toBe(seedWorld("kranich", "evening"));
    expect(storedLog(storage)).toEqual([]);
  });
});

describe("session: the simulated network", () => {
  it("failNextSave resolves `unavailable` once, writes nothing, and the second try succeeds", async () => {
    const { tab, storage } = origin();
    const s = await restored(tab());
    await s.setPrefs({ failNextSave: true });
    const code = badges()[0]!.code;
    const first = await s.dispatchAs(KIOSK, stamp(code));
    expect(first).toEqual({
      ok: false,
      refusal: { code: "unavailable", detail: { reason: "fail next save" } },
    });
    expect(storedLog(storage)).toEqual([]);
    expect(s.prefs.failNextSave).toBe(false);
    const second = await s.dispatchAs(KIOSK, stamp(code));
    expect(second.ok).toBe(true);
  });

  it("latencyMs delays the outcome by exactly that long", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { tab } = origin();
    const s = await restored(tab());
    await s.setPrefs({ latencyMs: 1200 });
    let done = false;
    const p = s.dispatchAs(KIOSK, stamp(badges()[0]!.code)).then((o) => {
      done = true;
      return o;
    });
    await vi.advanceTimersByTimeAsync(1199);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await p).ok).toBe(true);
  });

  it("with the switches off a commit resolves without waiting for any timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { tab } = origin();
    const s = await restored(tab());
    const out = await s.dispatchAs(KIOSK, stamp(badges()[0]!.code));
    expect(out.ok).toBe(true);
  });

  it("the load status goes `loading` then `ready` under latency; `error` with failNextLoad; reload recovers", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { tab } = origin();
    const s = await restored(tab());
    expect(s.load.status).toBe("ready");
    await s.setPrefs({ latencyMs: 500 });
    s.navigated();
    expect(s.load.status).toBe("loading");
    await vi.advanceTimersByTimeAsync(500);
    expect(s.load.status).toBe("ready");

    await s.setPrefs({ failNextLoad: true });
    s.load.reload();
    expect(s.load.status).toBe("loading");
    await vi.advanceTimersByTimeAsync(500);
    expect(s.load.status).toBe("error");
    expect(s.prefs.failNextLoad).toBe(false);
    // The world is never withheld.
    expect(s.world).toBe(seedWorld("kranich", "evening"));

    s.load.reload();
    await vi.advanceTimersByTimeAsync(500);
    expect(s.load.status).toBe("ready");
  });

  it("with the switches off a load never leaves `ready`", async () => {
    const { tab } = origin();
    const s = await restored(tab());
    const seen: string[] = [];
    s.subscribe(() => seen.push(s.load.status));
    s.navigated();
    s.load.reload();
    expect(seen.filter((x) => x !== "ready")).toEqual([]);
  });
});

describe("session: restore, expiry, repair and the cap", () => {
  it("restore folds the stored log over the seed: a new tab sees what an earlier one committed", async () => {
    const { tab } = origin();
    const a = await restored(tab());
    await a.dispatchAs(KIOSK, stamp(badges()[0]!.code));
    const b = tab();
    sessions.push(b);
    expect(b.restored).toBe(false);
    expect(b.world).toBe(seedWorld("kranich", "evening"));
    await b.restore();
    expect(b.restored).toBe(true);
    expect(hashOf(b.world)).toBe(hashOf(a.world));
  });

  it("a session older than 12 hours of real time starts over with a notice", async () => {
    const o = origin();
    const a = await restored(o.tab());
    await a.dispatchAs(KIOSK, stamp(badges()[0]!.code));
    o.time.ms += EXPIRY_MS + MINUTE;
    const b = await restored(o.tab());
    expect(b.notice).toBe("expired");
    expect(b.world).toBe(seedWorld("kranich", "evening"));
    expect(storedLog(o.storage)).toEqual([]);
    const meta = JSON.parse(o.storage.getItem(KEYS.meta)!);
    expect(meta.startedAtMs).toBe(o.time.ms);
  });

  it("a meta of another schema discards everything with a notice", async () => {
    const o = origin();
    o.storage.setItem(KEYS.meta, JSON.stringify({ v: 0, whatever: true }));
    o.storage.setItem(
      KEYS.head("kranich"),
      JSON.stringify({ epoch: 3, seq: 1 }),
    );
    o.storage.setItem(KEYS.log("kranich", 3, 1), "{}");
    const s = await restored(o.tab());
    expect(s.notice).toBe("schema");
    expect(storedLog(o.storage)).toEqual([]);
    expect(JSON.parse(o.storage.getItem(KEYS.head("kranich"))!)).toEqual({
      epoch: 4,
      seq: 0,
    });
    expect(JSON.parse(o.storage.getItem(KEYS.meta)!).v).toBe(1);
  });

  it("a log stored over another seed is discarded with a notice and a new epoch", async () => {
    const o = origin();
    const a = await restored(o.tab());
    await a.dispatchAs(KIOSK, stamp(badges()[0]!.code));
    const meta = JSON.parse(o.storage.getItem(KEYS.meta)!);
    meta.tenants.kranich.seedHash = "00000000";
    o.storage.setItem(KEYS.meta, JSON.stringify(meta));
    const b = await restored(o.tab());
    expect(b.notice).toBe("seed");
    expect(storedLog(o.storage)).toEqual([]);
    expect(
      JSON.parse(o.storage.getItem(KEYS.meta)!).tenants.kranich.seedHash,
    ).toBe(seedHash("kranich", "evening"));
    expect(b.world).toBe(seedWorld("kranich", "evening"));
  });

  it("a stored envelope that no longer applies starts the tenant over with a notice, never a broken world", async () => {
    const o = origin();
    const a = await restored(o.tab());
    await a.dispatchAs(KIOSK, stamp(badges()[0]!.code));
    const env = JSON.parse(o.storage.getItem(KEYS.log("kranich", 0, 1))!);
    env.command.code = "sb_tamperedtamperedtampered";
    o.storage.setItem(KEYS.log("kranich", 0, 1), JSON.stringify(env));
    const b = await restored(o.tab());
    expect(b.notice).toBe("diverged");
    expect(b.world).toBe(seedWorld("kranich", "evening"));
    expect(storedLog(o.storage)).toEqual([]);
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["JSON null", "null"],
    ["an object without a command", '{"seq":1,"at":"2026-11-20T17:42:00Z"}'],
    ["missing", null],
  ])(
    "an envelope under the head that is %s starts the tenant over with the notice diverged, on restore, on catch-up and on commit",
    async (_what, raw) => {
      const o = origin();
      const a = await restored(o.tab());
      const open = await restored(o.tab());
      await a.dispatchAs(KIOSK, stamp(badges()[0]!.code));
      o.bus.mode = "hold";
      await a.dispatchAs(KIOSK, stamp(badges()[1]!.code));
      // The second envelope is corrupt before the open tab hears of it.
      if (raw === null) o.storage.removeItem(KEYS.log("kranich", 0, 2));
      else o.storage.setItem(KEYS.log("kranich", 0, 2), raw);

      const b = await restored(o.tab());
      expect(b.restored).toBe(true);
      expect(b.notice).toBe("diverged");
      expect(b.world).toBe(seedWorld("kranich", "evening"));
      expect(storedLog(o.storage)).toEqual([]);
      expect((await b.dispatchAs(KIOSK, stamp(badges()[0]!.code))).ok).toBe(
        true,
      );

      o.bus.mode = "deliver";
      o.bus.flush();
      await settle();
      expect(hashOf(open.world)).toBe(hashOf(b.world));
      expect((await a.dispatchAs(KIOSK, stamp(badges()[2]!.code))).ok).toBe(
        true,
      );
    },
  );

  it.each([
    ["invalid JSON", "{not json"],
    ["JSON null", "null"],
  ])(
    "a commit that finds %s under the head starts the tenant over with the notice diverged",
    async (_what, raw) => {
      const o = origin();
      const a = await restored(o.tab());
      const c = await restored(o.tab());
      o.bus.mode = "drop";
      await c.dispatchAs(KIOSK, stamp(badges()[0]!.code));
      o.storage.setItem(KEYS.log("kranich", 0, 1), raw);
      expect(await a.dispatchAs(KIOSK, stamp(badges()[1]!.code))).toEqual({
        ok: false,
        refusal: { code: "unavailable", detail: { reason: "diverged" } },
      });
      expect(a.notice).toBe("diverged");
      expect((await a.dispatchAs(KIOSK, stamp(badges()[1]!.code))).ok).toBe(
        true,
      );
    },
  );

  it(`at the cap of ${LOG_CAP} envelopes a commit is refused with \`unavailable\``, async () => {
    const o = origin();
    const s = await restored(o.tab());
    const code = badges()[0]!.code;
    for (let i = 0; i < LOG_CAP; i++) {
      const out = await s.dispatchAs(KIOSK, stamp(code));
      if (!out.ok)
        throw new Error(`commit ${i + 1} refused: ${JSON.stringify(out)}`);
      // Scenario time moves past the repeat window; real time stays within the 12 hours of a session.
      s.clock.advance(2);
    }
    const out = await s.dispatchAs(KIOSK, stamp(code));
    expect(out).toEqual({
      ok: false,
      refusal: { code: "unavailable", detail: { reason: "log full" } },
    });
    expect(storedLog(o.storage)).toHaveLength(LOG_CAP);
    // A full log still restores, to the same world.
    const b = await restored(o.tab());
    expect(hashOf(b.world)).toBe(hashOf(s.world));
  }, 60_000);
});

describe("session: single-tab mode without the lock", () => {
  it("runs every transaction directly, does not listen to the channel, and still commits", async () => {
    const storage = new MemoryStorage();
    const store = createBrowserStore({ storage, locks: undefined });
    expect(store.synced).toBe(false);
    const o = origin({ storage, store });
    const a = await restored(o.tab());
    const b = await restored(o.tab());
    expect(a.synced).toBe(false);
    await a.dispatchAs(KIOSK, stamp(badges()[0]!.code));
    await settle();
    // B heard nothing: it is not synced.
    expect(hashOf(b.world)).not.toBe(hashOf(a.world));
    // Its own commit still folds the log first, so the log stays one order.
    await b.dispatchAs(KIOSK, stamp(badges()[1]!.code));
    expect(storedLog(storage)).toHaveLength(2);
  });

  it("with the Web Locks API the browser store serialises through it", async () => {
    const names: string[] = [];
    const store = createBrowserStore({
      storage: new MemoryStorage(),
      locks: {
        request: async (name, cb) => {
          names.push(name);
          return cb();
        },
      },
    });
    expect(store.synced).toBe(true);
    await store.transact(() => 1);
    expect(names).toEqual(["shiftbook.v1"]);
  });
});

describe("session: preferences travel between tabs", () => {
  it("a setter changes this tab at once and the other tab after the message", async () => {
    const { tab } = origin();
    const a = await restored(tab());
    const b = await restored(tab());
    const p = a.setPrefs({ mode: "dark", dir: "rtl" });
    expect(a.mode).toBe("dark");
    await p;
    await settle();
    expect(b.mode).toBe("dark");
    expect(b.dir).toBe("rtl");
    await b.setLanguage("en");
    await settle();
    expect(a.language).toBe("en");
    expect(a.locale).toBe("en-DE");
  });
});

describe("clock", () => {
  it("stands at the dataset's instant until restore, then runs live from the shared start", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const o = origin();
    const s = o.tab();
    sessions.push(s);
    o.time.ms += 5 * MINUTE;
    expect(s.clock.instant).toBe("2026-11-20T17:42:00Z");
    await s.restore();
    expect(s.clock.mode).toBe("live");
    expect(s.clock.instant).toBe("2026-11-20T17:42:00Z");
    o.time.ms += MINUTE;
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(s.clock.instant).toBe("2026-11-20T17:43:00Z");
  });

  it("advance moves forward only; freeze and resume keep the instant; every tab shares it", async () => {
    const o = origin();
    const a = await restored(o.tab());
    const b = await restored(o.tab());
    a.clock.advance(90);
    expect(a.clock.instant).toBe("2026-11-20T19:12:00Z");
    expect(() => a.clock.advance(-5)).toThrow(RangeError);
    a.clock.freeze();
    o.time.ms += 10 * MINUTE;
    expect(a.clock.instant).toBe("2026-11-20T19:12:00Z");
    a.clock.resume();
    expect(a.clock.instant).toBe("2026-11-20T19:12:00Z");
    o.time.ms += 3 * MINUTE;
    await settle();
    // B adopted the stored clock after the message.
    expect(b.clock.now().getTime()).toBe(a.clock.now().getTime());
  });

  it("a commit reads the clock inside the lock, so the log's instants never run backwards", async () => {
    const o = origin();
    const a = await restored(o.tab());
    const b = await restored(o.tab());
    o.bus.mode = "drop";
    a.clock.advance(120);
    await settle();
    // B has not heard of the jump, yet its commit takes the stored clock.
    await b.dispatchAs(KIOSK, stamp(badges()[0]!.code));
    const env = JSON.parse(o.storage.getItem(KEYS.log("kranich", 0, 1))!);
    expect(env.at).toBe("2026-11-20T19:42:00Z");
  });

  it("the minute tick stops while the page is hidden", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const o = origin();
    const page = createVisibilitySwitch(true);
    const s = await restored(o.tab({ visibility: page }));
    let ticks = 0;
    s.clock.subscribe(() => ticks++);
    page.set(false);
    o.time.ms += 5 * MINUTE;
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(ticks).toBe(0);
    page.set(true);
    expect(s.clock.instant).toBe("2026-11-20T17:47:00Z");
  });
});

describe("session: identifiers", () => {
  it("a persona the dataset does not hold falls back to the owner", async () => {
    const { tab } = origin();
    const s = await restored(tab());
    const someone = Object.values(s.world.people).find(
      (p) => p.role === "employee",
    )!;
    await s.setPersona({ kind: "person", personId: someone.id as PersonId });
    await s.setScenario("empty");
    expect(s.persona).toMatchObject({ kind: "person" });
    expect(s.actor).toMatchObject({ role: "owner" });
  });
});

describe("session: a commit is never applied to a world the tab did not show", () => {
  it("rule 1 through the session: a double tap two seconds apart across a minute boundary is a duplicate_scan", async () => {
    const o = origin();
    const s = await restored(o.tab());
    const code = badges()[0]!.code;
    o.time.ms += 59_000;
    expect((await s.dispatchAs(KIOSK, stamp(code))).ok).toBe(true);
    o.time.ms += 2_000;
    expect(await s.dispatchAs(KIOSK, stamp(code))).toMatchObject({
      ok: false,
      refusal: { code: "duplicate_scan" },
    });
  });

  it("a dataset switch in another tab during the latency wait refuses the commit as `unavailable`", async () => {
    const o = origin();
    const a = await restored(o.tab());
    const b = await restored(o.tab());
    await a.setPrefs({ latencyMs: 20 });
    await settle();
    const pending = a.dispatchAs(KIOSK, stamp(badges()[0]!.code));
    await b.setScenario("busy");
    expect(await pending).toEqual({
      ok: false,
      refusal: { code: "unavailable", detail: { reason: "world changed" } },
    });
    expect(a.scenario).toBe("busy");
    expect(storedInstants(o.storage)).toEqual([]);
  });

  it("a kiosk left running past the expiry refuses the next scan and shows the fresh world first", async () => {
    const o = origin();
    const a = await restored(o.tab());
    const code = badges()[0]!.code;
    await a.dispatchAs(KIOSK, stamp(code));
    o.time.ms += 13 * 60 * MINUTE;
    // The person means "out"; the world they stamped in has expired.
    expect(await a.dispatchAs(KIOSK, stamp(code))).toEqual({
      ok: false,
      refusal: { code: "unavailable", detail: { reason: "world changed" } },
    });
    expect(a.notice).toBe("expired");
    expect(a.world).toBe(seedWorld("kranich", "evening"));
    // The next scan, on the world the screen now shows, is accepted.
    expect(await a.dispatchAs(KIOSK, stamp(code))).toMatchObject({
      ok: true,
      result: { kind: "in" },
    });
  });

  it("a command type named like an object's own property resolves a refusal and writes nothing", async () => {
    const o = origin();
    const s = await restored(o.tab());
    for (const type of ["constructor", "hasOwnProperty.x"])
      expect(await s.dispatchAs(KIOSK, { type } as unknown as Command)).toEqual(
        {
          ok: false,
          refusal: { code: "invalid", detail: { reason: "unknown command" } },
        },
      );
    expect(storedLog(o.storage)).toEqual([]);
  });

  it("a command that makes apply throw resolves `invalid` and writes nothing", async () => {
    const o = origin();
    const s = await restored(o.tab());
    const hostile = {
      get type(): string {
        throw new Error("boom");
      },
    } as unknown as Command;
    expect(await s.dispatchAs(KIOSK, hostile)).toEqual({
      ok: false,
      refusal: { code: "invalid", detail: { reason: "threw" } },
    });
    expect(storedLog(o.storage)).toEqual([]);
  });
});

describe("session: storage that fails or vanishes", () => {
  it("a storage write that throws (quota, a blocked origin) resolves `unavailable` and the tab recovers", async () => {
    const storage = new MemoryStorage();
    let fail = false;
    class Flaky extends MemoryStorage {
      override setItem(k: string, v: string) {
        if (fail) throw new Error("QuotaExceededError");
        storage.setItem(k, v);
      }
      override getItem = (k: string) => storage.getItem(k);
      override removeItem = (k: string) => storage.removeItem(k);
      override key = (i: number) => storage.key(i);
      override get length() {
        return storage.length;
      }
    }
    const flaky = new Flaky();
    const o = origin({ storage, store: createMemoryStore(flaky) });
    const s = await restored(o.tab());
    fail = true;
    expect(await s.dispatchAs(KIOSK, stamp(badges()[0]!.code))).toEqual({
      ok: false,
      refusal: { code: "unavailable", detail: { reason: "storage" } },
    });
    fail = false;
    await settle();
    expect((await s.dispatchAs(KIOSK, stamp(badges()[0]!.code))).ok).toBe(true);
  });

  it("after the storage is wiped under an open tab, its next commit resolves `unavailable` and the one after succeeds", async () => {
    const o = origin();
    const a = await restored(o.tab());
    for (const c of badges().slice(0, 3))
      await a.dispatchAs(KIOSK, stamp(c.code));
    wipe(o.storage);
    expect(await a.dispatchAs(KIOSK, stamp(badges()[4]!.code))).toEqual({
      ok: false,
      refusal: { code: "unavailable", detail: { reason: "world changed" } },
    });
    expect(a.world).toBe(seedWorld("kranich", "evening"));
    expect((await a.dispatchAs(KIOSK, stamp(badges()[4]!.code))).ok).toBe(true);
    const fresh = await restored(o.tab());
    expect(hashOf(fresh.world)).toBe(hashOf(a.world));
  });

  it("after a wipe a new tab's log is never folded onto the old tab's own prefix", async () => {
    const o = origin();
    const a = await restored(o.tab());
    const people = badges();
    for (const c of people.slice(0, 2))
      await a.dispatchAs(KIOSK, stamp(c.code));
    await settle();
    wipe(o.storage);
    const b = await restored(o.tab());
    for (const c of people.slice(2, 5))
      await b.dispatchAs(KIOSK, stamp(c.code));
    await settle();
    expect(hashOf(a.world)).toBe(hashOf(b.world));
  });

  it("a tab that restores past the expiry tells the open tabs, which start over too", async () => {
    const o = origin();
    const a = await restored(o.tab());
    await a.dispatchAs(KIOSK, stamp(badges()[0]!.code));
    o.time.ms += EXPIRY_MS + MINUTE;
    const b = await restored(o.tab());
    await settle();
    expect(b.notice).toBe("expired");
    expect(hashOf(a.world)).toBe(hashOf(b.world));
  });
});

describe("session: two tenants on one origin", () => {
  it("a reset in one tenant's tab starts the other tenant's open tab over too", async () => {
    const o = origin();
    const k = await restored(o.tab());
    const h = await restored(o.tab({ tenantId: "hafenbar" }));
    await h.setScenario("busy");
    await settle();
    await k.reset();
    await settle();
    const fresh = await restored(o.tab({ tenantId: "hafenbar" }));
    expect(h.scenario).toBe("evening");
    expect(fresh.scenario).toBe("evening");
    expect(hashOf(h.world)).toBe(hashOf(fresh.world));
  });

  it("a dataset switch in one tenant leaves the other tenant's clock where it was", async () => {
    const o = origin();
    const k = await restored(o.tab());
    const h = await restored(o.tab({ tenantId: "hafenbar" }));
    o.time.ms += 30 * MINUTE;
    const before = h.clock.now().getTime();
    await k.setScenario("dst-autumn");
    await settle();
    expect(h.clock.now().getTime()).toBe(before);
  });
});

describe("clock: shared between tabs without lost updates", () => {
  it("two tabs advance while a message is in flight: both advances count and the log never runs backwards", async () => {
    const o = origin();
    const a = await restored(o.tab());
    const b = await restored(o.tab());
    o.bus.mode = "hold";
    a.clock.advance(30);
    await settle();
    await a.dispatchAs(KIOSK, stamp(badges()[0]!.code));
    // B has not heard of A's advance.
    b.clock.advance(15);
    await settle();
    await a.dispatchAs(KIOSK, stamp(badges()[1]!.code));
    o.bus.flush();
    await settle();
    expect(JSON.parse(o.storage.getItem(KEYS.meta)!).clock.offsetMinutes).toBe(
      45,
    );
    expect(storedInstants(o.storage)).toEqual([
      "2026-11-20T18:12:00Z",
      "2026-11-20T18:27:00Z",
    ]);
    expect(a.clock.instant).toBe("2026-11-20T18:27:00Z");
    expect(b.clock.instant).toBe("2026-11-20T18:27:00Z");
  });

  it("freeze and resume in a tab with a stale clock keep the other tab's advance", async () => {
    const o = origin();
    const a = await restored(o.tab());
    const b = await restored(o.tab());
    o.bus.mode = "hold";
    a.clock.advance(60);
    await settle();
    b.clock.freeze();
    await settle();
    expect(b.clock.instant).toBe("2026-11-20T18:42:00Z");
    o.time.ms += 5 * MINUTE;
    b.clock.resume();
    await settle();
    o.bus.flush();
    await settle();
    expect(a.clock.instant).toBe("2026-11-20T18:42:00Z");
    expect(b.clock.instant).toBe("2026-11-20T18:42:00Z");
  });

  it("a lock granted out of order still reads the clock inside it, so a later grant never gets an earlier instant", async () => {
    // A lock may grant in any order; it only promises one holder at a time.
    const storage = new MemoryStorage();
    const inner = createMemoryLock();
    let gate: (() => void) | null = null;
    let holdNext = false;
    const lock: LockRunner = <T>(fn: () => T) => {
      if (!holdNext) return inner(fn);
      holdNext = false;
      return new Promise<void>((r) => (gate = r)).then(() => inner(fn));
    };
    const o = origin({ storage, store: createStore(storage, lock) });
    const a = await restored(o.tab());
    const b = await restored(o.tab());
    holdNext = true;
    o.time.ms = START_MS + 59_000;
    const pending = a.dispatchAs(KIOSK, stamp(badges()[0]!.code));
    o.time.ms = START_MS + 61_000;
    await b.dispatchAs(KIOSK, stamp(badges()[1]!.code));
    gate!();
    await pending;
    expect(storedInstants(storage)).toEqual([
      "2026-11-20T17:43:00Z",
      "2026-11-20T17:43:00Z",
    ]);
  });

  it("a dataset switch begins at the dataset's own instant, after real time passed and the clock was advanced, in every tab", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const o = origin();
    const a = await restored(o.tab());
    const b = await restored(o.tab());
    o.time.ms += 30 * MINUTE + 17_000;
    await vi.advanceTimersByTimeAsync(30 * MINUTE + 17_000);
    a.clock.advance(120);
    await settle();
    await a.setScenario("dst-autumn");
    await settle();
    expect(a.clock.instant).toBe("2026-10-25T00:52:00Z");
    expect(b.clock.instant).toBe("2026-10-25T00:52:00Z");
    const first = await a.dispatchAs(KIOSK, stamp(badges(a.world)[0]!.code));
    expect(first.ok && first.result).toMatchObject({
      at: "2026-10-25T00:52:00Z",
    });
    // Live time runs on from there.
    o.time.ms += 8 * MINUTE;
    await vi.advanceTimersByTimeAsync(8 * MINUTE);
    expect(b.clock.instant).toBe("2026-10-25T01:00:00Z");
  });
});

/**
 * A lock that grants its waiting callers in a drawn order, one at a time. The
 * Web Locks API promises one holder, not the order in which tabs asked.
 */
function shufflingLock(draw: (n: number) => number): LockRunner {
  const waiting: (() => void)[] = [];
  let busy = false;
  const next = () => {
    if (busy || waiting.length === 0) return;
    busy = true;
    const [run] = waiting.splice(draw(waiting.length), 1);
    run!();
  };
  return <T>(fn: () => T) =>
    new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        try {
          resolve(fn());
        } catch (e) {
          reject(e);
        } finally {
          busy = false;
          queueMicrotask(next);
        }
      });
      queueMicrotask(next);
    });
}

/** One replayable run of random operations over two tenants' tabs; returns what broke. */
async function propertyRun(
  seed: string,
): Promise<{ ops: string[]; problems: string[]; accepted: number }> {
  const prng = createPrng(seed);
  const lockDraw = createPrng(`${seed}:lock`);
  const storage = new MemoryStorage();
  const store = createStore(
    storage,
    shufflingLock((n) => lockDraw.int(0, n - 1)),
  );
  const o = origin({ storage, store });
  const tenants: TenantId[] = [
    "kranich",
    "kranich",
    "kranich",
    "hafenbar",
    "hafenbar",
  ];
  const pages = tenants.map(() => createVisibilitySwitch(true));
  const tabs: Session[] = [];
  for (const [i, tenantId] of tenants.entries())
    tabs.push(await restored(o.tab({ tenantId, visibility: pages[i]! })));
  const branchOf = (s: Session) =>
    Object.keys(s.world.locations).sort()[0] as LocationId;
  const ops: string[] = [];
  let accepted = 0;
  const pending: Promise<unknown>[] = [];
  const drain = async () => {
    let done = false;
    const all = Promise.all(pending.splice(0)).then(() => (done = true));
    for (let i = 0; i < 200 && !done; i++)
      await vi.advanceTimersByTimeAsync(10);
    await all;
    await settle();
  };

  for (let i = 0; i < 60; i++) {
    const t = prng.int(0, tabs.length - 1);
    const s = tabs[t]!;
    const roll = prng.int(0, 29);
    if (roll < 14) {
      const codes = badges(s.world).slice(0, 6);
      const code = codes.length ? prng.pick(codes).code : "sb_none";
      const locationId = branchOf(s);
      pending.push(
        s
          .dispatchAs(
            { kind: "kiosk", locationId },
            { type: "stamp", code, locationId },
          )
          .then((out) => {
            if (out.ok) accepted++;
          }),
      );
      ops.push(`${t}:stamp`);
    } else if (roll === 14) {
      const scenario = prng.pick([
        "evening",
        "busy",
        "empty",
        "review",
        "dst-autumn",
      ] as const);
      pending.push(s.setScenario(scenario));
      ops.push(`${t}:scenario ${scenario}`);
    } else if (roll === 15 && prng.int(0, 2) === 0) {
      pending.push(s.reset());
      ops.push(`${t}:reset`);
    } else if (roll === 16) {
      o.bus.mode = prng.pick(["deliver", "hold", "drop"] as const);
      ops.push(`bus ${o.bus.mode}`);
    } else if (roll === 17) {
      o.bus.flush();
      ops.push("flush");
    } else if (roll === 18) {
      pages[t]!.set(!pages[t]!.visible());
      ops.push(`${t}:visible ${pages[t]!.visible()}`);
    } else if (roll === 19) {
      const n = prng.int(1, 45);
      s.clock.advance(n);
      ops.push(`${t}:advance ${n}`);
    } else if (roll === 20) {
      s.clock.freeze();
      ops.push(`${t}:freeze`);
    } else if (roll === 21) {
      s.clock.resume();
      ops.push(`${t}:resume`);
    } else if (roll === 22) {
      const ms = prng.int(1, 90) * 1000;
      o.time.ms += ms;
      ops.push(`tick ${ms / 1000}s`);
    } else if (roll === 23) {
      const latencyMs = prng.pick([0, 0, 30]);
      pending.push(s.setPrefs({ latencyMs }));
      ops.push(`${t}:latency ${latencyMs}`);
    } else if (roll === 24) {
      pending.push(s.setPrefs({ failNextSave: true }));
      ops.push(`${t}:failNextSave`);
    } else {
      await drain();
      ops.push("await");
    }
  }
  await drain();

  // Heal: messages flow again and every page hides and shows once.
  o.bus.mode = "deliver";
  o.bus.flush();
  await settle();
  for (const page of pages) {
    page.set(false);
    page.set(true);
  }
  await drain();
  for (const s of tabs) await s.setPrefs({ latencyMs: 0 });
  await drain();

  const problems: string[] = [];
  for (const tenantId of ["kranich", "hafenbar"] as const) {
    const fresh = await restored(o.tab({ tenantId }));
    for (const [i, s] of tabs.entries()) {
      if (s.tenantId !== tenantId) continue;
      if (hashOf(s.world) !== hashOf(fresh.world))
        problems.push(
          `tab ${i} (${tenantId}) holds another world than a fresh tab`,
        );
      if (s.clock.instant !== fresh.clock.instant)
        problems.push(
          `tab ${i} shows ${s.clock.instant}, a fresh tab ${fresh.clock.instant}`,
        );
    }
    if (!neverBackwards(storedInstants(storage, tenantId)))
      problems.push(`${tenantId}: the stored instants run backwards`);
  }
  for (const [i, s] of tabs.entries())
    if (s.notice === "diverged") problems.push(`tab ${i} diverged`);
  return { ops, problems, accepted };
}

describe("session: the property, over many replayable seeds", () => {
  it("after any interleaving of commits, dataset switches, resets, lost messages, clock changes and lock orders, every tab agrees with a fresh tab", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // SESSION_PROPERTY_SEED replays one failing seed; SESSION_PROPERTY_RUNS widens the search.
    const only = process.env.SESSION_PROPERTY_SEED;
    const runs = Number(process.env.SESSION_PROPERTY_RUNS ?? 24);
    const seeds = only
      ? [only]
      : Array.from({ length: runs }, (_, k) => `session-${k}`);
    const failures: string[] = [];
    let accepted = 0;
    for (const seed of seeds) {
      const run = await propertyRun(seed);
      const { ops, problems } = run;
      accepted += run.accepted;
      for (const s of sessions.splice(0)) s.destroy();
      if (problems.length > 0)
        failures.push(
          `seed ${seed}: ${problems.join("; ")}\n  ops: ${ops.join(", ")}`,
        );
    }
    expect(failures).toEqual([]);
    // The runs commit for real, not only refuse.
    expect(accepted).toBeGreaterThan(seeds.length * 3);
  }, 120_000);
});
