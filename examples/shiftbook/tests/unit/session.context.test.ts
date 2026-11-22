import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import { createFakeChannelBus } from "../../src/lib/session/channel.ts";
import { reactiveSession, useSession } from "../../src/lib/session/context.ts";
import { createSession } from "../../src/lib/session/session.ts";
import { createMemoryStore } from "../../src/lib/session/store.ts";
import Provider from "../fixtures/session/Provider.svelte";

const session = () =>
  createSession({
    tenantId: "hafenbar",
    store: createMemoryStore(),
    channel: createFakeChannelBus().channel(),
    nowMs: () => 0,
  });

describe("session context", () => {
  it("the layout provides the session and a screen below reads it during SSR, at the dataset's instant", () => {
    const { body } = render(Provider, { props: { session: session() } });
    expect(body).toContain('data-tenant="hafenbar"');
    expect(body).toContain('data-scenario="evening"');
    expect(body).toContain('data-status="ready"');
    expect(body).toContain("2026-11-20T17:42:00Z person");
  });

  it("useSession throws outside a tenant route", () => {
    expect(() => useSession()).toThrow();
  });

  it("the reactive view reads through to the session and binds its methods", async () => {
    const s = session();
    const view = reactiveSession(s);
    expect(view.world).toBe(s.world);
    expect(view.clock.instant).toBe(s.clock.instant);
    await view.restore();
    expect(s.restored).toBe(true);
    expect(view.restored).toBe(true);
    s.destroy();
  });
});
