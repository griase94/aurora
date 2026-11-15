# Building components: worked examples

Short shapes of what the skill tells. The full sources stay the source of truth: the
charter's **Reference component** for a component, `apps/docs/kit-api.exceptions.json` for
the baseline.

## A FIXED line and its baseline edit

You give the Combobox's last undescribed prop its JSDoc sentence. `kit:api` exits 1:

```text
FIXED    combobox/combobox.svelte C-DOC-1: lower it from 2 to 1 in apps/docs/kit-api.exceptions.json (the baseline only shrinks)
```

Lower the count in the same commit:

```diff
     "combobox/combobox.svelte": {
       "C-ARIA-1": 1,
-      "C-DOC-1": 2,
+      "C-DOC-1": 1,
```

When the line says `delete it from`, the count reached 0: remove the rule's line, and the
component's object when it is empty. Leave `population` alone; it changes only when a
component is renamed, moved or removed (`GONE`).

## A waiver

Only for a rule the charter marks waivable, with the reason on the line before the code:

```svelte
<!-- kit-api-allow C-RESP-1: the overlay is positioned against the viewport -->
<div class="max-md:inset-x-0 ...">
```

and the same pull request records it under `waivers` in the baseline, for that component and
rule, with the count the source carries. `kit:api` prints a `WAIVER` line until both agree.

## A new family, end to end

1. Copy the charter's Reference component into
   `packages/svelte/src/lib/components/ui/<family>/<Name>.svelte`; add `index.ts` exporting
   the component and its `<Name>Props` type.
2. `node scripts/aurora-package.mjs`; commit both `package.json` maps it rewrote.
3. Stories and MDX from the page template (`writing-handbook-pages`), the specimen
   (`building-atlas-specimens`), `apps/docs/examples/<slug>.svelte` importing
   `@aurora/svelte/<family>` (`writing-agent-ready-docs`); remove the folder's line from the
   two coverage allowlists.
4. Run the skill's **Check your work** block.
