---
name: building-atlas-specimens
description: Builds and reviews Aurora Atlas, the live showroom (specimen files *.showcase.svelte, the stage with viewport and device frames, the frame protocol, the wall of tiles, Atlas pages). Use when adding or changing a component's *.showcase.svelte, anything under apps/docs/src/lib/kit/showcase, frame sizing or scale, the wall's mounting, or when the Atlas is slow, janky at phone width, or shows the wrong size or theme.
paths:
  - "**/*.showcase.svelte"
  - "apps/docs/src/lib/kit/showcase/**"
  - "apps/docs/tests/atlas/**"
---

# Building Atlas specimens

The Atlas is the front door: look, try, compare. Live specimens in both themes, device
frames, foundations, getting started. The Handbook is the reference. The Atlas links
"API & usage →" to the Handbook page and never repeats its props table, history or
provenance.

## Hard rules

- **Showroom content only.** Specimens, demos, rules with good/bad pairs, an a11y summary,
  the link to the Handbook. Maintainer content (git history, which apps use it, review
  findings, decision codes, "unreviewed" marks) renders only when the build is not public
  (`KIT_PUBLIC` unset). Status reads **Stable**, **Beta** or **Deprecated**, as text, the same
  words as the Handbook.
- **True size or say so.** A frame shows at 100 % whenever it fits; below that it scales,
  never under `MIN_SCALE` (0.75), and the readout states the scale. When even that does not
  fit, fall back (stack Light above Dark, show 390 instead of 768) and say so where the
  reader looks. Text at 46 % reads as broken.
- **A control never moves what the reader is looking at.** Toggling a viewport, theme split,
  zoom or a tool keeps the stage, its scale and the panel in place.
- **Frames are dumb.** A frame boots the light `frame.html` entry (no shell, sidebar, palette
  or strings) and owns no state: theme, language, brand, zoom and keyboard settings arrive
  from the page by message; the frame never writes storage and never runs page hotkeys.
- **Pay for what is on screen.** Mount specimens near the viewport only; load page code on
  intent (hover, focus, touch); keep dev-only tools and QA heuristics out of production paths.

## Writing a specimen

- File: `<Name>.showcase.svelte` beside the component, exporting
  `entry: ShowcaseEntry` from `<script module>` (contract in `showcase/contract.ts`).
- Enumerate controls from what the component exports (`BUTTON_VARIANTS`, the variant table),
  never a retyped list, and never the deprecated aliases.
- `code(args)` returns the snippet a reader copies; it imports from the public entry.
- Site voice is English (`{ en, de }` labels); product copy inside the specimen stays German.
- Element ids are unique per rendered specimen; two specimens of one page share a document.
- Fixture data is invented, never real records.

## Stage and frames

- Use an iframe whenever viewport behaviour matters: inside it, media queries, `vw`/`dvh` and
  `position: fixed` answer to the frame. An inline box only emulates width through container
  queries, and any `@media` in the component then lies.
- Sizing rules live in `stage/frame-size.ts` and `stage/layout.ts`, shared by the runtime and
  `tests/unit/atlas-frame-size.test.ts`. A fit frame's height follows its specimen within
  `FIT_MIN`..`FIT_MAX`; a page or shell frame is a device with its natural height and never
  follows what it reports (a `min-h-dvh` shell would grow itself).
- Write each Tailwind class whole, in a table keyed by its threshold. A class assembled from
  parts (`` `@[${n}px]:flex` ``) is never generated, because Tailwind scans literal strings.
- Messages go through the typed union in `frame/channel.ts`. Add a message to the union and
  derive the runtime allow-list from it, so a new message cannot type-check and still be dropped.
- Show a skeleton until the specimen reports it is shown; never a blank device.
- One device-edge style for every frame that draws a device.

## Runtime and performance

- Batch the mounts that are due into one flush per animation frame and pace the measuring,
  not the mounting: N mounts in one task cost one style recalculation; one mount per task
  pays it N times.
- Drop far specimens only when a node or heap budget is exceeded, not on distance alone; a
  scroll back up must not pay every mount again.
- Keep broad `:has()` selectors out of component and site CSS (`.a .b:has(…) > *`,
  `html:has(…)`): each DOM insertion then restyles the whole document. Use a data attribute
  the component sets. `content-visibility: auto` does not skip style invalidation; measure
  before you rely on it.
- Never read layout in a pointer or scroll handler; read once, write in `requestAnimationFrame`.
  Set `pointer-events: none` on frames while dragging a resize handle.
- Effects without timers: react to the event that means "ready" (`ResizeObserver`,
  `MutationObserver`, `document.fonts.ready`, `transitionend`, `e.defaultPrevented`), never a
  `setTimeout` guess. Name an effect's trigger with an explicit `$derived` key, not a dummy
  read (`void x;`, `if ([a, b].length)`).
- Budgets: `apps/docs/scripts/check-atlas-budgets.mjs` (frame entry, initial JS, CSS share,
  single file). Re-anchor with the measured value, the date and the reason in its comment.

## Measuring (before and after, same method)

- Build the base from the merge-base, not from memory. Interleave runs, at least 3 per side,
  report medians and ranges. One run hides outliers in both directions.
- Wall: scroll down and back up, at 1440 and at 390 with 4× CPU throttle. Record long tasks
  (count, total, max) and style-recalculation time.
- Stage: time from the viewport click to the specimen shown; frame requests.
- Run Chromium and WebKit: Chromium loads lazy iframes far ahead, Mobile Safari only in view.
- Targets: no long task over 100 ms on the wall, INP ≤ 200 ms, CLS ≤ 0.1.

## Verify

```sh
pnpm test:fast tests/unit/atlas-frame-size.test.ts
pnpm -C apps/docs showcase:build && pnpm -C apps/docs showcase:budgets
ATLAS_PORT=<free port> pnpm -C apps/docs test:atlas tests/atlas/stage-frames.spec.ts tests/atlas/wall-runtime.spec.ts
```

Then look yourself: the changed specimen at 390 and 1440, Light and Dark, single and
Light | Dark, and the wall scrolled down and up; the readout matches what you see.

## Before you call it done

- No props, history or maintainer content in the public Atlas; the Handbook link resolves.
- Frames at true size or a stated scale ≥ 75 %; no control moves the stage.
- Perf claims rest on ≥ 3 interleaved runs per side, phone throttle included.

Sources (iframe and viewport behaviour, lazy loading, containment, layout thrashing, Web
Vitals): [references/sources.md](references/sources.md).
