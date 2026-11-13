---
tags: [aurora-docs]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Our old Chip.stories.svelte still uses <Meta title="Chip" component={Chip} /> and <Story name="Default" let:args autodocs>. Bring it to the current Svelte CSF so the Storybook 11 upgrade will not break it.
