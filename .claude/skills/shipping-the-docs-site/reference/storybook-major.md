# Upgrading the Storybook major

A major upgrade gets its own pull request, from a stable release (`npm view storybook
dist-tags.latest`), never a `next` or beta tag. Read the target's section of Storybook's
migration guide first; the steps below are what this repository adds to it.

## Before the upgrade

1. The runtime meets the new major's minimums (for 11: Node 22.12 or later, TypeScript 5.9 or
   later, and `typescript` as a peer of the Svelte renderers). Upgrade TypeScript first and run
   `pnpm check`.
2. No legacy Svelte CSF is left. This must print nothing:

   ```sh
   git grep -nE '<Meta[ >]|export const meta|<Template|legacyTemplate|let:args|let:context' -- '*.stories.svelte'
   ```

3. No story file's `<script>` needs a preprocessor (a TypeScript `enum`, for example): 11
   indexes story files without preprocessors.
4. Record the baseline on the current version with the method in the skill: the Handbook
   budgets, the props tables of a few components with long prop lists, and the build time.

## The upgrade

1. Run Storybook's upgrade command at the exact target version, for example
   `pnpm dlx storybook@<version> upgrade`. For 10 → 11 it runs the `addon-svelte-csf-to-core`
   automigration: Svelte CSF moves from `@storybook/addon-svelte-csf` into the Svelte
   framework packages, so the import of `defineMeta` changes and the addon leaves every
   `package.json` and the `addons` list.
2. Docgen: 11 generates Svelte docs on the server and deprecates the builder's `docgen`
   option (removed in 12). Compare the props tables against the baseline: the props block,
   `kit.json` and Storybook's controls must still agree on every public prop.
3. Re-run the budgets, the readiness gate and the composed build. A budget that moves is
   re-anchored only with the measured value, the date and the reason.
4. Re-check the component manifest for Svelte: if the new major generates it, the decision
   not to ship a Storybook MCP docs toolset is reopened (see `writing-agent-ready-docs`).

## Done when

```sh
pnpm check
pnpm -C apps/docs docs:check
pnpm -C apps/docs llm:check
pnpm -C apps/docs site:atlas
```

all exit 0, the before and after numbers are in the pull request, and a Handbook page renders
at 390 and 1440 px in Light and Dark with no console error.

## Sources

- Storybook migration guide, "From version 10.x to 11.0.0" (required versions, Svelte CSF
  built into the frameworks, legacy syntax removed, indexing without preprocessors, builder
  docgen deprecated): https://github.com/storybookjs/storybook/blob/next/MIGRATION.md
- Upgrading Storybook: https://storybook.js.org/docs/releases/upgrading
