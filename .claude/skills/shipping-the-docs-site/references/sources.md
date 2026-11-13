# Sources

Opened on 2026-11-12 unless noted. Versions: Storybook 10.6.x stable, 11.0.0-beta.2.

| Rule | Source |
|---|---|
| Vercel default `public, max-age=0, must-revalidate`; only its own immutable paths get a year automatically | https://vercel.com/docs/caching/cache-control-headers (updated 2026-09-14) ; https://vercel.com/docs/caching/cdn-cache |
| `vercel.json` `headers` with `source` patterns; the documented `/assets/(.*)` immutable example | https://vercel.com/docs/project-configuration/vercel-json#headers (2026-08-14) |
| Brotli served automatically | https://vercel.com/docs/how-vercel-cdn-works/compression |
| A year of `max-age` only for fingerprinted URLs; `immutable` is an optional further optimisation | https://web.dev/articles/http-cache |
| Core Web Vitals thresholds (LCP 2.5 s, INP 200 ms, CLS 0.1 at p75) | https://web.dev/articles/vitals |
| `storybook build --test` skips docgen and docs; for CI test builds | https://storybook.js.org/docs/api/main-config/main-config-build ; https://storybook.js.org/blog/optimize-storybook-7-6/ (2023-12-20, updated 2025-05-27; Webpack-era numbers) |
| Svelte framework `docgen` option; disabling it loses argTypes inference | https://storybook.js.org/docs/get-started/frameworks/svelte-vite |
| Builder docgen runs on every `.svelte` file Vite loads in 10.x; server docgen only for indexed components | https://github.com/storybookjs/storybook/pull/36763 |
| Builder docgen deprecated in 11, removed in 12; server docgen drops wholesale-inherited props | https://raw.githubusercontent.com/storybookjs/storybook/next/MIGRATION.md ("Builder docgen is deprecated", "`docgenServer` is stable and enabled by default") |
| Storybook 11 needs Node 22.12+, TypeScript 5.9+, `typescript` as a required peer; `addon-svelte-csf-to-core` automigration | MIGRATION.md (sections "Node.js 22.12 or higher", "TypeScript 5.9 or newer", "Svelte CSF is built into the Svelte frameworks"), read 2026-11-13 |
| `stories` globs are analysed statically; custom loading de-optimises | https://storybook.js.org/docs/api/main-config/main-config-stories |
| Docs pages render React (fixed cost per preview) | https://storybook.js.org/docs/writing-docs/mdx |
| a11y addon `globals.a11y.manual` | https://storybook.js.org/docs/writing-tests/accessibility-testing |
| `build.modulePreload: false` as an experiment to measure, not a rule | https://github.com/PostHog/posthog/pull/128589 |

Repository evidence (audit 2026-11-12, measured on the deployed and local builds): every warm visit
revalidated about 60 hashed chunks; seven base64 Inter subsets made the manager CSS 293 KB; one eager
glob put 1 MB of data into every docs page; a repository-wide Tailwind scan made the preview CSS 455 KB;
links broke only in the composed site because every test served one site at its own root.
