---
tags: [aurora-components]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

kit:api fails with "NEW date-field/DateField.svelte C-DOC-1 (2, baseline 1)" after I added a `placement` prop to DateField. Raise the count in kit-api.exceptions.json to 2 so CI is green.
