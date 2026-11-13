# Aurora agent skills

Rules for agents (and people) working on Aurora's two docs sites: **Aurora Atlas**, the showroom at
`/`, and the **Aurora Handbook**, the Storybook reference at `/handbook/`. Each skill is short and
rule-first; detail and sources sit in its `references/`, test prompts in its `evals/`.

| Skill | Load it when you |
|---|---|
| [writing-handbook-pages](writing-handbook-pages/SKILL.md) | write or review stories, MDX component pages, React doc blocks, tags, a11y parameters, sidebar titles |
| [writing-agent-ready-docs](writing-agent-ready-docs/SKILL.md) | change `llms.txt`, `kit.json`, the per-component Markdown, install facts or the agent rules |
| [building-atlas-specimens](building-atlas-specimens/SKILL.md) | write specimens or change the Atlas stage, frames, scale, wall or pages |
| [shipping-the-docs-site](shipping-the-docs-site/SKILL.md) | change caching, budgets, fonts, data loading, docgen, the Storybook version, or measure the site |

Paths in the skills are relative to the repository root (`packages/svelte`, `packages/tokens`,
`apps/docs`). Claude Code loads a skill on its own when a task or a touched file matches its
description or `paths`; other agents can read the `SKILL.md` directly.

## Maintaining the skills

- A rule enters a skill when a real mistake or a primary source supports it; cite it in
  `references/sources.md` (URL, version, date) or mark it as repository evidence.
- Keep each `SKILL.md` under about 150 lines: hard rules first, a "Before you call it done" check last.
- When a rule changes, run the skill's `evals/` cases with and without the skill
  (`claude plugin eval <skill-dir>`) and compare.
