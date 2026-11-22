/**
 * The tab channel: "there is more to read". A message carries no data; the
 * receiving tab reads the store from its own position, so a lost or late
 * message only delays a tab, and the next message (or becoming visible) heals
 * it. Seam: `BroadcastChannel` in the browser, a scripted fake in unit tests.
 */
import type { TenantId } from "../domain/types.ts";

export type ChannelMessage =
  | { kind: "log"; tenant: TenantId; epoch: number; seq: number }
  | { kind: "meta" };

export interface SessionChannel {
  /** Tells every other tab; never the sender. */
  post(message: ChannelMessage): void;
  subscribe(fn: (message: ChannelMessage) => void): () => void;
}

export const CHANNEL_NAME = "shiftbook.v1";

/** The browser adapter. Without `BroadcastChannel` it posts and hears nothing. */
export function createBrowserChannel(name = CHANNEL_NAME): SessionChannel {
  if (typeof BroadcastChannel === "undefined")
    return { post() {}, subscribe: () => () => {} };
  const bc = new BroadcastChannel(name);
  return {
    post: (m) => bc.postMessage(m),
    subscribe(fn) {
      const on = (e: MessageEvent<ChannelMessage>) => fn(e.data);
      bc.addEventListener("message", on);
      return () => bc.removeEventListener("message", on);
    },
  };
}

/** How the fake delivers: at once, held until `flush()`, or not at all. */
export type DeliveryMode = "deliver" | "hold" | "drop";

/**
 * Fake tabs on one bus. Each `channel()` is one tab's end. In `deliver` mode a
 * message reaches the other ends in a microtask, as `BroadcastChannel` does
 * asynchronously; `hold` queues it until `flush()`; `drop` loses it.
 */
export interface FakeChannelBus {
  channel(): SessionChannel;
  mode: DeliveryMode;
  /** Delivers every held message, in the order they were posted. */
  flush(): void;
  /** Every message posted so far, delivered or not. */
  readonly posted: readonly ChannelMessage[];
}

export function createFakeChannelBus(): FakeChannelBus {
  const ends = new Set<{ listeners: Set<(m: ChannelMessage) => void> }>();
  const held: { from: object; message: ChannelMessage }[] = [];
  const posted: ChannelMessage[] = [];
  const deliver = (from: object, message: ChannelMessage) => {
    for (const end of ends)
      if (end !== from) for (const fn of end.listeners) fn(message);
  };
  const bus: FakeChannelBus = {
    mode: "deliver",
    posted,
    flush() {
      for (const h of held.splice(0)) deliver(h.from, h.message);
    },
    channel() {
      const end = { listeners: new Set<(m: ChannelMessage) => void>() };
      ends.add(end);
      return {
        post(message) {
          posted.push(message);
          if (bus.mode === "drop") return;
          if (bus.mode === "hold") {
            held.push({ from: end, message });
            return;
          }
          queueMicrotask(() => deliver(end, message));
        },
        subscribe(fn) {
          end.listeners.add(fn);
          return () => end.listeners.delete(fn);
        },
      };
    },
  };
  return bus;
}
