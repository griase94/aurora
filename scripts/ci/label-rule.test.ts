import { describe, expect, it } from "vitest";
import { labelProblems } from "./label-rule.mjs";

const base = { packagesChanged: true, latest: "v0.0.3" };

describe("labelProblems", () => {
  it("accepts exactly one release label that fits", () => {
    expect(labelProblems({ ...base, labels: ["aurora:patch", "bug"] })).toEqual(
      [],
    );
    expect(labelProblems({ ...base, labels: ["aurora:minor"] })).toEqual([]);
    expect(
      labelProblems({
        ...base,
        packagesChanged: false,
        labels: ["aurora:skip"],
      }),
    ).toEqual([]);
  });

  it("asks for a label when none is set", () => {
    expect(labelProblems({ ...base, labels: ["bug"] })[0]).toMatch(
      /add exactly one/,
    );
  });

  it("refuses two release labels", () => {
    expect(
      labelProblems({ ...base, labels: ["aurora:patch", "aurora:minor"] })[0],
    ).toMatch(/keep exactly one/);
  });

  it("refuses aurora:skip when a package changed", () => {
    expect(labelProblems({ ...base, labels: ["aurora:skip"] })[0]).toMatch(
      /packages\/ changed/,
    );
  });

  it("refuses aurora:major while 0.x, before the first release too", () => {
    expect(labelProblems({ ...base, labels: ["aurora:major"] })[0]).toMatch(
      /0\.x/,
    );
    expect(
      labelProblems({ ...base, latest: null, labels: ["aurora:major"] })[0],
    ).toMatch(/0\.x/);
  });

  it("allows aurora:major after 1.0 or when 1.0 is allowed", () => {
    expect(
      labelProblems({ ...base, latest: "v1.4.0", labels: ["aurora:major"] }),
    ).toEqual([]);
    expect(
      labelProblems({ ...base, allow1: true, labels: ["aurora:major"] }),
    ).toEqual([]);
  });
});
