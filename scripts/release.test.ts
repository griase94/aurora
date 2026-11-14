import { describe, expect, it } from "vitest";
import {
  highestLevel,
  latestTag,
  nextVersion,
  plan,
  releaseNotes,
  releasedManifest,
  section,
  sha256sums,
  visibleInApps,
} from "./release.mjs";

// Built from parts, so the scope check does not read these fixtures as real names.
const scoped = (scope: string, name: string) => `@${scope}/aurora-${name}`;

const pr = (
  number: number,
  labels: string[],
  body = "",
  title = `Change ${number}`,
) => ({
  number,
  title,
  body,
  labels,
});

describe("latestTag", () => {
  it("picks the highest version, not the last listed", () => {
    expect(latestTag(["v0.0.9", "v0.0.10", "v0.0.2"])).toBe("v0.0.10");
    expect(latestTag(["v0.2.0", "v0.10.0", "v1.0.0-rc.1"])).toBe("v0.10.0");
  });

  it("ignores other tags and returns null without a release", () => {
    expect(latestTag(["nightly", "0.3.0"])).toBeNull();
    expect(latestTag([])).toBeNull();
  });

  it("ignores versions with leading zeros", () => {
    expect(latestTag(["v0.1.0", "v0.2.0", "v00.3.0", "v0.03.0"])).toBe(
      "v0.2.0",
    );
  });
});

describe("nextVersion", () => {
  it("starts at 0.0.1 for a first patch release", () => {
    expect(nextVersion(null, "patch")).toBe("0.0.1");
  });

  it("treats minor as the breaking level while 0.x", () => {
    expect(nextVersion("v0.3.4", "minor")).toBe("0.4.0");
    expect(nextVersion("v0.3.4", "patch")).toBe("0.3.5");
  });

  it("refuses major while 0.x unless 1.0 is allowed", () => {
    expect(() => nextVersion("v0.3.4", "major")).toThrow(/--allow-1.0/);
    expect(nextVersion("v0.3.4", "major", { allow1: true })).toBe("1.0.0");
  });

  it("follows semver after 1.0", () => {
    expect(nextVersion("v1.2.3", "major")).toBe("2.0.0");
    expect(nextVersion("v1.2.3", "minor")).toBe("1.3.0");
    expect(nextVersion("v1.2.3", "patch")).toBe("1.2.4");
  });

  it("refuses an unknown level", () => {
    expect(() => nextVersion("v0.1.0", "skip")).toThrow(/unknown level/);
  });
});

describe("highestLevel", () => {
  it("takes the highest label across the merged pull requests", () => {
    expect(
      highestLevel([pr(1, ["aurora:patch"]), pr(2, ["aurora:minor"])]),
    ).toBe("minor");
    expect(highestLevel([pr(1, ["aurora:skip"]), pr(2, ["bug"])])).toBe("skip");
    expect(highestLevel([])).toBe("skip");
  });
});

