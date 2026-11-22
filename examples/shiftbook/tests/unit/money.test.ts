import { describe, expect, it } from "vitest";
import {
  isMinorUnits,
  MAX_ENTRY,
  sumMinor,
} from "../../src/lib/domain/money.ts";
import { createPrng } from "../../src/lib/world/prng.ts";

describe("money: integer minor units", () => {
  it("sums equal the entries for any list of random amounts, and stay integers", () => {
    const prng = createPrng("money");
    for (let run = 0; run < 200; run++) {
      const values = Array.from({ length: prng.int(0, 50) }, () =>
        prng.int(1, MAX_ENTRY),
      );
      let expected = 0;
      for (const v of values) expected += v;
      const total = sumMinor(values);
      expect(total).toBe(expected);
      expect(Number.isInteger(total)).toBe(true);
    }
  });

  it("refuses a float, so a float can never enter a sum", () => {
    expect(isMinorUnits(12.5)).toBe(false);
    expect(() => sumMinor([100, 12.5])).toThrow(TypeError);
    expect(sumMinor([])).toBe(0);
  });
});
