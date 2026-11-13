---
name: shipping-the-docs-site
description: Builds, caches and measures Aurora's composed docs site (Atlas at /, Storybook Handbook at /handbook/) for speed and correctness. Use when changing apps/docs/vercel.json, apps/docs/.storybook/main.ts or manager.ts, the site build or compose scripts, the size budgets, fonts, generated-data loading, docgen or the Storybook version, or when the Handbook or Atlas loads slowly, a link breaks only when deployed, or someone asks to measure, cache or upgrade the docs site.
paths:
  - "apps/docs/vercel.json"
  - "apps/docs/package.json"
  - "apps/docs/.storybook/main.ts"
  - "apps/docs/.storybook/manager.ts"
  - "apps/docs/.storybook/preview.ts"
  - "apps/docs/.storybook/preview.css"
  - "apps/docs/scripts/**"
---

# Shipping the docs site

One static site: the Atlas at `/`, Storybook (the Handbook) at `/handbook/`, the agent files
at both roots. `pnpm -C apps/docs site:atlas` builds, composes and checks it. A change is
proven on the composed output, never on one site served alone at its own root: base-path
bugs exist only in the composition.

## Hard rules

- **`immutable` only on content-hashed files.** `/assets/*` and `/handbook/assets/*` get
  `public, max-age=31536000, immutable`. Everything unhashed (HTML, `index.json`,
  `sb-manager/*`, `sb-addons/*`, `llms*.txt`, `kit.json`, `c/*.md`) keeps the default
  revalidation: an immutable manager would pair an old manager with a new preview for a year.
  Security headers (`nosniff`, `Referrer-Policy`, `frame-ancestors 'self'`) on every path.
- **Publish the full docs build.** `storybook build --test` skips docgen and docs and is for
  CI test builds only.
- **Every byte that regressed once gets a budget.** `check-handbook-budgets.mjs` (manager CSS,
  preview CSS, preview entry, largest page chunk, datasets, Tailwind sentinels) and
  `check-atlas-budgets.mjs`. Re-anchor a budget only with the measured value, the date and the
  reason in its comment, plus about 5 % headroom; never raise one just to go green.
- **Numbers come from the same method before and after,** written into the PR.
- **No Storybook major while it is beta.** Stay on the latest 10.x patch; plan 11 (below).

## What a reader pays for, and the rule for each

- **Generated data:** one chunk per dataset (`kit-data-<name>`), imported only by the module
  that reads it, loaded lazily by the block that shows it. No eager glob over
  `generated/*.json`; no barrel that initialises every dataset. `datasetChunkGuard` fails the
  build otherwise.
- **Fonts:** no base64 font in any CSS. The manager declares only the latin and latin-ext
  faces of the same cut the package ships, reuses the preview's hashed files and preloads the
  one above-the-fold face. Storybook's own Nunito stays unused, so it is never fetched.
- **Tailwind:** Vite's root is the docs app and the scan names its sources explicitly
  (`@source`); the sentinel check proves no class was lost.
- **axe:** never auto-runs for readers (`initialGlobals.a11y.manual: true`); it loads on a click.
- **Docs pages:** mount specimens only; data chapters are React blocks; a Stage frame mounts on
  demand. Count `iframe.html` requests and `.docs-story` mounts per page.
- **Story globs** stay static and narrow (`apps/docs/.storybook/handbook-stories.ts`):
  Storybook analyses them statically, and every matched file costs build time and index size.
- **Docgen:** no custom docgen rewriter. Storybook 11's server docgen drops props inherited
  from whole attribute interfaces and runs only for indexed components; until then, narrow
  rest-prop types on the worst offenders.
- **Head:** real titles ("Aurora Atlas", "Aurora Handbook"), a description, favicon, social
  meta and the `text/markdown` alternate link; the compose step owns `<title>`.

## Storybook 11 path

Prerequisites: Node ≥ 22.12, TypeScript ≥ 5.9 (`typescript` becomes a required peer), no
legacy Svelte CSF syntax. Then `npx storybook@latest upgrade` runs the
`addon-svelte-csf-to-core` automigration; remove the addon from every `package.json`;
re-measure docgen bytes and the props tables; evaluate the Svelte components manifest for the
agent files. The builder `docgen` option is deprecated in 11 and removed in 12.

## Measuring

- Size: the budget scripts on a fresh build (raw bytes the browser parses).
- Delivery: on the deployed URL, not localhost (localhost serves no Brotli and no headers).
  `node scripts/atlas-smoke-headers.mjs https://<deployment>` asks the host whether the
  headers apply; a `source` pattern that matches nothing is still valid JSON.
- Load: cold and warm, Atlas `/`, a component page, a docs page; LCP, CLS, request count,
  transferred bytes. Throttle to about 400 ms RTT and 1.6 Mbps for the cold run. Targets: LCP
  ≤ 2.5 s warm and ≤ 4 s cold, CLS ≤ 0.1, INP ≤ 200 ms.
- At least 3 runs per side, interleaved, medians and ranges. A single run hides stalls.

## Verify

```sh
pnpm -C apps/docs site:atlas            # kit-gen, both builds, compose, check-handbook-ids, check-site, budgets
pnpm -C apps/docs kit:build && pnpm -C apps/docs handbook:check   # Handbook alone: delivery rules and budgets
pnpm test:fast tests/unit/kit-site-delivery.test.ts tests/unit/kit-handbook-budgets.test.ts
node scripts/atlas-smoke-headers.mjs https://<deployment>          # after deploy
```

## Before you call it done

- `immutable` only on hashed paths; no budget raised without a dated reason.
- Checked on the composed site, and on the deployment for header changes.
- Before and after numbers from the same method, at least 3 runs each.

Sources (Vercel caching docs, web.dev, Storybook build and migration docs):
[references/sources.md](references/sources.md).
