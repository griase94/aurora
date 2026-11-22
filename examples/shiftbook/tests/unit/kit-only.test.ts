import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listFiles, readLedger, ROOT } from "../../scripts/ledger.mjs";
import {
  KIT_ONLY_DIRS,
  scanKitOnly,
  unwaived,
  zoneOf,
  type Rule,
  type Zone,
} from "../helpers/kit-only.ts";

const rulesOf = (source: string, zone: Zone = "screen"): Rule[] =>
  scanKitOnly(source, zone).map((f) => f.rule);

describe("kit-only: every screen of this example is built from Aurora", () => {
  // Until the app shell lands, the scanned folders hold no `.svelte` file; the
  // rule is proven on the fixtures below and runs over every file the moment
  // one exists.
  const files = KIT_ONLY_DIRS.flatMap((d) => listFiles(ROOT, d)).filter((p) =>
    p.endsWith(".svelte"),
  );
  const open = new Set(
    readLedger()
      .filter((f) => !f.row.closed)
      .map((f) => f.row.id),
  );

  it.each(files.length ? files : ["(no screen files yet)"])("%s", (path) => {
    if (!path.endsWith(".svelte")) return;
    const source = readFileSync(join(ROOT, path), "utf8");
    expect(unwaived(scanKitOnly(source, zoneOf(path)), source, open)).toEqual(
      [],
    );
  });
});

/** Correct markup that is easy to misjudge: none of it may be reported. */
const CORRECT = `<script lang="ts">
	import { Button } from "@scope/kit/button";
	import Clock from "@scope/kit/icons/clock";
	import { useSession } from "$lib/session/context.ts";
	import PersonLine from "$lib/compose/PersonLine.svelte";
	const session = useSession();
	const t = useT();
	const share = (part: number, whole: number) => part / whole;
</script>

<section class="grid gap-4 ms-2 pe-3 text-start @md:grid-cols-2 cols-aside-start shadow-elev-1 rounded-control text-ink-700 bg-card">
	<h1 class="text-body">{t.today.title}</h1>
	<Button label={t.actions.save} onclick={() => session.dispatch(cmd)}>{t.actions.save}</Button>
	<PersonLine name={person.name} />
	<span aria-hidden="true">·</span>
	<a href="#main" tabindex="0">{t.skip}</a>
	<time datetime={session.clock.instant}>{format.time(session.clock.instant)}</time>
</section>

<style>
	section { inline-size: 100%; color: var(--color-ink-700); }
</style>
`;

