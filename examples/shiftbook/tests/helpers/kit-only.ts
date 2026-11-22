/**
 * The kit-only rule: a screen is built from Aurora. This scanner parses a
 * `.svelte` file with the Svelte compiler and reports every place where a
 * screen builds what the kit should provide, styles past the tokens, reads
 * time or formats on its own, or writes words outside the messages.
 *
 * Zones: a stand-in may contain raw elements (that is its job) and nothing
 * else from the list; the demo's chrome is exempt from the text rules only;
 * viewport variants are refused in compositions, which sit in columns of any
 * width.
 */
import { parse } from "svelte/compiler";

export type Zone = "screen" | "compose" | "standin" | "demo";

export type Rule =
  | "raw-element"
  | "native-title"
  | "positive-tabindex"
  | "click-on-text"
  | "colour"
  | "palette"
  | "dark-variant"
  | "shadow-radius"
  | "arbitrary-value"
  | "physical-direction"
  | "viewport-variant"
  | "own-time-or-number"
  | "text"
  | "literal-prop"
  | "import";

export interface Finding {
  rule: Rule;
  line: number;
  what: string;
}

/** Elements the kit provides; a screen uses the kit's component or a stand-in with a ledger row. */
export const RAW_ELEMENTS = [
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "table",
  "dialog",
  "details",
  "progress",
  "meter",
];

/** Props whose value a person reads or hears; a literal there bypasses the messages. */
export const VISIBLE_PROPS = [
  "label",
  "title",
  "placeholder",
  "aria-label",
  "alt",
  "description",
  "heading",
  "caption",
  "legend",
  "hint",
  "message",
  "text",
];

