---
name: writing-handbook-pages
description: Writes and reviews Aurora Handbook pages in Storybook (Svelte CSF stories with defineMeta, MDX component pages, the React doc blocks from $kit-blocks, tags, a11y parameters, sidebar titles, prop JSDoc). Use when adding or changing a component's *.stories.svelte or *.mdx, a block under apps/docs/.storybook/blocks, preview.ts or the page template, or when asked to "document a component", "add a story", "fix the Handbook page" or "follow Storybook best practice".
paths:
  - "**/*.stories.svelte"
  - "**/*.mdx"
  - "apps/docs/.storybook/**"
  - "apps/docs/src/lib/kit/templates/**"
  - "apps/docs/src/lib/kit/handbuch/**"
---

# Writing Handbook pages

The Handbook (Storybook, served under `/handbook/`) is the reference: purpose, rules, props,
keyboard, tokens. The Atlas is the showroom; neither repeats what the other owns.

The page contract is `apps/docs/src/lib/kit/templates/ComponentPage.template.md`. Copy its two
blocks (`<Name>.stories.svelte`, `<Name>.mdx`), replace the name, delete nothing. A page is
`<KitHeader />`, chapters `01 Overview` to `11 Tokens` in order, then `<KitMaintainer>`.

## Rules

- **Specimens are stories; data chapters are React doc blocks.** Anything that renders Svelte
  (Overview stage, Anatomy, DoDont, variants, states, sizes) is a story, embedded with
  `<Canvas of={Stories.X} />`. Header, canon, keymap, known gaps, tokens and props are blocks
  imported from `$kit-blocks` (`KitHeader`, `KitCanon`, `KitKeymap`, `KitKnownGaps`,
  `KitTokens`, `KitProps`, `KitControls`, `KitExample`, `KitMaintainer`); each reads its page
  through `useOf("meta")`. Why: a Storybook docs page is React, and a Svelte component placed
  straight in MDX throws and takes the whole page down. A new data chapter is a new block in
  `apps/docs/.storybook/blocks/`, never a hidden story (`tests/unit/kit-doc-blocks.test.ts`).
- **Write only `defineMeta` Svelte CSF**, `import { defineMeta } from "@storybook/addon-svelte-csf"`.
  Never `<Meta>`, `export const meta`, `<Template>`, `legacyTemplate`, `let:args`, `let:context`,
  or `id`/`autodocs`/`source` on `<Story>`: Storybook 11 removes them, and with `defineMeta`
  only, the upgrade is an import swap done by its `addon-svelte-csf-to-core` automigration.
- **Keep preprocessor-only code out of a story file's script** (a TypeScript `enum`, for
  example): Storybook 11 indexes story files without preprocessors. Put it in a module.
- **`parameters.kit` sits on the meta** (`defineMeta({ parameters: { kit } })`), typed
  `KitParameters` from `$kit/kit-parameters`, and is read from source, never from memory:
  `tests/unit/kit-parameters-staleness.test.ts` resolves its tokens, anatomy selectors and
  `provenBy` names against the component.
- **Describe props in the component, not the story.** One JSDoc sentence per public prop
  (what it does; the default when it is not a literal), `@component` on the component. The
  props block, `kit.json` and Storybook's docgen all read the component; an `argTypes`
  description is a second copy that drifts. Charter rule `C-DOC-1` checks it.
- **Reach the docs app through aliases** (`$kit/...`, `$kit-blocks`), never `../../..`; link
  between pages with `docsHref()` / `storyHref()` from `apps/docs/src/lib/kit/handbuch/links.ts`,
  never a literal `?path=`: the Handbook lives under `/handbook/`.

## Stories

- With `component` set in `defineMeta`, static children of `<Story>` become that component's
  `children` snippet: eight sibling buttons render as one. A composed specimen uses
  `{#snippet template(args, context)}`.
- Story `name` and `exportName` are short English (`name="States"`). Product copy rendered
  inside a specimen is the only text that may be in another language.
- Tags: the meta carries `status:<kit.status>` only. `!dev` hides a specimen only its page
  shows from the sidebar (it stays in `index.json` and in the tests); `!test` keeps a showcase
  combination out of test runs; `!manifest` keeps a story out of Storybook's component
  manifest. Never the `autodocs` tag on a file with an MDX page: Storybook stops the whole
  build at index time. Never `!autodocs`: `autodocs` is not a global tag, so it does nothing.
- A `Keyboard` story's `play` proves the keymap rows that cite it (`provenBy: "Keyboard"`);
  assert with `expect` and `step` from `storybook/test`, never `throw`.
- Element ids derive from the story (`context.id`): specimens of one page share a document.
- Data comes from the docs app's invented fixtures (`apps/docs/src/lib/kit/fixtures`), never
  from an app's server code or real records: the site is public.

## MDX pages and blocks

