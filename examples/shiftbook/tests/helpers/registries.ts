/**
 * The closed registries: lists that name every family from the first day, so
 * that lanes running side by side add files and never edit a shared line.
 * This checker reads source text only, so its rules can be proven on a
 * synthetic file set as well as on the example itself.
 */

/** The selector areas: one file each, all re-exported by `selectors/index.ts`. */
export const SELECTOR_AREAS = [
  "shifts",
  "people",
  "tips",
  "periods",
  "me",
  "audit",
  "issues",
  "devices",
  "imports",
  "figures",
  "export",
];

/** The seed's parts: one file each, all run by `world/seed.ts`. */
export const SEED_PARTS = [
  "people",
  "shifts",
  "tips",
  "periods",
  "devices",
  "imports",
];

const DOMAIN = "src/lib/domain";
const WORLD = "src/lib/world";

/** The command families the `Command` union of `types.ts` names, from its `type` literals. */
export function commandFamilies(typesSource: string): string[] {
  const block = /export type Command =([\s\S]*?)\n(?:export|\/\*\*)/.exec(
    typesSource,
  )?.[1];
  if (!block) return [];
  const families = new Set<string>();
  for (const m of block.matchAll(/type: "([a-z]+)(?:\.[A-Za-z]+)?"/g))
    families.add(m[1]!);
  return [...families].sort();
}

const filesIn = (files: ReadonlyMap<string, string>, dir: string) =>
  [...files.keys()]
    .filter(
      (p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes("/"),
    )
    .map((p) => p.slice(dir.length + 1));

const importsOf = (source: string) =>
  [...source.matchAll(/^\s*(?:import|export)\b[^;]*?from\s+"([^"]+)"/gm)].map(
    (m) => m[1]!,
  );

/**
 * The problems of the closed registries over the example's source files
 * (paths relative to the example, with their text).
 */
export function registryProblems(files: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  const read = (p: string) => files.get(p) ?? "";

  // Commands and their handlers.
  const families = commandFamilies(read(`${DOMAIN}/types.ts`));
  if (families.length === 0) out.push("types.ts: no Command union found");
  const handlerFiles = filesIn(files, `${DOMAIN}/handlers`);
  const applyImports = importsOf(read(`${DOMAIN}/apply.ts`));
  for (const f of families) {
    if (!handlerFiles.includes(`${f}.ts`))
      out.push(`the command family "${f}" has no handlers/${f}.ts`);
    if (!applyImports.includes(`./handlers/${f}.ts`))
      out.push(`apply.ts does not import handlers/${f}.ts`);
  }
  for (const h of handlerFiles)
    if (!families.includes(h.replace(/\.ts$/, "")))
      out.push(`handlers/${h} is not a family of the Command union`);

  // Selectors.
  const selectorFiles = filesIn(files, `${DOMAIN}/selectors`);
  const index = importsOf(read(`${DOMAIN}/selectors/index.ts`));
  for (const area of SELECTOR_AREAS) {
    if (!selectorFiles.includes(`${area}.ts`))
      out.push(`the selector area "${area}" has no selectors/${area}.ts`);
    if (!index.includes(`./${area}.ts`))
      out.push(`selectors/index.ts does not re-export ${area}.ts`);
  }
  for (const s of selectorFiles)
    if (s !== "index.ts" && !SELECTOR_AREAS.includes(s.replace(/\.ts$/, "")))
      out.push(`selectors/${s} is not a selector area`);

  // Seed parts.
  const partFiles = filesIn(files, `${WORLD}/seed`);
  const seedImports = importsOf(read(`${WORLD}/seed.ts`));
  for (const part of SEED_PARTS) {
    if (!partFiles.includes(`${part}.ts`))
      out.push(`the seed part "${part}" has no seed/${part}.ts`);
    if (!seedImports.includes(`./seed/${part}.ts`))
      out.push(`seed.ts does not run seed/${part}.ts`);
  }
  for (const p of partFiles)
    if (!SEED_PARTS.includes(p.replace(/\.ts$/, "")))
      out.push(`seed/${p} is not a seed part`);

  // No second list: only the registry reaches its members.
  for (const [path, source] of files) {
    for (const spec of importsOf(source)) {
      const handler = /(?:^|\/)handlers\/([a-z]+)\.ts$/.test(spec);
      const part = /(?:^|\/)seed\/[a-z]+\.ts$/.test(spec);
      if (
        handler &&
        path !== `${DOMAIN}/apply.ts` &&
        !path.startsWith(`${DOMAIN}/handlers/`)
      )
        out.push(`${path} imports ${spec}: only apply.ts lists the handlers`);
      if (
        part &&
        path !== `${WORLD}/seed.ts` &&
        !path.startsWith(`${WORLD}/seed/`)
      )
        out.push(
          `${path} imports ${spec}: only seed.ts lists the seed's parts`,
        );
    }
  }
  return out;
}

/**
 * The domain and the world are pure: no Svelte, no DOM, no session, no real
 * time and no randomness. The session is the only way in and out.
 */
export function purityProblems(files: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  const forbidden: [RegExp, string][] = [
    [/\bDate\.now\s*\(/, "reads the real time (Date.now)"],
    [/\bnew Date\s*\(\s*\)/, "reads the real time (new Date())"],
    [/\bMath\.random\s*\(/, "draws randomness (Math.random)"],
    [/\bcrypto\.getRandomValues\s*\(/, "draws randomness (crypto)"],
    [
      /\b(?:document|window|navigator|localStorage|sessionStorage)\./,
      "touches the DOM",
    ],
  ];
  for (const [path, source] of files) {
    if (!path.startsWith(`${DOMAIN}/`) && !path.startsWith(`${WORLD}/`))
      continue;
    for (const spec of importsOf(source)) {
      if (spec === "svelte" || spec.startsWith("svelte/"))
        out.push(
          `${path} imports ${spec}: the domain and the world are framework-free`,
        );
      if (/(?:^|\/)session\//.test(spec))
        out.push(
          `${path} imports ${spec}: the domain and the world never reach the session`,
        );
    }
    for (const [re, what] of forbidden)
      if (re.test(source)) out.push(`${path} ${what}`);
  }
  return out;
}