const PALETTE =
  /^(?:text|bg|border|ring|fill|stroke|from|via|to|outline|decoration|accent|caret|divide|placeholder|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?(?:\/\d+)?$/;
const SHADOW_RADIUS =
  /^(?:shadow|rounded(?:-[tblrse]{1,2})?)(?:-(?:none|xs|sm|md|lg|xl|2xl|3xl|inner|full))?$/;
const PHYSICAL =
  /^-?(?:m[lr]|p[lr]|left|right|border-[lr]|rounded-[lr]|rounded-[tb][lr]|scroll-m[lr]|scroll-p[lr])(?:-|$)|^(?:text|float|clear)-(?:left|right)$/;
const VIEWPORT_VARIANT = /^(?:sm|md|lg|xl|2xl|max-sm|max-md|max-lg|max-xl)$/;
const COLOUR_LITERAL =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color-mix)\(/;
const CSS_SHADOW_RADIUS = /\b(?:box-shadow|border-radius)\s*:/;
const LETTERS = /\p{L}/u;

type Node = { type: string; start: number; end: number; [k: string]: unknown };

const isNode = (v: unknown): v is Node =>
  typeof v === "object" && v !== null && typeof (v as Node).type === "string";

export function scanKitOnly(source: string, zone: Zone): Finding[] {
  const ast = parse(source, { modern: true }) as unknown as Node;
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++)
    if (source[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (offset: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const findings: Finding[] = [];
  const add = (rule: Rule, at: number, what: string) =>
    findings.push({ rule, line: lineOf(at), what });

  /** Every string a class attribute can produce: static text and string literals in its expressions. */
  const strings = (value: unknown): { text: string; at: number }[] => {
    const out: { text: string; at: number }[] = [];
    const visit = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(visit);
      if (!isNode(v)) return;
      if (v.type === "Text") out.push({ text: String(v.data), at: v.start });
      else if (v.type === "Literal" && typeof v.value === "string")
        out.push({ text: v.value, at: v.start });
      else if (v.type === "TemplateElement")
        out.push({
          text: String((v.value as { cooked?: string }).cooked ?? ""),
          at: v.start,
        });
      else for (const [k, c] of Object.entries(v)) if (k !== "type") visit(c);
    };
    visit(value);
    return out;
  };

  const checkColour = (text: string, at: number) => {
    if (COLOUR_LITERAL.test(text)) add("colour", at, text.trim());
    if (CSS_SHADOW_RADIUS.test(text)) add("shadow-radius", at, text.trim());
  };

  const checkClassToken = (token: string, at: number) => {
    const parts = token.split(":");
    const base = parts.pop()!.replace(/^!/, "");
    const variants = parts;
    if (/\[[^\]]*\]/.test(token)) add("arbitrary-value", at, token);
    if (variants.includes("dark")) add("dark-variant", at, token);
    if (zone === "compose" && variants.some((v) => VIEWPORT_VARIANT.test(v)))
      add("viewport-variant", at, token);
    if (PALETTE.test(base)) add("palette", at, token);
    if (SHADOW_RADIUS.test(base)) add("shadow-radius", at, token);
    if (PHYSICAL.test(base)) add("physical-direction", at, token);
    checkColour(token, at);
  };

  const staticValue = (value: unknown): string | null => {
    if (!Array.isArray(value)) return null;
    if (!value.every((v) => isNode(v) && v.type === "Text")) return null;
    return value.map((v) => String((v as Node).data)).join("");
  };

  const checkAttribute = (attr: Node, element: Node | null) => {
    const name = String(attr.name);
    const elementName = element ? String(element.name) : "";
    const isRegular = element?.type === "RegularElement";
    if (attr.type === "Attribute") {
      if (name === "class")
        for (const s of strings(attr.value))
          for (const token of s.text.split(/\s+/).filter(Boolean))
            checkClassToken(token, s.at);
      if (name === "style")
        for (const s of strings(attr.value)) checkColour(s.text, s.at);
      if (name === "title" && isRegular)
        add("native-title", attr.start, `<${elementName} title>`);
      if (name === "tabindex") {
        const v = staticValue(attr.value);
        const expr =
          Array.isArray(attr.value) && attr.value.length === 1
            ? (attr.value[0] as Node)
            : isNode(attr.value)
              ? attr.value
              : null;
        const literal =
          v ??
          (expr?.type === "ExpressionTag" &&
          isNode(expr.expression) &&
          expr.expression.type === "Literal"
            ? String(expr.expression.value)
            : null);
        if (literal !== null && Number(literal) > 0)
          add("positive-tabindex", attr.start, `tabindex=${literal}`);
      }
      if (
        name === "onclick" &&
        isRegular &&
        (elementName === "div" || elementName === "span")
      )
        add("click-on-text", attr.start, `<${elementName} onclick>`);
      if (zone !== "demo" && VISIBLE_PROPS.includes(name)) {
        const text = strings(
          Array.isArray(attr.value)
            ? attr.value.filter((v) => isNode(v) && v.type === "Text")
            : [],
        )
          .map((s) => s.text)
          .join("");
        if (LETTERS.test(text))
          add("literal-prop", attr.start, `${name}="${text}"`);
      }
    }
    if (
      attr.type === "OnDirective" &&
      name === "click" &&
      isRegular &&
      (elementName === "div" || elementName === "span")
    )
      add("click-on-text", attr.start, `<${elementName} on:click>`);
    if (attr.type === "ClassDirective") checkClassToken(name, attr.start);
    if (attr.type === "StyleDirective")
      for (const s of strings(attr.value)) checkColour(s.text, s.at);
  };

  const checkScript = (node: Node) => {
    const callee = isNode(node.callee) ? node.callee : null;
    const member = (n: Node | null, object: string, prop?: string) =>
      n?.type === "MemberExpression" &&
      isNode(n.object) &&
      n.object.type === "Identifier" &&
      n.object.name === object &&
      (prop === undefined || (isNode(n.property) && n.property.name === prop));
    switch (node.type) {
      case "NewExpression":
        if (callee?.type === "Identifier" && callee.name === "Date")
          add("own-time-or-number", node.start, "new Date(");
      // falls through: `new Intl.NumberFormat("de-DE")` is a call with a literal locale too.
      case "CallExpression": {
        if (member(callee, "Date", "now"))
          add("own-time-or-number", node.start, "Date.now(");
        if (callee?.type === "Identifier" && callee.name === "parseFloat")
          add("own-time-or-number", node.start, "parseFloat(");
        if (member(callee, "Number", "parseFloat"))
          add("own-time-or-number", node.start, "Number.parseFloat(");
        const args = node.arguments as Node[] | undefined;
        if (
          member(callee, "Intl") &&
          args?.[0]?.type === "Literal" &&
          typeof args[0].value === "string"
        )
          add("own-time-or-number", node.start, "Intl with a literal locale");
        if (
          callee?.type === "MemberExpression" &&
          isNode(callee.property) &&
          [
            "toLocaleString",
            "toLocaleDateString",
            "toLocaleTimeString",
            "toFixed",
          ].includes(String(callee.property.name))
        )
          add(
            "own-time-or-number",
            node.start,
            `${String(callee.property.name)}(`,
          );
        break;
      }
      case "BinaryExpression":
        if (
          node.operator === "/" &&
          isNode(node.right) &&
          node.right.type === "Literal" &&
          node.right.value === 100
        )
          add("own-time-or-number", node.start, "/ 100");
        break;
      case "Identifier":
        if (node.name === "localStorage")
          add("own-time-or-number", node.start, "localStorage");
        break;
      case "ImportDeclaration": {
        const from = String((node.source as Node).value);
        if (from === "bits-ui" || from.startsWith("bits-ui/"))
          add("import", node.start, from);
        else if (
          from.endsWith(".svelte") &&
          !from.startsWith(".") &&
          !from.startsWith("$lib/")
        )
          add("import", node.start, from);
        else if (/\/icons$/.test(from)) add("import", node.start, from);
        break;
      }
    }
  };

  const walk = (value: unknown, element: Node | null) => {
    if (Array.isArray(value)) {
      for (const v of value) walk(v, element);
      return;
    }
    if (!isNode(value)) return;
    const node = value;
    if (
      node.type === "RegularElement" ||
      node.type === "Component" ||
      node.type === "SvelteElement"
    ) {
      if (
        node.type === "RegularElement" &&
        zone !== "standin" &&
        RAW_ELEMENTS.includes(String(node.name))
      )
        add("raw-element", node.start, `<${String(node.name)}>`);
      for (const attr of (node.attributes as Node[]) ?? []) {
        checkAttribute(attr, node);
        // Expressions inside attributes still face the script rules.
        for (const [k, c] of Object.entries(attr))
          if (k !== "type" && k !== "name") walkScriptOnly(c);
      }
      walk(node.fragment, node);
      return;
    }
    if (node.type === "Text") {
      if (zone !== "demo" && LETTERS.test(String(node.data)))
        add("text", node.start, String(node.data).trim().slice(0, 40));
      return;
    }
    checkScript(node);
    for (const [k, c] of Object.entries(node))
      if (k !== "type" && k !== "metadata") walk(c, element);
  };

  /** Script rules only: for attribute values, whose text is not a text node. */
  const walkScriptOnly = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walkScriptOnly);
    if (!isNode(value) || value.type === "Text") return;
    checkScript(value);
    for (const [k, c] of Object.entries(value))
      if (k !== "type" && k !== "metadata") walkScriptOnly(c);
  };

  const root = ast as Node & {
    fragment: Node;
    instance: Node | null;
    module: Node | null;
    css: Node | null;
  };
  walk(root.fragment, null);
  if (root.instance) walkScriptOnly(root.instance.content);
  if (root.module) walkScriptOnly(root.module.content);
  if (root.css) {
    const css = source.slice(root.css.start, root.css.end);
    const lines = css.split("\n");
    let offset = root.css.start;
    for (const l of lines) {
      checkColour(l, offset);
      offset += l.length + 1;
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}

/** The zone of a file under the example's `src/`. */
export function zoneOf(path: string): Zone {
  if (path.startsWith("src/lib/standins/")) return "standin";
  if (path.startsWith("src/lib/demo/")) return "demo";
  if (path.startsWith("src/lib/compose/")) return "compose";
  return "screen";
}

/** The folders the rule covers: screens, the parts they share, compositions, stand-ins and the demo's chrome. */
export const KIT_ONLY_DIRS = [
  "src/routes",
  "src/lib/screens",
  "src/lib/compose",
  "src/lib/standins",
  "src/lib/demo",
];

/**
 * Drops the findings on a line that carries `GAP <id>` for an open ledger row:
 * the ledger is the only waiver, and only while its row is open.
 */
export function unwaived(
  findings: Finding[],
  source: string,
  openIds: ReadonlySet<string>,
): Finding[] {
  const lines = source.split("\n");
  return findings.filter((f) => {
    const ids = [
      ...(lines[f.line - 1] ?? "").matchAll(/\bGAP (G-[A-Z0-9]+(?:-\d+)?)\b/g),
    ].map((m) => m[1]!);
    return !ids.some((id) => openIds.has(id));
  });
}