- `<Meta of={Stories} />` attaches the page; `docs.defaultName` is `Docs`. A specimen chapter
  is `<Canvas of={Stories.X} sourceState="none" withToolbar={false} />`; the Playground keeps
  its source. The page's copyable example is `apps/docs/examples/<slug>.svelte`, printed by
  `<KitExample />`.
- Chapter `03 When to use` keeps its shape (`**Yes**`, `**No**`, `**Instead**` with
  `situation → Component` bullets): `kit:gen` reads it for "Choose a component".
- Build a block on documented APIs (`useOf`, `Canvas`, `ArgTypes`, `Controls`), never on
  Storybook's internal class names or undocumented exports. Blocks are type-checked through
  `apps/docs/.storybook/tsconfig.json` (`jsx: react-jsx`).
- Separate inline text runs in a block with a real space (`{" "}`), not CSS margin, or copied
  text and the Markdown twin read `2026-10-26Note`.
- Never use doc blocks inside a story.

## Titles, voice, public build

- Titles are ASCII English `Components/<Family>/<Name>`, the family the Atlas files it under
  (`apps/docs/src/lib/kit/taxonomy.ts`). Roots: Start, Foundations, Components, Patterns,
  Workshop (internal build only). The title becomes the docs id
  (`components-actions-button--docs`); a rename adds a row to `.storybook/legacy-ids.ts`.
- `parameters.options.storySort` stays an inline, self-contained function in `preview.ts`:
  Storybook parses that file statically, and a named constant is a build error.
- The public build (`KIT_PUBLIC=1`) shows chapters 01 to 11 only. File paths with line numbers,
  PR numbers, dates, people and decision codes go inside `<KitMaintainer>` or
  `parameters.kit.history`, nowhere else (`tests/unit/kit-public-voice.test.ts`). Elsewhere,
  name a symbol (`buttonVariants.size.cta`), not a line.
- Public status words are exactly **Stable**, **Beta**, **Deprecated** (`publicStatus` in
  `apps/docs/src/lib/kit/status-ladder.ts`); `kit.status` itself is `stable`, `gap` or
  `unverified`.

## Accessibility parameters

- `parameters.a11y.test` is `"error"` globally with `color-contrast` on. `"todo"` reports
  nothing in CI, so never use it to get green.
- An exemption is a `parameters.kit.knownIssues` entry with `date`, `what`, `where`, an
  `axeRule` and an `axeScope` naming the nodes; `apps/docs/tests/kit/axe-stories.spec.ts`
  excuses only those nodes and goes red once the rule stops firing.
- Readers never auto-run axe (`initialGlobals.a11y.manual: true`); CI scans through the axe
  specs. axe finds a subset of WCAG failures: a clean run is not a conformance claim.

## Check your work

```sh
# Legacy Svelte CSF (must print nothing):
git grep -nE '<Meta[ >]|export const meta|<Template|legacyTemplate|let:args|let:context' -- '*.stories.svelte'
pnpm test:fast tests/unit/kit-doc-blocks.test.ts tests/unit/kit-parameters-staleness.test.ts \
  tests/unit/kit-story-coverage.test.ts tests/unit/kit-public-voice.test.ts
pnpm -C apps/docs docs:check                          # type-checks the blocks and the examples
pnpm -C apps/docs kit:test axe-stories -g "<Title>"   # axe over the page's stories
pnpm -C apps/docs kit:build && pnpm -C apps/docs handbook:check
pnpm lint
```

Green is every command exiting 0. Then open the page at 390 and 1440 px, Light and Dark: no
console error, no horizontal scroll, one props table with the component's own props first.

## Sources

- Storybook 11 migration guide (legacy Svelte CSF removed, Svelte CSF moves into the framework,
  story files indexed without preprocessors, server docgen reads JSDoc and `@component`):
  https://github.com/storybookjs/storybook/blob/next/MIGRATION.md
- Tags (`dev`, `test`, `manifest` implicit; `!` removes; `autodocs` opt-in):
  https://storybook.js.org/docs/writing-stories/tags
- Doc blocks and `useOf`: https://storybook.js.org/docs/writing-docs/doc-blocks and
  https://storybook.js.org/docs/api/doc-blocks/doc-block-useof
- MDX docs pages render with React: https://storybook.js.org/docs/writing-docs/mdx
- Accessibility testing (`test: off | todo | error`, `todo` silent in CI, `a11y.manual`, axe
  catches part of WCAG): https://storybook.js.org/docs/writing-tests/accessibility-testing
- Play functions, `expect` and `step`: https://storybook.js.org/docs/writing-tests/interaction-testing
- Component manifest and `!manifest`: https://storybook.js.org/docs/ai/manifests
- Naming and `storySort`: https://storybook.js.org/docs/writing-stories/naming-components-and-hierarchy
