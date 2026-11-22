/**
 * Money is integer minor units from the field to the export. Parsing happens
 * once (the kit's money field, the import); formatting happens once (the kit's
 * money display). Here: only checks and integer sums.
 */
import type { MinorUnits } from "./types.ts";

/** The largest amount a single entry may hold: 99,999.99 in a two-decimal currency. */
export const MAX_ENTRY: MinorUnits = 9_999_999;

/** Whether a value is a whole number of minor units within the safe integer range. */
export function isMinorUnits(value: unknown): value is MinorUnits {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/** Sums minor units. Throws on a value that is not an integer, so a float can never enter a sum. */
export function sumMinor(values: Iterable<MinorUnits>): MinorUnits {
  let total = 0;
  for (const v of values) {
    if (!isMinorUnits(v)) throw new TypeError(`not minor units: ${String(v)}`);
    total += v;
    // Checked at every step: past the range a later entry could bring an
    // already rounded total back into it.
    if (!Number.isSafeInteger(total))
      throw new RangeError("sum exceeds the safe integer range");
  }
  return total;
}
