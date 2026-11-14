import { describe, expect, it } from "vitest";
import { chirp } from "./index.js";

describe("chirp", () => {
  it("greets the name it is given", () => {
    expect(chirp("Atlas")).toBe("Aurora canary says hello again, nobody.");
  });

  it("falls back to the world for a blank name", () => {
    expect(chirp("   ")).toBe("Aurora canary says hello again, world.");
  });
});
