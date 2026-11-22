/**
 * Whether the page is visible. A tab that becomes visible catches up with the
 * log and checks its age; the clock's minute tick stops while it is hidden.
 * Seam: the document in the browser, a switch in unit tests.
 */
export interface Visibility {
  visible(): boolean;
  subscribe(fn: (visible: boolean) => void): () => void;
}

/** The browser adapter, over `document.visibilityState`. */
export function createDocumentVisibility(doc: Document = document): Visibility {
  return {
    visible: () => doc.visibilityState !== "hidden",
    subscribe(fn) {
      const on = () => fn(doc.visibilityState !== "hidden");
      doc.addEventListener("visibilitychange", on);
      return () => doc.removeEventListener("visibilitychange", on);
    },
  };
}

/** Always visible: SSR, and a session that nothing hides. */
export const ALWAYS_VISIBLE: Visibility = {
  visible: () => true,
  subscribe: () => () => {},
};

/** A switch for tests: `set(false)` hides the page, `set(true)` shows it. */
export function createVisibilitySwitch(initial = true): Visibility & {
  set(visible: boolean): void;
} {
  let visible = initial;
  const listeners = new Set<(v: boolean) => void>();
  return {
    visible: () => visible,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set(v) {
      if (v === visible) return;
      visible = v;
      for (const fn of listeners) fn(v);
    },
  };
}
