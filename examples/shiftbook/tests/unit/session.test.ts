import { afterEach, describe, expect, it, vi } from "vitest";
import { hashOf } from "../../src/lib/domain/hash.ts";
import type {
  Actor,
  Command,
  LocationId,
  PersonId,
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
  createMemoryStore,
  EXPIRY_MS,
  KEYS,
  LOG_CAP,
  MemoryStorage,
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
    extra: { visibility?: ReturnType<typeof createVisibilitySwitch> } = {},
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

describe("session: two tabs, one log (H3)", () => {
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

  it("fifty interleaved random commands leave every tab with the same world, and a fresh tab agrees", async () => {
    const { tab, storage, time } = origin();
    const tabs = [
      await restored(tab()),
      await restored(tab()),
      await restored(tab()),
    ];
    const prng = createPrng("session-property");
    const people = badges();
    const pending: Promise<unknown>[] = [];
    for (let i = 0; i < 50; i++) {
      const s = tabs[prng.int(0, tabs.length - 1)]!;
      const roll = prng.int(0, 9);
      const command: Command =
        roll === 0
          ? stamp("sb_unknownunknownunknownunkn")
          : roll === 1
            ? { type: "tip.remove", id: "tip_x" as never, reason: "test" }
            : stamp(people[prng.int(0, Math.min(5, people.length - 1))]!.code);
      pending.push(s.dispatchAs(KIOSK, command));
      // Some commits run together, some a minute apart.
      if (prng.int(0, 2) === 0) {
        await Promise.all(pending.splice(0));
        time.ms += MINUTE;
      }
    }
    await Promise.all(pending);
    await settle();
    const hashes = tabs.map((s) => hashOf(s.world));
    expect(new Set(hashes).size).toBe(1);
    expect(tabs.every((s) => s.notice === null)).toBe(true);
    const seqs = storedLog(storage).map(([k]) => Number(k.split(".").pop()));
    expect(seqs.sort((x, y) => x - y)).toEqual(seqs.map((_, i) => i + 1));
    expect(seqs.length).toBeGreaterThan(5);
    const fresh = await restored(tab());
    expect(hashOf(fresh.world)).toBe(hashes[0]);
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

describe("session: the simulated network (H27)", () => {
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

describe("session: restore (H1, H2, H4, H21)", () => {
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

  it(`at the cap of ${LOG_CAP} envelopes a commit is refused with \`unavailable\``, async () => {
    const o = origin();
    const s = await restored(o.tab());
    const code = badges()[0]!.code;
    for (let i = 0; i < LOG_CAP; i++) {
      const out = await s.dispatchAs(KIOSK, stamp(code));
      if (!out.ok)
        throw new Error(`commit ${i + 1} refused: ${JSON.stringify(out)}`);
      // Scenario time moves; real time stays within the 12 hours of a session.
      s.clock.advance(1);
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

describe("session: single-tab mode without the lock (H25)", () => {
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
