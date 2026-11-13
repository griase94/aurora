# Sources

Opened or probed on 2026-11-12. "Secondary" marks a blog or vendor post that was not checked against
its underlying data.

| Rule | Source |
|---|---|
| `llms.txt` shape: H1 (required), blockquote summary, H2 sections of `- [name](url): notes`, an `Optional` section, Markdown twins at `.md` URLs, `rel="alternate" type="text/markdown"` | https://llmstxt.org/ |
| `llms-full.txt` and tiered files are a convention, not in the spec | https://svelte.dev/docs/llms ; https://storybook.js.org/llms.txt ; https://mantine.dev/llms.txt |
| Per-component Markdown pages and grouped indexes in practice | https://ui.shadcn.com/llms.txt ; https://ui.shadcn.com/docs/components/button.md ; https://www.shadcn-svelte.com/llms.txt ; https://bits-ui.com/llms.txt ; https://www.mintlify.com/docs/ai/llmstxt |
| Registry item fields as precedent for a JSON index | https://ui.shadcn.com/docs/registry/registry-item-json ; https://ui.shadcn.com/docs/mcp |
| Storybook component manifest shape (`id`, `name`, `path`, `import`, `description`, `jsDocTags`, `stories`, props), schema "still in preview"; `!manifest` | https://storybook.js.org/docs/ai/manifests |
| MCP docs toolset needs a components manifest; Svelte unsupported on 10.6; dev and testing toolsets are framework-agnostic | https://storybook.js.org/docs/ai/mcp/overview (10.6, preview) ; https://github.com/storybookjs/mcp |
| Svelte manifest and server docgen land in Storybook 11 | https://github.com/storybookjs/storybook/pull/36763 (merged 2026-10-22) ; https://github.com/storybookjs/storybook/pull/37312 (merged 2026-11-11). PR https://github.com/storybookjs/storybook/pull/36477 listed svelte-vite as out of scope for the default manifest: verify on 11 before relying on it |
| A design system's agent surface: component API, examples, usage, a11y, tokens, lint | https://primer.style/product/getting-started/foundations/mcp/ |
| Design tokens by semantic name; W3C Design Tokens Format Module 2025.10 | https://www.designtokens.org/ |
| Context files: overviews do not help agents, specific non-standard instructions are followed (+20 % cost, no general gain) | Gloaguen et al., "Evaluating AGENTS.md", arXiv 2602.11988 v3 (2026-09-29; ICLR 2026 workshop): https://arxiv.org/abs/2602.11988 |
| `Accept: text/markdown` negotiation exists at Cloudflare; not verified on Vercel static hosting | https://developers.cloudflare.com/changelog/post/2026-02-12-markdown-for-agents/ |
| llms.txt is rarely fetched by crawlers; coding agents do read docs indexes (secondary, mixed incentives) | https://www.optimizely.com/field-notes/articles/does-llms-txt-work ; https://projectllmstxt.com/blog/llms-txt-adoption-2026 |
| What agents need per component (typed props, defaults, import path, examples, when not to use, tokens) (secondary consensus) | https://designsystemsforai.com/ ; https://hvpandya.com/llm-design-systems |

Repository evidence (audit of the deployed site, 2026-11-12): component names linked to SPA URLs that
return an empty shell; `kit.json` had no package or version; the do/don't text lived only in story args;
the index stated one app's rules as Aurora's; one consumer import line in an MDX page was relative.
