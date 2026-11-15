---
tags: [aurora-docs]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

The Handbook is still slow on repeat visits. Add immutable cache headers for `/handbook/sb-manager/(.*)` and `/handbook/sb-addons/(.*)` in vercel.json.
