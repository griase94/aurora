/**
 * The agent skills in .claude/skills stay loadable and indexed: frontmatter
 * that a strict YAML parser reads (name equal to its folder, a description
 * within the format's limit that says when to load it, no XML tags, no
 * reserved words), a SKILL.md body short enough to load whole, relative links
 * that resolve, a README index and an AGENTS.md list that name exactly the
 * skills that exist, and, once apps/docs is in the repository, every path and
 * package script the skills name, with every named test file inside the root
 * vitest include.
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
  matchesGlob,
  namedFacts,
  parseSkill,
  relativeLinks,
} from "./lib/skills.mjs";

const SKILLS = join(REPO, ".claude", "skills");

describe("agent skills", () => {
  it("every skill in the repository passes", () => {
    expect(checkSkills(SKILLS, { repo: REPO })).toEqual([]);
  });
});

describe("the skills check", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  /** A folder from `files` (path → content); returns its path. */
  function tree(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "skills-"));
    dirs.push(root);
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return root;
  }

  /** A skills folder from `files`; returns its problems. */
  const check = (files: Record<string, string>): string[] =>
    checkSkills(tree(files));

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
    ).toMatch(/no frontmatter between/);
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
      "a/SKILL.md": skill("a", ok, "See [it](references/gone.md).\n"),
      "a/references/here.md":
        "[back](../SKILL.md) [out](https://example.com)\n",
      "README.md": index("a"),
    });
    expect(problems).toEqual([
      "a/SKILL.md: link references/gone.md does not resolve",
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

  it("reads quoted values and nested maps", () => {
    const parsed = parseSkill(
      '---\nname: a\ndescription: "Quoted: yes. Use when x."\nmetadata:\n  owner: x\n---\nbody\n',
    );
    expect(parsed).not.toHaveProperty("error");
    if ("error" in parsed) return;
    expect(parsed.fields.get("description")).toBe("Quoted: yes. Use when x.");
    expect(parsed.fields.get("metadata")).toEqual({ owner: "x" });
  });

  it("fails an unquoted description with a colon, which strict YAML rejects", () => {
    const problems = check({
      "a/SKILL.md": skill("a", "Note: x. Use when y."),
      "README.md": index("a"),
    });
    expect(problems.join("\n")).toMatch(
      /a\/SKILL\.md: frontmatter is not valid YAML/,
    );
  });

  it("reads CRLF line endings", () => {
    expect(
      check({
        "a/SKILL.md": skill("a", ok).replaceAll("\n", "\r\n"),
        "README.md": index("a"),
      }),
    ).toEqual([]);
  });

  it("fails an XML tag in the description and a reserved word in the name", () => {
    const problems = check({
      "claude-a/SKILL.md": skill(
        "claude-a",
        "Does <b>a</b> thing. Use when x.",
      ),
      "README.md": index("claude-a"),
    }).join("\n");
    expect(problems).toMatch(/description contains an XML tag/);
    expect(problems).toMatch(/reserved word "claude"/);
  });

  it("fails an AGENTS.md that does not name every skill", () => {
    const repo = tree({
      ".claude/skills/a/SKILL.md": skill("a", ok),
      ".claude/skills/b/SKILL.md": skill("b", ok),
      ".claude/skills/README.md": index("a", "b"),
      "AGENTS.md": "- components: `a`\n",
    });
    expect(checkSkills(join(repo, ".claude/skills"), { repo })).toEqual([
      "AGENTS.md: the Skills list does not name `b`",
    ]);
  });

  it("holds named paths and scripts against the repository once apps/docs exists", () => {
    const body = [
      "Edit `apps/docs/scripts/real.ts` and `apps/docs/examples/<slug>.svelte`.",
      "```sh",
      "pnpm -C apps/docs kit:api && pnpm -C apps/docs kit:gone",
      "pnpm test:fast tests/unit/gone.test.ts",
      "```",
    ].join("\n");
    const files = {
      ".claude/skills/a/SKILL.md": skill("a", ok, body),
      ".claude/skills/README.md": index("a"),
      "AGENTS.md": "`a`\n",
      "package.json": JSON.stringify({ scripts: { "test:fast": "vitest" } }),
    };
    const before = tree(files);
    expect(
      checkSkills(join(before, ".claude/skills"), { repo: before }),
    ).toEqual([]);
    const after = tree({
      ...files,
      "apps/docs/package.json": JSON.stringify({ scripts: { "kit:api": "x" } }),
      "apps/docs/scripts/real.ts": "",
      "apps/docs/examples/button.svelte": "",
    });
    expect(checkSkills(join(after, ".claude/skills"), { repo: after })).toEqual(
      [
        "a/SKILL.md: names tests/unit/gone.test.ts, which does not exist",
        "a/SKILL.md: names pnpm -C apps/docs kit:gone, which apps/docs/package.json does not define",
      ],
    );
  });

  it("fails a named test file that the root vitest include does not run", () => {
    const body = [
      "```sh",
      "pnpm test:fast tests/unit/a.test.ts scripts/b.test.ts",
      "```",
    ].join("\n");
    const files = {
      ".claude/skills/a/SKILL.md": skill("a", ok, body),
      ".claude/skills/README.md": index("a"),
      "AGENTS.md": "`a`\n",
      "package.json": JSON.stringify({ scripts: { "test:fast": "vitest" } }),
      "apps/docs/package.json": "{}",
      "tests/unit/a.test.ts": "",
      "scripts/b.test.ts": "",
    };
    const config = (include: string) =>
      `export default defineConfig({ test: { include: [${include}] } });\n`;
    const narrow = tree({
      ...files,
      "vitest.config.ts": config('"scripts/**/*.test.ts"'),
    });
    expect(
      checkSkills(join(narrow, ".claude/skills"), { repo: narrow }),
    ).toEqual([
      "a/SKILL.md: names tests/unit/a.test.ts, which the vitest include in vitest.config.ts does not cover",
    ]);
    const wide = tree({
      ...files,
      "vitest.config.ts": config(
        '"scripts/**/*.test.ts", "tests/unit/**/*.test.ts"',
      ),
    });
    expect(checkSkills(join(wide, ".claude/skills"), { repo: wide })).toEqual(
      [],
    );
  });

  it("matches * within a segment and ** across segments", () => {
    expect(matchesGlob("scripts/b.test.ts", "scripts/**/*.test.ts")).toBe(true);
    expect(matchesGlob("scripts/x/y/b.test.ts", "scripts/**/*.test.ts")).toBe(
      true,
    );
    expect(matchesGlob("tests/unit/a.test.ts", "scripts/**/*.test.ts")).toBe(
      false,
    );
    expect(
      matchesGlob(
        "packages/svelte/src/a.test.ts",
        "packages/*/src/**/*.test.ts",
      ),
    ).toBe(true);
    expect(
      matchesGlob("packages/a/b/src/a.test.ts", "packages/*/src/**/*.test.ts"),
    ).toBe(false);
  });

  it("finds paths and scripts in inline code and shell blocks only", () => {
    const facts = namedFacts(
      'apps/docs/prose.ts `packages/x/index.ts`, `$kit/a` `../apps/b`\n```sh\npnpm -s -C apps/docs llm:check\npnpm dlx storybook\n```\n```svelte\nsource: "packages/y/Example.svelte"\n```\n',
    );
    expect([...facts.paths]).toEqual(["apps/docs", "packages/x/index.ts"]);
    expect([...facts.docsScripts]).toEqual(["llm:check"]);
    expect([...facts.rootScripts]).toEqual([]);
  });

  it("ignores links inside code", () => {
    expect(
      relativeLinks("`[a](x.md)`\n```\n[b](y.md)\n```\n[c](z.md)"),
    ).toEqual(["z.md"]);
  });
});