describe("plan", () => {
  const tags = [{ name: "v0.0.1", sha: "aaa" }];

  it("is a no-op for a commit that already carries a release tag", () => {
    expect(
      plan({
        tags,
        head: "aaa",
        prs: [pr(1, ["aurora:patch"])],
        packagesChanged: true,
      }),
    ).toEqual({ release: false, reason: "aaa is already released as v0.0.1" });
  });

  it("skips when nothing under packages/ changed", () => {
    const result = plan({
      tags,
      head: "bbb",
      prs: [pr(2, ["aurora:patch"])],
      packagesChanged: false,
    });
    expect(result).toMatchObject({ release: false });
  });

  it("skips on aurora:skip when nothing under packages/ changed", () => {
    expect(
      plan({
        tags,
        head: "bbb",
        prs: [pr(2, ["aurora:skip"])],
        packagesChanged: false,
      }),
    ).toMatchObject({ release: false });
  });

  it("fails when packages/ changed but no pull request asks for a release", () => {
    for (const labels of [["aurora:skip"], [], ["bug"]])
      expect(() =>
        plan({
          tags,
          head: "bbb",
          prs: [pr(2, labels)],
          packagesChanged: true,
        }),
      ).toThrow(/no merged pull request since then carries.*#2/);
  });

  it("releases nothing for a head that is not after the latest release, even at a level given by hand", () => {
    const older = [
      { name: "v0.0.1", sha: "aaa" },
      { name: "v0.0.2", sha: "ccc" },
    ];
    for (const level of [undefined, "patch"])
      expect(
        plan({
          tags: older,
          head: "bbb",
          prs: [],
          packagesChanged: true,
          headAfterLast: false,
          level,
        }),
      ).toEqual({ release: false, reason: "head bbb is not after v0.0.2" });
  });

  it("fails when packages/ changed and no merged pull request was found", () => {
    expect(() =>
      plan({ tags, head: "bbb", prs: [], packagesChanged: true }),
    ).toThrow(/no merged pull request was found/);
  });

  it("releases at the level given by hand, whatever the labels say", () => {
    expect(
      plan({
        tags,
        head: "bbb",
        prs: [],
        packagesChanged: true,
        level: "minor",
      }),
    ).toMatchObject({ release: true, version: "0.1.0", level: "minor" });
    expect(() =>
      plan({ tags, head: "bbb", prs: [], packagesChanged: true, level: "x" }),
    ).toThrow(/unknown level/);
  });

  it("releases the next version and marks 0.0.x as a pre-release", () => {
    expect(
      plan({
        tags,
        head: "bbb",
        prs: [pr(2, ["aurora:patch"])],
        packagesChanged: true,
      }),
    ).toEqual({
      release: true,
      version: "0.0.2",
      tag: "v0.0.2",
      level: "patch",
      prerelease: true,
    });
  });

  it("releases the first version without any tag", () => {
    expect(
      plan({
        tags: [],
        head: "ccc",
        prs: [pr(3, ["aurora:patch"])],
        packagesChanged: true,
      }),
    ).toMatchObject({
      release: true,
      version: "0.0.1",
    });
  });

  it("does not mark 0.1.0 as a pre-release", () => {
    expect(
      plan({
        tags,
        head: "bbb",
        prs: [pr(2, ["aurora:minor"])],
        packagesChanged: true,
      }),
    ).toMatchObject({
      version: "0.1.0",
      prerelease: false,
    });
  });
});

const body = [
  "## Why",
  "Because.",
  "",
  "## Changelog",
  "<!-- One or two sentences for app developers. -->",
  "- `chirp` trims the name.",
  "",
  "Visible in apps: **fix**",
  "",
  "## Not checked by CI",
  "Nothing.",
].join("\n");

describe("section and visibleInApps", () => {
  it("reads the Changelog section without template comments", () => {
    expect(section(body, "Changelog")).toBe(
      "- `chirp` trims the name.\n\nVisible in apps: **fix**",
    );
  });

  it("does not end the section at a # inside a code fence", () => {
    expect(
      section(
        "## Changelog\n```sh\n# comment\n```\nafter\n## Tests\nno",
        "Changelog",
      ),
    ).toBe("```sh\n# comment\n```\nafter");
    expect(
      section("## Changelog\n~~~\n## not a heading\n~~~\n# Next", "Changelog"),
    ).toBe("~~~\n## not a heading\n~~~");
  });

  it("closes a fence the section leaves open", () => {
    expect(section("## Changelog\n````md\n# x\n```\n", "Changelog")).toBe(
      "````md\n# x\n```\n````",
    );
  });

  it("returns an empty string for a missing section", () => {
    expect(section("no headings", "Changelog")).toBe("");
  });

  it("reads the Visible in apps answer", () => {
    expect(visibleInApps(body)).toBe("fix");
    expect(visibleInApps("Visible in apps: improvement")).toBe("improvement");
    expect(visibleInApps("Visible in apps: fix | improvement | none")).toBe(
      "fix",
    );
    expect(visibleInApps("")).toBeNull();
  });

  it("ignores the answer inside a template comment", () => {
    expect(visibleInApps("<!-- Visible in apps: none -->")).toBeNull();
  });
});

describe("releaseNotes", () => {
  const notes = releaseNotes({
    version: "0.0.2",
    repository: "someone/aurora",
    packages: [scoped("example", "canary")],
    prs: [
      pr(7, ["aurora:patch"], body, "Trim the name"),
      pr(8, ["aurora:skip"], "", "Docs only"),
    ],
  });

  it("flags 0.0.x as a pipeline proof", () => {
    expect(notes).toContain("Pipeline proof");
  });

  it("lists released pull requests with their changelog and leaves skipped ones out", () => {
    expect(notes).toContain("### Trim the name (#7)");
    expect(notes).toContain("- `chirp` trims the name.");
    expect(notes).toContain("Visible in apps: fix");
    expect(notes.match(/Visible in apps/g)).toHaveLength(1);
    expect(notes).not.toContain("Docs only");
  });

  it("links the pin script and the contract at the tag and shows the app-side command", () => {
    const at = "https://github.com/someone/aurora/blob/v0.0.2";
    expect(notes).toContain(`(${at}/scripts/consumer/aurora-pin.mjs)`);
    expect(notes).toContain(`(${at}/docs/CONSUMING.md)`);
    expect(notes).toContain(
      "node scripts/aurora-pin.mjs 0.0.2 --owner someone",
    );
  });

  it("shows the asset URLs under the neutral key and as the override", () => {
    const url = `https://github.com/someone/aurora/releases/download/v0.0.2/${["example", "aurora", "canary", "0.0.2.tgz"].join("-")}`;
    expect(notes).toContain(`"@aurora/canary": "${url}"`);
    expect(notes).toContain(`"${scoped("example", "canary")}": "${url}"`);
  });

  it("says when a pull request has no changelog", () => {
    const bare = releaseNotes({
      version: "0.1.0",
      repository: "a/b",
      packages: [],
      prs: [pr(1, ["aurora:minor"])],
    });
    expect(bare).toContain("No changelog entry.");
    expect(bare).toContain("Visible in apps: not stated");
    expect(bare).not.toContain("Pipeline proof");
  });
});

describe("sha256sums", () => {
  it("writes sorted sha256sum lines", () => {
    expect(
      sha256sums([
        { name: "b.tgz", data: "b" },
        { name: "a.tgz", data: "" },
      ]),
    ).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  a.tgz\n" +
        "3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d  b.tgz\n",
    );
  });
});

describe("releasedManifest", () => {
  it("sets the version, drops private and names the repository", () => {
    expect(
      releasedManifest(
        { name: scoped("example", "canary"), version: "0.0.0", private: true },
        {
          version: "0.0.3",
          repository: "someone/aurora",
          directory: "packages/canary",
        },
      ),
    ).toEqual({
      name: scoped("example", "canary"),
      version: "0.0.3",
      repository: {
        type: "git",
        url: "git+https://github.com/someone/aurora.git",
        directory: "packages/canary",
      },
    });
  });

  it("refuses a malformed version or repository", () => {
    expect(() =>
      releasedManifest(
        {},
        { version: "1.0", repository: "a/b", directory: "x" },
      ),
    ).toThrow();
    expect(() =>
      releasedManifest(
        {},
        { version: "1.0.0", repository: "a b", directory: "x" },
      ),
    ).toThrow();
  });
});
