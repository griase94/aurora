---
name: building-atlas-specimens
description: Builds and reviews Aurora Atlas, the live showroom (specimen files *.showcase.svelte, the stage with viewport and device frames, the frame message protocol, the wall of tiles, Atlas pages and the public build). Use when adding or changing a component's *.showcase.svelte, anything under apps/docs/src/lib/kit/showcase, frame sizing or scale, the wall's mounting, or when the Atlas is slow, janky at phone width, shows the wrong size or theme, or leaks maintainer content.
paths:
  - "**/*.showcase.svelte"
  - "apps/docs/src/lib/kit/showcase/**"
  - "apps/docs/tests/atlas/**"
  - "apps/docs/scripts/check-atlas-budgets.mjs"
  - "apps/docs/scripts/check-atlas-public.mjs"
---

# Building Atlas specimens

The Atlas is the front door: live specimens in both themes, device frames, foundations,
getting started. The Handbook is the reference. A public Atlas component page ends in one
"API & usage" section that links to the Handbook; it never repeats the props table, history
or provenance.

## Rules

- **Showroom content only in the public build.** Maintainer content (git history, review
  findings, caller counts, decision codes) renders only when `KIT_PUBLIC` is unset; the public
  build swaps the modules that carry it for empty stand-ins (`publicStubs` in
  `showcase/vite.config.ts`), and `apps/docs/scripts/check-atlas-public.mjs` proves it on the
  built files. A new maintainer-only module gets a stand-in, or the check fails.
- **Status reads Stable, Beta or Deprecated**, the same words as the Handbook (`publicStatus`
  in `showcase/status-vocab.ts`, mapped onto `status-ladder.ts`).
- **True size or say so.** A frame shows at 100 % whenever it fits; otherwise it scales, never
  below `MIN_SCALE` (0.75, `stage/frame-size.ts`), and the readout states the scale. When even
  that does not fit, fall back (stack Light above Dark, show 390 instead of 768) and say so in
  the readout. Text at half size reads as broken.
- **A control never moves what the reader is looking at.** Toggling a viewport, the Light |
  Dark split, zoom or a tool keeps the stage, its scale and the panel in place.
- **Frames are dumb.** A stage frame boots `frame.html` (`frame-main.ts`), not the Atlas app:
  no shell, no sidebar, no strings. Theme, brand and zoom arrive from the page by message; a
  hotkey pressed inside the frame is sent to the page (`sc:key`), never handled there.
- **Pay only for what is on screen.** Mount specimens near the viewport, load page code on
  intent, keep dev-only tools out of production chunks. `check-atlas-budgets.mjs` holds the
  initial JS, Atlas's CSS share, the frame entry and the single-file build.

## Writing a specimen

- File: `<Name>.showcase.svelte` beside the component, exporting `entry: ShowcaseEntry` from
  `<script module>` (the contract is `apps/docs/src/lib/kit/showcase/contract.ts`).
- Enumerate controls from what the component exports (`BUTTON_VARIANTS`, the variant table
  with `fromTv`), never a retyped list, never deprecated aliases.
- `code(args)` returns the markup a reader copies; the import line is built for it from the
  public entry.
- Labels are `Loc` objects: `{ en }` is required and is the site's voice. Product copy inside
  the specimen is the only other language.
- Element ids are unique per rendered specimen: specimens of one page share a document.
- Fixture data is invented and obviously so.
- Every component folder has a specimen or a line in
  `tests/unit/kit-showcase-coverage.allowlist.txt`, which only shrinks: delete the line when
  you add the specimen.

## Stage and frames

- Use an iframe whenever viewport behaviour matters: inside it, media queries, `vw`/`dvh` and
  `position: fixed` answer to the frame. An inline box emulates width only through container
  queries, and any `@media` in the component then answers to the browser window.
- Sizing rules live in `stage/frame-size.ts` and `stage/layout.ts`, shared by the runtime and
  `tests/unit/atlas-frame-size.test.ts`. A fit frame's height follows its specimen within
  `FIT_MIN`..`FIT_MAX`; a page or shell frame has a device's natural height and never follows
  what its content reports (a `min-h-dvh` shell would grow itself).
- Write each Tailwind class whole, in a table keyed by its threshold. A class assembled from
  parts (`` `@[${n}px]:flex` ``) is never generated: Tailwind scans source text for literal
  class names.
- Messages go through the typed unions in `frame/channel.ts`. The runtime allow-lists are
  records `satisfies Record<…Type, 1>`, so a new message that is not allowed fails
  `pnpm check` instead of being dropped silently.
- Show the skeleton until the frame reports `sc:shown`; never a blank device.

## Runtime and performance

- Batch the mounts that are due into one flush per animation frame (`wall/work.ts`): N mounts
  in one flush cost one style recalculation, one mount per task pays it N times.
- Drop far specimens only when the specimens exceed their element budget, never on distance
  alone: a reader scrolling back up would pay every mount again.
- Keep broad `:has()` selectors (`html:has(…)`, `.a .b:has(…) > *`) out of component and site
  CSS: each DOM insertion can then restyle the whole document. Use a data attribute the
  component sets. Measure before relying on `content-visibility: auto`.
- Read layout once and write in `requestAnimationFrame`; never read layout in a pointer or
  scroll handler.
- React to the event that means "ready" (`ResizeObserver`, `document.fonts.ready`,
  `transitionend`, a frame message), never a `setTimeout` guess.

## Measuring a performance change

Same method before and after: build the base from the merge-base, at least 3 interleaved runs
per side, report medians and ranges. On the wall, scroll down and back up at 1440 px and at
390 px with 4x CPU throttling; record long tasks (count, total, max) and style recalculation.
Run Chromium and WebKit: they load lazy iframes at different distances. Targets: no long task
over 100 ms on the wall, INP at most 200 ms, CLS at most 0.1. A budget is re-anchored only
with the measured value, the date and the reason in the script's comment.

## Check your work

```sh
pnpm test:fast tests/unit/atlas-frame-size.test.ts tests/unit/kit-showcase-coverage.test.ts \
  tests/unit/kit-showcase-template.test.ts tests/unit/atlas-status-vocab.test.ts
pnpm -C apps/docs showcase:build && pnpm -C apps/docs showcase:single && pnpm -C apps/docs showcase:budgets
pnpm -C apps/docs showcase:public           # public build plus check-atlas-public
ATLAS_PORT=<free port> pnpm -C apps/docs test:atlas tests/atlas/stage-frames.spec.ts --workers=2
```

Green is every command exiting 0 (the budgets script fails on a missing build, so build both
first). Then look yourself: the changed specimen at 390 and 1440 px, Light, Dark and Light |
Dark, and the wall scrolled down and up; the readout matches what you see.

## Sources

- Container queries answer to an ancestor, media queries to the viewport:
  https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries
- Tailwind detects only complete class names in source:
  https://tailwindcss.com/docs/detecting-classes-in-source-files
- Lazy-loading offscreen iframes: https://web.dev/articles/iframe-lazy-loading
- `content-visibility`: https://web.dev/articles/content-visibility
- Read, then write; avoid layout thrashing:
  https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing
- Long tasks over 50 ms block input: https://web.dev/articles/optimize-long-tasks
- Core Web Vitals thresholds (INP 200 ms, CLS 0.1 at the 75th percentile):
  https://web.dev/articles/vitals
