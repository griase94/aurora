# Building Atlas specimens: worked example

The smallest specimen, for a `Tag` component in a family folder `tag/`. The contract, with
every optional field (demos, matrix, rules, a11y, tile), is
`apps/docs/src/lib/kit/showcase/contract.ts`; a full specimen to copy from is
`packages/svelte/src/lib/components/ui/button/Button.showcase.svelte`.

## `Tag.showcase.svelte`

```svelte
<script module lang="ts">
  import { Tag, TAG_VARIANTS } from "./index.js";
  import { attrs, type Args, type ShowcaseEntry } from "../../../../../../../apps/docs/src/lib/kit/showcase/contract";

  export const entry: ShowcaseEntry = {
    id: "tag",
    title: "Tag",
    group: "status",
    source: "packages/svelte/src/lib/components/ui/tag/Tag.svelte",
    importFrom: "@aurora/svelte/tag", // the public entry the copied import line names
    importName: "Tag",
    line: { en: "A fact that stays true" }, // Loc: `en` required, the site's voice
    controls: {
      // from what the component exports, never a retyped list or a deprecated alias
      variant: { type: "select", options: [...TAG_VARIANTS], default: "neutral" },
      label: { type: "text", default: "Member" },
    },
    playground,
    code: (a) => `<Tag${attrs(a, ["label"])}>${a["label"] ?? "Member"}</Tag>`,
  };
</script>

{#snippet playground(a: Args)}<Tag variant={a.variant as never}>{a.label || "Member"}</Tag>{/snippet}
```

What it shows: the entry is exported from `<script module>`; `playground` is a top-level
snippet the module can name; `code(args)` returns only the markup, and the Atlas builds the
import line from `importFrom` and `importName`; the purpose, anatomy and keys come from the
Handbook page through `kit:gen` unless the entry overrides them. Then delete the folder's line
from `tests/unit/kit-showcase-coverage.allowlist.txt`.