describe("kit-only: each rule fails on its inversion", () => {
  it("correct markup passes, including logical utilities, named tracks, container variants and role utilities", () => {
    expect(scanKitOnly(CORRECT, "compose")).toEqual([]);
  });

  const cases: [string, string, Rule, Zone?][] = [
    ["a raw button", "<button>{t.save}</button>", "raw-element"],
    ["a raw input", '<input name="code" />', "raw-element"],
    ["a raw table", "<table></table>", "raw-element"],
    ["a native title", "<span title={t.hint}>{t.x}</span>", "native-title"],
    [
      "a positive tabindex",
      '<a href="/" tabindex="2">{t.x}</a>',
      "positive-tabindex",
    ],
    [
      "a positive tabindex as an expression",
      '<a href="/" tabindex={3}>{t.x}</a>',
      "positive-tabindex",
    ],
    [
      "a click handler on a div",
      "<div onclick={go}>{t.x}</div>",
      "click-on-text",
    ],
    [
      "a legacy click handler on a span",
      "<span on:click={go}>{t.x}</span>",
      "click-on-text",
    ],
    [
      "a hex colour in a class",
      '<p class="text-[#ff0000]">{t.x}</p>',
      "colour",
    ],
    [
      "an rgb colour in a style",
      '<p style="color: rgb(1, 2, 3)">{t.x}</p>',
      "colour",
    ],
    [
      "an oklch colour in the stylesheet",
      "<p>{t.x}</p><style>p { color: oklch(0.5 0.1 200); }</style>",
      "colour",
    ],
    ["a palette utility", '<p class="text-emerald-600">{t.x}</p>', "palette"],
    [
      "a palette utility in an expression",
      '<p class={ok ? "bg-red-50" : ""}>{t.x}</p>',
      "palette",
    ],
    [
      "a dark variant",
      '<p class="dark:text-ink-100">{t.x}</p>',
      "dark-variant",
    ],
    ["a shadow literal", '<p class="shadow-md">{t.x}</p>', "shadow-radius"],
    ["a radius literal", '<p class="rounded-lg">{t.x}</p>', "shadow-radius"],
    [
      "a radius in a style",
      '<p style="border-radius: 4px">{t.x}</p>',
      "shadow-radius",
    ],
    [
      "an arbitrary size",
      '<p class="text-[13px]">{t.x}</p>',
      "arbitrary-value",
    ],
    [
      "an arbitrary track",
      '<div class="grid-cols-[22rem_1fr]">{t.x}</div>',
      "arbitrary-value",
    ],
    ["a physical margin", '<p class="ml-2">{t.x}</p>', "physical-direction"],
    [
      "a physical alignment",
      '<p class="text-left">{t.x}</p>',
      "physical-direction",
    ],
    ["a physical inset", '<p class="left-0">{t.x}</p>', "physical-direction"],
    [
      "a physical class directive",
      "<p class:pr-4={wide}>{t.x}</p>",
      "physical-direction",
    ],
    [
      "a viewport variant in a composition",
      '<p class="md:grid">{t.x}</p>',
      "viewport-variant",
      "compose",
    ],
    [
      "new Date",
      "<script>const d = new Date();</script>",
      "own-time-or-number",
    ],
    [
      "Date.now",
      "<script>const n = Date.now();</script>",
      "own-time-or-number",
    ],
    [
      "toLocaleString in markup",
      "<p>{amount.toLocaleString()}</p>",
      "own-time-or-number",
    ],
    [
      "Intl with a literal locale",
      '<script>const f = new Intl.NumberFormat("de-DE");</script>',
      "own-time-or-number",
    ],
    ["toFixed", "<p>{hours.toFixed(2)}</p>", "own-time-or-number"],
    [
      "parseFloat",
      "<script>const v = parseFloat(x);</script>",
      "own-time-or-number",
    ],
    ["cents divided by 100", "<p>{cents / 100}</p>", "own-time-or-number"],
    [
      "localStorage",
      '<script>localStorage.setItem("a", "b");</script>',
      "own-time-or-number",
    ],
    ["a word in the markup", "<p>Heute</p>", "text"],
    ["a literal visible prop", '<Button label="Save" />', "literal-prop"],
    [
      "a literal aria-label",
      '<a href="/" aria-label="Home">{t.x}</a>',
      "literal-prop",
    ],
    [
      "an import from bits-ui",
      '<script>import { Dialog } from "bits-ui";</script>',
      "import",
    ],
    [
      "a .svelte path inside the package",
      '<script>import X from "@scope/kit/src/lib/button/Button.svelte";</script>',
      "import",
    ],
    [
      "the icon barrel",
      '<script>import { Clock } from "@scope/kit/icons";</script>',
      "import",
    ],
  ];

  it.each(cases)("%s is reported", (_name, source, rule, zone = "screen") => {
    expect(rulesOf(source, zone)).toContain(rule);
  });

  it("a stand-in may contain raw elements and nothing else from the list", () => {
    expect(rulesOf('<input name="t" class="ps-2" />', "standin")).toEqual([]);
    expect(rulesOf('<input class="ml-2" />', "standin")).toEqual([
      "physical-direction",
    ]);
  });

  it("the demo's chrome is exempt from the text rules only", () => {
    expect(rulesOf('<p>Demo</p><Badge label="Beta" />', "demo")).toEqual([]);
    expect(rulesOf('<p class="text-red-500">Demo</p>', "demo")).toEqual([
      "palette",
    ]);
  });

  it("a viewport variant outside a composition is the screen's own choice", () => {
    expect(rulesOf('<p class="md:grid">{t.x}</p>', "screen")).toEqual([]);
  });

  it("findings carry their line", () => {
    expect(scanKitOnly("<p>{t.x}</p>\n<button></button>", "screen")).toEqual([
      { rule: "raw-element", line: 2, what: "<button>" },
    ]);
  });
});

describe("kit-only: the ledger is the only waiver, while its row is open", () => {
  const source = '<input name="start" /><!-- GAP G-004 -->\n<select></select>';
  const findings = scanKitOnly(source, "screen");

  it("a finding on a line with an open row's comment is accepted", () => {
    expect(unwaived(findings, source, new Set(["G-004"]))).toEqual([
      { rule: "raw-element", line: 2, what: "<select>" },
    ]);
  });

  it("the same finding fails again once the row closes", () => {
    expect(unwaived(findings, source, new Set())).toHaveLength(2);
  });
});
