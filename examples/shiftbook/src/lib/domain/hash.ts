/**
 * Stable hashing: the same value gives the same hash on every machine. Used for
 * the confirmation version (rule 7), the seed hash and the world hash the
 * session tests compare.
 */

/** JSON with object keys in sorted order, so key order never changes a hash. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort())
        sorted[k] = (v as Record<string, unknown>)[k];
      return sorted;
    }
    return v;
  });
}

/** FNV-1a over UTF-16 code units, 32 bits, as eight hex characters. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Eight hex characters over a value's canonical JSON. */
export function hashOf(value: unknown): string {
  return fnv1a(canonicalJson(value));
}
