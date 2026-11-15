# Aurora agent skills

Procedures for agents (and people) working on Aurora's components and its two docs sites:
**Aurora Atlas**, the showroom at `/`, and the **Aurora Handbook**, the Storybook reference at
`/handbook/`. Each skill is a folder in the [Agent Skills](https://agentskills.io/specification)
format: a short, rule-first `SKILL.md`, longer material in `references/`, test prompts in
`evals/`.

## Index

| Skill                                                         | Load it when you                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [building-components](building-components/SKILL.md)           | add or change a component, its props or exports, or read `kit:api` output                |
| [writing-handbook-pages](writing-handbook-pages/SKILL.md)     | write or review stories, MDX component pages, doc blocks, tags, a11y parameters          |
| [writing-agent-ready-docs](writing-agent-ready-docs/SKILL.md) | change `llms.txt`, `kit.json`, the per-component Markdown, examples or install facts     |
| [building-atlas-specimens](building-atlas-specimens/SKILL.md) | write specimens or change the Atlas stage, frames, scale, wall or pages                  |
| [shipping-the-docs-site](shipping-the-docs-site/SKILL.md)     | change caching, budgets, fonts, data loading, the Storybook version, or measure the site |

## How skills relate to AGENTS.md

`AGENTS.md` at the repository root holds what every task needs: commands, layout, merge and
public-safety rules. A skill holds one kind of task in depth and is read only when the task
is that kind. Neither repeats the other; a skill links to `AGENTS.md` or to another skill
instead. Paths in the skills are relative to the repository root. Agents that load skills on
their own match a task against each skill's `description`; any other agent reads the
`SKILL.md` it needs from this index.

## Maintaining the skills

- **A pull request that changes a convention updates the skill that states it, in the same
  pull request.** A skill that is wrong is worse than none: agents follow it with confidence.
- Every command, path and identifier in a skill exists in the repository. Every rule that is
  not just "this repository does it so" names its primary source in the skill's `## Sources`
  list. Nothing private: the repository is public.
- Keep `SKILL.md` under about 150 lines: rules first, `## Check your work` with the exact
  commands and what green looks like, `## Sources` last. No history, no dates that go stale,
  no counts of what exists.
- `scripts/skills.test.ts` checks the frontmatter, the length, the relative links and this
  index (`pnpm test:fast scripts/skills.test.ts`).
- When a rule changes, run the skill's `evals/` cases with and without the skill and
  compare. The cases use the layout of Claude Code's `claude plugin eval` (`case.yaml`,
  `prompt.md`, `graders/*.md`), whose default run adds the arm without the skill.
