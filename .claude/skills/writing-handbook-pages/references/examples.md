# Writing Handbook pages: worked example

The smallest shape of a page, for a `Tag` component in the family `Status`. The full contract,
with every chapter and the `parameters.kit` fields, is
`apps/docs/src/lib/kit/templates/ComponentPage.template.md`: copy that, not this.

## `Tag.stories.svelte`

```svelte
<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import { Tag, TAG_VARIANTS } from "@aurora/svelte/tag";
	import type { KitParameters } from "$kit/kit-parameters";
	import Stage from "$kit/handbuch/Stage.svelte";

	const kit: KitParameters = {
		status: "stable",
		purpose: "Label a thing with a fact that stays true.",
		source: "packages/svelte/src/lib/components/ui/tag/Tag.svelte",
		// …the template's other fields, read from the component's source
	};

	const { Story } = defineMeta({
		title: "Components/Status/Tag",
		component: Tag,
		tags: ["status:stable"], // never "autodocs": the MDX below is the page
		parameters: { kit },
		argTypes: { variant: { control: "select", options: [...TAG_VARIANTS] } },
	});
</script>

<!-- A composition needs the template snippet: static children would become
     Tag's own `children` and render as one tag. -->
<Story name="Overview" exportName="Overview" tags={["!dev"]}>
	{#snippet template(_args, context)}
		<Stage storyId={context.id} kit={context.parameters.kit}>
			{#snippet specimen()}<Tag>Board</Tag> <Tag variant="outline">Member</Tag>{/snippet}
		</Stage>
	{/snippet}
</Story>
```

## `Tag.mdx`, the chapter that embeds it

```mdx
import { Meta, Canvas } from "@storybook/addon-docs/blocks";
import { KitHeader, KitExample } from "$kit-blocks";
import * as Stories from "./Tag.stories.svelte";

<Meta of={Stories} />

<KitHeader />

## 01 Overview

Label a thing with a fact that stays true. A state that changes is a
[status pill](?path=/docs/components-status-identity-statuspill--docs).

<Canvas of={Stories.Overview} sourceState="none" withToolbar={false} />

<KitExample />
```

What it shows: the meta carries `parameters.kit` and the status tag; the controls come from
the exported variant list; the specimen is a story with `template`, embedded by `<Canvas>`
without source; the data chapter is a block; the link is a relative `?path=` to a docs id.
