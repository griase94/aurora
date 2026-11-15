/**
 * The agent skills in .claude/skills stay loadable and indexed: valid Agent
 * Skills frontmatter (name equal to its folder, a description within the
 * format's limit that says when to load it), a SKILL.md body short enough to
 * load whole, relative links that resolve, and a README index that lists
 * exactly the skills that exist.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { REPO } from "./lib/packages.mjs";
import {
  BODY_MAX_LINES,
  DESCRIPTION_MAX,
  checkSkills,
  parseSkill,
  relativeLinks,
} from "./lib/skills.mjs";

const SKILLS = join(REPO, ".claude", "skills");

describe("agent skills", () => {
  it("every skill in the repository passes", () => {
    expect(checkSkills(SKILLS)).toEqual([]);
  });
});

describe("the skills check", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  /** A skills folder from `files` (path → content); returns its problems. */
  function check(files: Record<string, string>): string[] {
    const root = mkdtempSync(join(tmpdir(), "skills-"));
    dirs.push(root);
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return checkSkills(root);
  }

  const skill = (name: string, description: string, body = "# Body\n") =>
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`;
  const index = (...names: string[]) =>
    names.map((n) => `- [${n}](${n}/SKILL.md)`).join("\n");
  const ok = "Does a thing. Use when the task is that thing.";

  it("passes a valid skill", () => {
    expect(
      check({
        "a-skill/SKILL.md": skill("a-skill", ok),
        "README.md": index("a-skill"),
      }),
    ).toEqual([]);
  });

  it("fails a name that differs from its folder or breaks the pattern", () => {
    const problems = check({
      "a-skill/SKILL.md": skill("Other--Skill", ok),
      "README.md": index("a-skill"),
    });
    expect(problems.join("\n")).toMatch(/lowercase letters/);
    expect(problems.join("\n")).toMatch(/differs from its folder/);
  });

  it("fails a description over the limit or without a trigger", () => {
    const long = `Use when ${"x".repeat(DESCRIPTION_MAX)}`;
    expect(
      check({ "a/SKILL.md": skill("a", long), "README.md": index("a") }).join(
        "\n",
      ),
    ).toMatch(/description has \d+ characters/);
    expect(
      check({
        "a/SKILL.md": skill("a", "Does a thing."),
        "README.md": index("a"),
      }).join("\n"),
    ).toMatch(/does not say when/);
  });

  it("fails a field outside the format and a missing frontmatter", () => {
    expect(
      check({
        "a/SKILL.md": `---\nname: a\ndescription: ${ok}\npaths:\n  - "x/**"\n---\nbody\n`,
        "README.md": index("a"),
      }).join("\n"),
    ).toMatch(/"paths" is not in the Agent Skills format/);
    expect(
      check({
        "a/SKILL.md": "# no frontmatter\n",
        "README.md": index("a"),
      }).join("\n"),
    ).toMatch(/no valid frontmatter/);
  });

  it("fails a body over the line limit", () => {
    const body = "line\n".repeat(BODY_MAX_LINES + 1);
    expect(
      check({
        "a/SKILL.md": skill("a", ok, body),
        "README.md": index("a"),
      }).join("\n"),
    ).toMatch(/body has \d+ lines/);
  });

  it("fails a relative link that does not resolve, in a skill or its references", () => {
    const problems = check({
      "a/SKILL.md": skill("a", ok, "See [it](reference/gone.md).\n"),
      "a/reference/here.md": "[back](../SKILL.md) [out](https://example.com)\n",
      "README.md": index("a"),
    });
    expect(problems).toEqual([
      "a/SKILL.md: link reference/gone.md does not resolve",
    ]);
  });

  it("fails an index that misses a skill or lists one that does not exist", () => {
    const problems = check({
      "a/SKILL.md": skill("a", ok),
      "b/SKILL.md": skill("b", ok),
      "README.md": index("a", "c"),
    });
    expect(problems).toContain("README.md: index does not list b");
    expect(problems).toContain(
      "README.md: index lists c, which does not exist",
    );
  });

  it("reads quoted values and indented maps", () => {
    const parsed = parseSkill(
      '---\nname: a\ndescription: "Quoted: yes. Use when x."\nmetadata:\n  owner: x\n---\nbody\n',
    );
    expect(parsed?.fields.get("description")).toBe("Quoted: yes. Use when x.");
    expect(parsed?.fields.get("metadata")).toContain("owner: x");
  });

  it("ignores links inside code", () => {
    expect(
      relativeLinks("`[a](x.md)`\n```\n[b](y.md)\n```\n[c](z.md)"),
    ).toEqual(["z.md"]);
  });
});
