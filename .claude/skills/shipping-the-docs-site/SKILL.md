---
name: shipping-the-docs-site
description: Builds, caches and measures Aurora's composed docs site (Atlas at /, the Storybook Handbook at /handbook/, the agent files at both roots) for speed and correctness. Use when changing apps/docs/vercel.json, apps/docs/package.json, .storybook/main.ts, manager.ts or preview.css, the compose or check scripts, a size budget, fonts, generated-data loading, docgen or the Storybook version, or when the site loads slowly, a link breaks only when deployed, or someone asks to measure, cache or upgrade the docs site.
paths:
  - "apps/docs/vercel.json"
  - "apps/docs/package.json"
  - "apps/docs/.storybook/main.ts"
  - "apps/docs/.storybook/manager.ts"
  - "apps/docs/.storybook/preview.css"
  - "apps/docs/.storybook/handbook-stories.ts"
  - "apps/docs/scripts/site-compose.ts"
  - "apps/docs/scripts/check-site.ts"
  - "apps/docs/scripts/check-handbook-budgets.mjs"
  - "apps/docs/scripts/dataset-chunks.ts"
---

# Shipping the docs site

One static site: the Atlas at `/`, the Handbook at `/handbook/`, `llms.txt`, `llms-full.txt`
and `kit.json` at both roots. `pnpm -C apps/docs site:atlas` is the deploy build
(`vercel.json` `buildCommand`): public `kit:gen`, the Atlas build and `check-atlas-public`,
the Handbook build, `site-compose.ts`, `check-handbook-ids.ts`, `check-site.ts`,
`check-llm-readiness.ts` and the Handbook budgets. Prove a change on this composed output,
never on one site served alone at its own root: base-path bugs exist only in the composition.

## Rules

- **`immutable` only on content-hashed files.** `/assets/(.*)` and `/handbook/assets/(.*)` get
  `public, max-age=31536000, immutable`. Everything unhashed (HTML, `index.json`,
  `sb-manager/*`, `sb-addons/*`, the agent files) keeps Vercel's default revalidation: an
  immutable manager would pair an old manager with a new preview for a year. `nosniff`,
  `Referrer-Policy` and `frame-ancestors 'self'` apply to every path.
- **Publish the full build.** `storybook build --test` drops docs pages, doc blocks and
  docgen; it is for test builds only, never for the deployed Handbook.
- **Every byte that regressed once has a budget**: `check-handbook-budgets.mjs` (manager CSS
  and no `data:font`, preview CSS, preview entry, largest page chunk, one chunk per dataset,
  Tailwind sentinels) and `check-atlas-budgets.mjs`. Re-anchor a budget only with the measured
  value, the date and the reason in the script's header comment, plus about 5 % headroom.
  Never raise one to go green: find what grew first.
- **Numbers come from the same method before and after**, written into the pull request.
- **Upgrade the Storybook major in its own pull request, from a stable release, never a
  beta.** The checklist is in [reference/storybook-major.md](reference/storybook-major.md).

## What a reader pays for

- **Generated data:** one chunk per dataset (`kit-data-<name>`), imported only by the module
  that reads it and loaded by the block that shows it. No eager glob over `generated/*.json`
  and no barrel import: `datasetChunkGuard` (`apps/docs/scripts/dataset-chunks.ts`) fails the
  build otherwise.
- **Fonts:** no base64 font in any CSS. The manager declares only the latin and latin-ext
  faces of the cut the package ships (read from `packages/svelte/src/lib/styles/fonts.css`,
  never retyped), serves them as files and preloads the latin face. The preview template's
  Nunito is overridden, so it is never fetched.
- **Tailwind:** Vite's root is the docs app, and `preview.css` names its sources with
  `@source`; the budget's sentinel classes prove no class was lost.
- **axe** never runs for readers (`initialGlobals.a11y.manual: true`); it loads on a click.
- **Docs pages** mount specimens only; data chapters are React blocks.
- **Story globs** stay static and narrow (`apps/docs/.storybook/handbook-stories.ts`):
  Storybook reads them statically, and every matched file costs build time and index size.
- **Head:** real titles ("Aurora Handbook" and the Atlas's own), a description, the favicon,
  link-preview tags and a `rel="alternate"` link to the agent index. `site-compose.ts` owns the
  Handbook's `<title>` and fails when a marker it edits is missing.

## Measuring delivery

- Size: the budget scripts on a fresh build (raw bytes the browser parses).
- Headers: on the deployed URL, never localhost (no compression, no headers there).
  `node scripts/atlas-smoke-headers.mjs https://<deployment>` asks the host; a `source`
  pattern that matches nothing is still valid JSON, so only the host proves a header.
- Load: cold and warm, the Atlas home, an Atlas component page and a Handbook page; LCP, CLS,
  request count, transferred bytes. Throttle the cold run (about 400 ms RTT, 1.6 Mbps).
  Targets: LCP at most 2.5 s warm, CLS at most 0.1, INP at most 200 ms.
- At least 3 runs per side, interleaved, medians and ranges: a single run hides stalls.

## Check your work

```sh
pnpm test:fast tests/unit/kit-site-delivery.test.ts tests/unit/kit-handbook-budgets.test.ts
pnpm -C apps/docs kit:build && pnpm -C apps/docs handbook:check   # Handbook alone: delivery and budgets
pnpm -C apps/docs site:atlas                                      # the deploy build and every composed check
node scripts/atlas-smoke-headers.mjs https://<deployment>         # after a header change is deployed
```

Green is every command exiting 0. A header change is done only when the smoke check passes on
the deployment.

## Sources

- Vercel's default `public, max-age=0, must-revalidate`; `max-age=31536000, immutable` for
  content-hashed assets: https://vercel.com/docs/caching/cache-control-headers
- `vercel.json` `headers` and `source` patterns:
  https://vercel.com/docs/project-configuration/vercel-json#headers
- A long `max-age` only for versioned URLs: https://web.dev/articles/http-cache
- `storybook build --test` removes docs blocks, MDX entries, autodocs and docgen:
  https://storybook.js.org/docs/api/main-config/main-config-build
- Story globs are analysed statically: https://storybook.js.org/docs/api/main-config/main-config-stories
- Core Web Vitals thresholds (LCP 2.5 s, INP 200 ms, CLS 0.1 at the 75th percentile):
  https://web.dev/articles/vitals
- Fonts: preload what the first paint needs and avoid inlined font data:
  https://web.dev/articles/font-best-practices
