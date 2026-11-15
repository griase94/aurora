---
name: building-components
description: Writes and changes Aurora Svelte 5 components so they conform to the API charter (packages/svelte/CHARTER.md): rule ids, the kit:api checker and its shrink-only exception baseline, the public entry table, where stories, specimens and tests go, and the definition of done for a component pull request. Use when adding a component or component family, changing a component's props, events, snippets, root element or exports, fixing a charter violation, reading kit:api output, touching kit-api.exceptions.json or scripts/aurora-entries.mjs, or when asked to "build a component", "add a prop", "make it charter-clean" or "is this component done".
---

# Building components

The contract is `packages/svelte/CHARTER.md`. Read the rules your change touches there; this
skill does not restate them. It says where a component's files go, how the checker reports,
and when a component pull request is done.

## The charter's vocabulary

- Every rule has a stable id. A `C-` rule (`C-VALUE-1`, `C-ROOT-1`, `C-DOC-1`, …) is checked
  by `kit:api` on every pull request; an `R-` rule (`R-KEYBOARD-1`, `R-THEME-1`, …) is checked
  in review. Cite the id in commit messages, review comments and waivers, never a paraphrase.
- The charter's last section lists what the checker cannot see (text written straight into
  markup, ids built from caller data, run-time durations, keyboard models, reduced motion).
  Review those by hand on every change.
- The prior art is named in the charter (bits-ui, Melt UI, Radix, React Aria, shadcn-svelte).
  When a rule is unclear, follow the charter's Do example, not a library's own docs.

## Where a component's files go

A family is a folder `packages/svelte/src/lib/components/ui/<family>/`. Name new files after
the component the way the family's existing files are named:

| File                                      | What                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `index.ts`                                | the public entry `<package>/<family>`: each component and its `<Name>Props` type (C-EXPORT-1) |
| `<name>.svelte`                           | the component, `@component` plus one JSDoc sentence per prop (C-DOC-1)                        |
| `<name>.test.ts` (+ `<name>.test.svelte`) | unit tests beside the component; a `.test.svelte` is a harness                                |
| `<name>.stories.svelte`, `<name>.mdx`     | the Handbook page: the `writing-handbook-pages` skill                                         |
| `<Name>.showcase.svelte`                  | the Atlas specimen: the `building-atlas-specimens` skill                                      |

The copyable example is `apps/docs/examples/<slug>.svelte` (the `writing-agent-ready-docs`
skill). Browser specs that cross components (axe, keyboard plays, target size, reduced
motion, forced colours) live in `apps/docs/tests/kit/`; add a spec there only for behaviour
a story's `play` cannot prove.

## The entry table

`scripts/aurora-entries.mjs` is the one definition of the public entries. A family is any
folder under `FAMILY_ROOT` with an `index.ts` whose name does not start with `_`; a folder
starting with `_` is a shared internal and never an entry. An entry under another name goes
into `NAMED_ENTRIES`. The packages' `exports` maps, the ESLint entry rule, `kit:gen` and the
checker all read this table: never write an export path by hand. Apps and the example
files import only through an entry, never a deep path or a `.svelte` file.

## Reading `kit:api`

`pnpm -C apps/docs kit:api` parses every public component (no browser, a few seconds) and
compares it with the baseline `apps/docs/kit-api.exceptions.json`. Exit 0 prints one summary
line. Exit 1 prints one line per problem:

| Prefix     | Meaning and what you do                                                            |
| ---------- | ---------------------------------------------------------------------------------- |
| `NEW`      | a violation the baseline does not allow: fix the component                         |
| `NEW-COMP` | a component added after the baseline has a violation: fix it; it gets no exception |
| `FIXED`    | you fixed one: lower the count in the baseline, or delete the entry at 0           |
| `GROWN`    | (with `--base <ref>`) the baseline holds more than at the base: undo the raise     |
| `GONE`     | a component left the public set: delete it from `population`                       |
| `UNKNOWN`  | the baseline names a rule that does not exist                                      |
| `WAIVER`   | an inline waiver is not recorded in the baseline                                   |

`--all` prints every violation of every component, `--json` the full report (props,
bindables, rest, root facts, waivers). Both exit 0: use them to read, not to gate.

## The baseline only shrinks

- Never add an entry and never raise a count. A new component meets the charter from its
  first commit.
- When you fix a violation, lower its count in the same commit; at 0, delete the entry.
  The unit test fails on a count above today's, so a fix without the baseline edit is red.
- Never run `kit:api --write-baseline` in a pull request: it exists to bootstrap the file.
- A waiver (`<!-- kit-api-allow C-RESP-1: <reason> -->` on the line before) is only for a
  rule the charter marks waivable, names a reason, and is recorded in the baseline in the
  same pull request: it is a reviewed exception, not a way to get green.
- Renaming or moving a component that has exceptions: move its entries to the new key, and
  record `"renamed": { "<old key>": "<new key>" }` as the charter's last section says.

## Definition of done

A component pull request is done when every line holds:

1. `kit:api` exits 0 and the baseline did not grow; the `R-` rules the change touches were
   checked by hand (keyboard model, variant, disabled, handlers, theme hooks, motion).
2. The Handbook page and the Atlas specimen are updated in the same pull request, the
   example file type-checks, and `kit:gen` output agrees (`llm:check` exits 0).
3. Interactive components follow the WAI-ARIA Authoring Practices pattern for their role,
   list their keys on the page and prove them in a `Keyboard` story's `play` (R-KEYBOARD-1).
4. axe passes on the page's stories, and the accessible name, role and state are right in
   the browser: axe finds only part of what fails.
5. Every state renders in Light and Dark: default, hover, focus-visible, active, disabled,
   invalid, loading, empty, long content.
6. It works in a narrow and a wide container, through container queries, not viewport
   breakpoints (C-RESP-1); logical start and end, not left and right (C-RTL-1).
7. Reduced motion fades and nothing loops (R-MOTION-1); forced colours keep focus and
   state visible.
8. The status stays Beta until the maintainer signs the look (R-LIFECYCLE-1).
9. The pull request carries one release label (`aurora:patch` for a fix, `aurora:minor` for
   a feature or any breaking change while 0.x) and its template's **Changelog** line says
   what an app developer sees.

## Check your work

```sh
pnpm -C apps/docs kit:api                     # exit 0: the summary line, no problem lines
pnpm test:fast packages/svelte/src/lib/components/ui/<family> \
  tests/unit/kit-api-charter.test.ts tests/unit/kit-story-coverage.test.ts \
  tests/unit/kit-showcase-coverage.test.ts
pnpm -C apps/docs docs:check                  # blocks and example files type-check
pnpm -C apps/docs llm:check
pnpm -C apps/docs kit:build && pnpm -C apps/docs kit:test axe-stories keyboard-plays -g "<Title>" --workers=2
pnpm check && pnpm lint
```

Green is every command exiting 0. Then open the Handbook page and the Atlas specimen at 390
and 1440 px, Light and Dark, and use the component with the keyboard only.

## Sources

- WAI-ARIA Authoring Practices, patterns and keyboard interaction per role:
  https://www.w3.org/WAI/ARIA/apg/patterns/
- Automated checks find only part of the WCAG failures (manual testing stays required):
  https://www.w3.org/WAI/test-evaluate/tools/selecting/
- Container queries answer to an ancestor's size:
  https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries
- Logical properties for direction-independent layout:
  https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values
- `prefers-reduced-motion`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- `forced-colors`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors
- Semantic versioning, anything may change before 1.0.0: https://semver.org/#spec-item-4
