import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  ledgerDiffProblems,
  ledgerProblems,
  ledgerTable,
  readLedger,
  readSources,
  ROOT,
  type Gap,
  type GapFile,
} from "../../scripts/ledger.mjs";

const row = (over: Partial<Gap> = {}): Gap => ({
  id: "G-004",
  title: "No time field",
  kit: "The kit has no time field.",
  workaround: "A stand-in.",
  where: ["src/lib/standins/TimeInput.svelte"],
  kitLane: "B4.3",
  swapLane: "F.9",
  issue: null,
  since: "F.2",
  ...over,
});
const file = (r: Gap, name = `${r.id}-slug.json`): GapFile => ({
  file: name,
  row: r,
});
const STANDIN = "src/lib/standins/TimeInput.svelte";
const files = (entries: Record<string, string>) =>
  new Map(Object.entries(entries));

/** A ledger that holds: one open row, its stand-in carrying the comment. */
const valid = () => ({
  rows: [file(row())],
  files: files({ [STANDIN]: "<!-- GAP G-004: the kit has no time field -->" }),
  standins: [STANDIN],
});

describe("gaps: the ledger of this example holds", () => {
  it("every comment has an open row, every row's files carry its comment, every stand-in has a row", () => {
    expect(ledgerProblems({ rows: readLedger(), ...readSources() })).toEqual(
      [],
    );
  });

  it("`pnpm gaps` prints the table and exits 0", () => {
    const out = execFileSync("node", ["scripts/print-gaps.mjs"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(out).toMatch(/^## Open \(\d+\)/);
    expect(out).toContain("| G-018 |");
  });
});

describe("gaps: each rule fails on its inversion", () => {
  it("the valid fixture passes", () => {
    expect(ledgerProblems(valid())).toEqual([]);
  });

  it("a comment without a row fails", () => {
    const v = valid();
    v.files.set("src/routes/x.svelte", "<!-- GAP G-099 -->");
    expect(ledgerProblems(v)).toEqual([
      'src/routes/x.svelte: "GAP G-099" has no row in gaps/',
    ]);
  });

  it("an open row whose file lacks the comment fails", () => {
    const v = valid();
    v.files.set(STANDIN, "<input />");
    expect(ledgerProblems(v)).toContain(
      `G-004: ${STANDIN} does not carry the comment "GAP G-004"`,
    );
  });

  it("an open row whose file does not exist fails", () => {
    const v = { ...valid(), files: files({}), standins: [] };
    expect(ledgerProblems(v)).toEqual([`G-004: ${STANDIN} does not exist`]);
  });

  it("a closed row whose file still carries the comment fails, and so does the comment", () => {
    const v = valid();
    v.rows = [file(row({ closed: { lane: "F.9", note: "TimeField landed" } }))];
    v.standins = [];
    expect(ledgerProblems(v)).toEqual([
      `${STANDIN}: "GAP G-004" names a closed row; remove the workaround or reopen it`,
      `G-004 is closed but ${STANDIN} still carries "GAP G-004"`,
    ]);
  });

  it("a stand-in without a row fails", () => {
    const v = valid();
    v.files.set("src/lib/standins/Hours.svelte", "<span></span>");
    v.standins.push("src/lib/standins/Hours.svelte");
    expect(ledgerProblems(v)).toEqual([
      "src/lib/standins/Hours.svelte: a stand-in needs an open ledger row that lists it",
    ]);
  });

  it("a file whose name does not start with its id fails", () => {
    const v = valid();
    v.rows = [file(row(), "G-005-time-field.json")];
    expect(ledgerProblems(v)).toEqual([
      "G-005-time-field.json: the file name must start with its id G-004",
    ]);
  });

  it("a malformed row and a reused id fail", () => {
    const v = valid();
    v.rows.push(
      file(row({ title: "", issue: "not a url" }), "G-004-again.json"),
    );
    expect(ledgerProblems(v)).toEqual([
      'G-004-again.json: "title" must be a non-empty string',
      'G-004-again.json: "issue" is the public issue\'s URL, or null while it is to be filed',
      "G-004-again.json: id G-004 is used twice",
    ]);
  });

  it("a lane's own ids are accepted: G-F3-01", () => {
    const r = row({ id: "G-F3-01", where: ["src/routes/a.svelte"] });
    expect(
      ledgerProblems({
        rows: [file(r)],
        files: files({ "src/routes/a.svelte": "// GAP G-F3-01" }),
        standins: [],
      }),
    ).toEqual([]);
  });
});

describe("gaps: the pull-request rule (ledger-diff)", () => {
  const body = (ledger: string) =>
    `## Why\n\nText.\n\n## Ledger\n\n${ledger}\n\n## Tests\n\nG-777 is not in the ledger section.`;

  it("a new row named in the `## Ledger` section passes", () => {
    expect(
      ledgerDiffProblems({
        baseRows: [],
        headRows: [row()],
        body: body("- G-004 opened"),
      }),
    ).toEqual([]);
  });

  it("a new row missing from the section fails, even when named elsewhere in the body", () => {
    const r = row({ id: "G-777" });
    expect(
      ledgerDiffProblems({ baseRows: [], headRows: [r], body: body("None.") }),
    ).toEqual([
      'G-777 is new: name it in the pull request\'s "## Ledger" section',
    ]);
  });

  it("a row merged earlier that still has no issue fails; with its issue it passes", () => {
    const r = row();
    expect(
      ledgerDiffProblems({ baseRows: [r], headRows: [r], body: "" }),
    ).toEqual([
      "G-004 was merged without its public issue: file it and write the URL into the row",
    ]);
    const filed = row({ issue: "https://example.com/issues/1" });
    expect(
      ledgerDiffProblems({ baseRows: [r], headRows: [filed], body: "" }),
    ).toEqual([]);
  });
});

describe("gaps: the printed table", () => {
  it("lists open rows by kit lane, then closed rows", () => {
    const table = ledgerTable([
      row({ id: "G-010", kitLane: "B6.1" }),
      row({ id: "G-004", kitLane: "B4.3" }),
      row({ id: "G-003", closed: { lane: "F.10", note: "Avatar landed" } }),
    ]);
    expect(table.indexOf("| G-004 |")).toBeLessThan(table.indexOf("| G-010 |"));
    expect(table).toContain("## Closed (1)");
    expect(table).toContain("| G-003 | No time field | F.10 | Avatar landed |");
  });
});
