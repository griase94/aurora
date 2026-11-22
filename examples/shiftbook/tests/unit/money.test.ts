import { describe, expect, it } from "vitest";
import {
  isMinorUnits,
  MAX_ENTRY,
  sumMinor,
} from "../../src/lib/domain/money.ts";
import { createPrng } from "../../src/lib/world/prng.ts";

describe("money: integer minor units", () => {
  it("sums worked examples exactly: 12.50 + 0.99 + 0.01 is 13.50", () => {
    expect(sumMinor([1250, 99, 1])).toBe(1350);
    expect(sumMinor([MAX_ENTRY, MAX_ENTRY])).toBe(19_999_998);
    expect(sumMinor([500, -200])).toBe(300);
    expect(sumMinor([])).toBe(0);
  });

  it("refuses a float, NaN or Infinity, so none of them can ever enter a sum", () => {
    expect(isMinorUnits(12.5)).toBe(false);
    expect(() => sumMinor([100, 12.5])).toThrow(TypeError);
    expect(() => sumMinor([100, Number.NaN])).toThrow(TypeError);
    expect(() => sumMinor([Number.POSITIVE_INFINITY])).toThrow(TypeError);
  });

  it("refuses a sum past the safe integer range, also one that would come back into it", () => {
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
    // 2^53 + 1 cannot be represented; summing on would give a wrong, safe-looking total.
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 2, -2])).toThrow(
      RangeError,
    );
  });

  it("stays an integer for any list of random amounts", () => {
    const prng = createPrng("money");
    for (let run = 0; run < 200; run++) {
      const values = Array.from({ length: prng.int(0, 50) }, () =>
        prng.int(1, MAX_ENTRY),
      );
      expect(Number.isSafeInteger(sumMinor(values))).toBe(true);
    }
  });
});
