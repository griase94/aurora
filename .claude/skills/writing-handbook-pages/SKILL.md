---
name: writing-handbook-pages
description: Writes and reviews Aurora Handbook pages in Storybook (Svelte CSF stories, MDX component pages, React doc blocks, tags, a11y parameters, sidebar titles, props JSDoc). Use when adding or changing a component's *.stories.svelte or *.mdx, a doc block under apps/docs/.storybook/blocks, the page template, preview.ts parameters, or when asked to "document a component", "add a story", "fix the Handbook page" or "make the docs follow Storybook best practice".
paths:
  - "**/*.stories.svelte"
  - "**/*.mdx"
  - "apps/docs/.storybook/**"
  - "apps/docs/src/lib/kit/templates/**"
  - "apps/docs/src/lib/kit/handbuch/**"
---

# Writing Handbook pages

The Handbook is the reference (props, stories, usage rules, do/don't, code, machine-readable
facts). The Atlas is the showroom; a page never duplicates what the other site owns.
The page contract (chapters `01 Overview` to `13 Provenance & guards`, in order) lives in
`apps/docs/src/lib/kit/templates/ComponentPage.template.md`: copy it, delete nothing.

## Hard rules

- **Specimens are stories; data chapters are React doc blocks.** Anything that renders Svelte
  (Stage, Anatomy, Do/Don't, variants, states, demos) is a story embedded with
  `<Canvas of={Stories.X} />`. Anything that only shows data (header, canon, keymap, known
  gaps, tokens, usage, provenance, props) is a `<Kit…/>` block from `@aurora/handbook-blocks`
  that reads `parameters.kit` through `useOf("meta")`. Why: docs pages are React, a Svelte
  component placed in MDX kills the page, and every story is one more Svelte app mounted on it.
  `tests/unit/kit-doc-blocks.test.ts` holds this.
- **Write only `defineMeta` Svelte CSF**, imported from `@storybook/addon-svelte-csf` in one
  line. Storybook 11 builds Svelte CSF into the framework and removes `<Meta>`,
  `export const meta`, `<Template>`, `legacyTemplate`, `let:args`, `let:context`, and the
  `id`, `autodocs` and `source` props on `<Story>`. Written this way the upgrade is an import
  swap plus the `addon-svelte-csf-to-core` automigration.
- **Keep preprocessor-only code out of a story file's script** (TypeScript enums and the like):
  Storybook 11 indexes story files without preprocessors and fails on it. Put it in a module.
- **`parameters.kit` sits on the meta**, read from source, never typed from memory; the
  staleness, coverage and import-line tests resolve it against the component.
- **Document props in the component, not in the story.** Every public prop gets a JSDoc
  comment (what it does, the default when it is not a literal, the allowed values); the
  component gets `@component`. Docgen, the props block, `kit.json` and Storybook 11's
  server docgen all read the component; an `argTypes` description is a second copy that drifts.
- **Link through the helpers** `docsHref()` / `storyHref()` in
  `apps/docs/src/lib/kit/handbuch/links.ts`, never a literal `/?path=`. The Handbook is served
  under `/handbook/`; a root `?path=` link leaves it for the Atlas.

## Stories

- A composed specimen uses `{#snippet template(args, context)}`. With `component` set in
  `defineMeta`, static children of `<Story>` become that component's `children` snippet:
  eight sibling buttons render as one.
- One canonical story per documented behaviour. Name it in short English
  (`name="States"`, `exportName="States"`); product copy inside it stays German.
- Tags:
  - `!dev`: a specimen that only its page shows (out of the sidebar, still in the index and
    still tested).
  - `!test`: a showcase combination that should not run as a test.
  - `!manifest`: a story agents should not see (Storybook 11 component manifest).
  - `play-fn` is automatic; assert with `expect` and `step()` from `storybook/test`, never
    `throw new Error`, so the Interactions panel reads.
  - Never `autodocs` on a file that has an MDX page: that is an index-time error that fails
    the whole build. Never `!autodocs`: `autodocs` is not a global tag here, so it does nothing.
  - `status:*` tags mirror `parameters.kit.status`.
- Inline specimens share one docs document. Derive element ids from the story
  (`context.id`), never a literal `id="f-betrag"` that another story on the page repeats.
- Data comes from the docs app's fixtures, never from an app's server code or seed data:
  the site is public.

## MDX pages and doc blocks

- `<Meta of={Stories} />` attaches the page to its story file; `docs.defaultName` is `Docs`.
- Import only the `<Kit…/>` blocks the page uses.
- A specimen a reader should copy gets `sourceState="hidden"` (a "Show code" toggle);
  `sourceState="none"` only on pure stage chrome (Stage, Anatomy).
- Build a new block on documented APIs (`useOf`, `ArgTypes`, `Canvas`, `Controls`), never on
  internal class names, `nth-child` column positions or undocumented exports: they break
  silently on a Storybook patch.
- A block declares its own dependencies and is type-checked (`react`, `react-dom`,
  `@types/react` in the docs app, a tsconfig with `jsx: react-jsx` that `pnpm check` covers).
- Separate inline text runs with a real space (`{" "}`), not CSS margin: copy, screen readers
  and the Markdown extraction read `2026-10-26NoteNo…` otherwise.
- A block that loads a dataset lazily reserves its height while loading (no layout shift).
- Layout CSS every docs page needs (the table-of-contents rail, `headingSelector: "h2"`) goes in
  the global preview stylesheet, not a block's lazily loaded CSS.
- Never use doc blocks inside a story: Storybook fails with a cryptic error.

## Sidebar, naming, voice

- Titles are ASCII English, `Components/<Group>/<Name>`; roots are Start, Foundations,
  Components, Patterns, Workshop. The title becomes the docs id
  (`components-actions-button--docs`); renaming it breaks links and agent caches, so a rename
  ships with a redirect.
- `parameters.options.storySort` is an inline, self-contained function in `preview.ts`:
  Storybook parses that file statically and a named constant is a build error.
- English for everything the site says in its own voice; German only for product copy a
  component renders. Themes are Light and Dark.
- Public prose states the rule and its reason. Owner names, decision codes, PR numbers, dates
  and `file:line` belong only in `13 Provenance & guards`, which public builds
  (`KIT_PUBLIC=1`) hide. Public status words are exactly **Stable**, **Beta**, **Deprecated**.
- Name a symbol (`buttonVariants.size.cta`) instead of a line number: symbols survive edits.

## Accessibility parameters

- `parameters.a11y.test: "error"` globally; `color-contrast` stays on. `"todo"` reports
  nothing in CI, so use it only as a tracked, temporary state.
- An exemption lives in `parameters.kit.knownIssues` with a date, a reference and an
  `axeScope` naming the nodes; it goes red once the rule stops firing.
- Readers never auto-run axe: `initialGlobals.a11y.manual: true`, and the Stage runs axe on
  click. axe catches a subset of WCAG issues; a clean run is not a conformance claim.

## Verify

```sh
git grep -nE '<Meta|export const meta|<Template|legacyTemplate|let:args|let:context|<Story[^>]* (id|autodocs|source)=' -- '*.stories.svelte'   # must print nothing
pnpm test:fast tests/unit/kit-doc-blocks.test.ts tests/unit/kit-parameters-staleness.test.ts tests/unit/kit-story-coverage.test.ts tests/unit/kit-import-line.test.ts
bash apps/docs/tests/kit/run-kit-tests.sh apps/docs/tests/kit/axe-stories.spec.ts -g "<Title>"
pnpm -C apps/docs kit:build && pnpm -C apps/docs handbook:check
pnpm check && pnpm lint
```

Then open the page at 390 and 1440 px, Light and Dark: no console error, no horizontal scroll,
the props table appears once with Aurora's own props first.

## Before you call it done

- Specimens are stories, data is a `<Kit…/>` block, no `/?path=` literal.
- Only `defineMeta` syntax; JSDoc on every public prop.
- No maintainer content outside chapter 13; status reads Stable, Beta or Deprecated.

Sources (Storybook docs and migration guide, with versions): [references/sources.md](references/sources.md).
