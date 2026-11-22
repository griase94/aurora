/**
 * The seed's only source of variety: a 32-bit generator (mulberry32) seeded
 * from a string, so `tenantId + scenario` gives the same sequence everywhere.
 */
import { fnv1a } from "../domain/hash.ts";

export interface Prng {
  /** A number in [0, 1). */
  next(): number;
  /** An integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** One element of a non-empty list. */
  pick<T>(list: readonly T[]): T;
}

export function createPrng(seed: string): Prng {
  let a = Number.parseInt(fnv1a(seed), 16) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (list) => {
      if (list.length === 0) throw new RangeError("pick from an empty list");
      return list[Math.floor(next() * list.length)]!;
    },
  };
}
