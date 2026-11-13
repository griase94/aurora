# Sources

Opened on 2026-11-12 or 2026-11-13. Versions in play: Storybook 10.6.x stable, Storybook 11.0.0-beta.2,
`@storybook/addon-svelte-csf` 5.1.x (archived at 5.1.6, 2026-10-28).

| Rule | Source |
|---|---|
| `defineMeta` only; legacy syntax removed in 11; import swap + `addon-svelte-csf-to-core` | Storybook MIGRATION.md (next branch), "Svelte CSF is built into the Svelte frameworks", "Svelte CSF: legacy story syntax removed": https://raw.githubusercontent.com/storybookjs/storybook/next/MIGRATION.md ; PR https://github.com/storybookjs/storybook/pull/36597 (merged 2026-10-05) |
| Story files indexed without preprocessors in 11 (`SB_SVELTE_CSF_PARSER_EXTRACT_SVELTE_0009`) | MIGRATION.md, "Svelte CSF: stories files are indexed without preprocessors" |
| Server docgen reads JSDoc, `@component`, `$bindable`; drops props inherited from a whole attribute interface; snippets and callbacks get their own categories | MIGRATION.md, "`docgenServer` is stable and enabled by default", Svelte section; PR https://github.com/storybookjs/storybook/pull/36763 |
| Svelte CSF v5 API (`template` snippet, `asChild`, `exportName`, children forwarding, tags replace `autodocs`) | https://github.com/storybookjs/addon-svelte-csf (README, archived) ; https://storybook.js.org/docs/get-started/frameworks/svelte-vite |
| Tags `dev`, `test`, `manifest`, `autodocs`, `play-fn`; `!tag` removes; inheritance preview → meta → story | https://storybook.js.org/docs/writing-stories/tags |
| `manifest` tag on by default, `!manifest` excludes | https://storybook.js.org/docs/ai/manifests |
| Autodocs tag and an MDX page conflict; docs rendering is React-only | https://storybook.js.org/docs/writing-docs/autodocs ; https://storybook.js.org/docs/writing-docs/mdx |
| Documented doc blocks; never doc blocks inside stories | https://storybook.js.org/docs/writing-docs/doc-blocks |
| `useOf` for custom doc blocks | https://storybook.js.org/docs/api/doc-blocks/doc-block-useof (checked 2026-11-13) |
| Story block: inline rendering, play functions do not run in docs by default | https://storybook.js.org/docs/api/doc-blocks/doc-block-story |
| Naming, hierarchy, `storySort` | https://storybook.js.org/docs/writing-stories/naming-components-and-hierarchy |
| `play`, `canvas`, `step`, `expect` from `storybook/test` | https://storybook.js.org/docs/writing-stories/play-function ; https://storybook.js.org/docs/writing-tests/interaction-testing (`step`, checked 2026-11-13) |
| a11y `test` (off, todo, error), `todo` silent in CI, `globals.a11y.manual`, WCAG coverage is partial (vendor claim: "up to 57 %") | https://storybook.js.org/docs/writing-tests/accessibility-testing |
| argTypes inference on Svelte 10.x is JSDoc-based | https://storybook.js.org/docs/builders/vite |

Repository evidence (the Aurora docs app): the Svelte-in-MDX crash (`TypeError ... reading 'label'`), the
index-time error for `autodocs` plus an MDX page, the static-children trap and the inline `storySort` rule
were each reproduced on Storybook 10.6 and are recorded in
`apps/docs/src/lib/kit/templates/ComponentPage.template.md`.
