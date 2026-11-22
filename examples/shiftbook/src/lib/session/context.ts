/**
 * The session in Svelte's context. The tenant layout creates one session per
 * tenant and provides it; every screen below reads it with `useSession()`.
 * Never a module singleton: the prerender renders routes concurrently.
 *
 * The session itself is framework-free; this file makes it reactive: reading
 * any value of the session (or of its clock) inside an effect or a template
 * re-runs that effect when the value changes.
 */
import { getContext, setContext } from "svelte";
import { createSubscriber } from "svelte/reactivity";
import type { Clock } from "./clock.ts";
import type { Session } from "./session.ts";

const KEY = Symbol("shiftbook.session");

/** A view of `target` whose reads subscribe the current effect to `subscribe`. */
function tracked<T extends object>(
  target: T,
  subscribe: (fn: () => void) => () => void,
  override: (prop: PropertyKey) => unknown = () => undefined,
): T {
  const track = createSubscriber((update) => subscribe(update));
  return new Proxy(target, {
    get(t, prop) {
      track();
      const own = override(prop);
      if (own !== undefined) return own;
      const value: unknown = Reflect.get(t, prop, t);
      return typeof value === "function" ? value.bind(t) : value;
    },
  });
}

/** The session as Svelte sees it: every read is tracked, the clock's too. */
export function reactiveSession(session: Session): Session {
  const clock: Clock = tracked(session.clock, (fn) =>
    session.clock.subscribe(fn),
  );
  return tracked(
    session,
    (fn) => session.subscribe(fn),
    (prop) => (prop === "clock" ? clock : undefined),
  );
}

/** Puts the session in context for every component below; returns the reactive view. */
export function provideSession(session: Session): Session {
  const view = reactiveSession(session);
  setContext(KEY, view);
  return view;
}

/** The tenant's session. Throws outside a tenant route, where no layout provided one. */
export function useSession(): Session {
  const session = getContext<Session | undefined>(KEY);
  if (!session)
    throw new Error(
      "useSession() needs a tenant route: the tenant layout provides the session",
    );
  return session;
}
