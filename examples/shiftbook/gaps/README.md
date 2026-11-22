# The gap ledger

Every place where Shiftbook works around something the kit lacks or gets wrong is a row in this folder: one
JSON file per row, named by its id and a short slug (`G-004-time-field.json`). The folder is the only copy;
`pnpm --filter @aurora-examples/shiftbook gaps` prints the table.

```ts
interface Gap {
  id: string; // "G-004" for a planned row, "G-F3-01" for one a lane finds (lane key and a counter); never reused
  title: string; // one line
  kit: string; // what the kit lacks or gets wrong, one sentence
  workaround: string; // what the example does instead
  where: string[]; // files, relative to the example; each carries the comment `GAP <id>`
  kitLane: string; // the kit lane expected to land the part
  swapLane: string; // the example lane that replaces the workaround and closes the row
  issue: string | null; // the public issue's URL; null while it is to be filed
  since: string; // the lane that opened the row
  closed?: { lane: string; note: string };
}
```

The rules, checked by `tests/unit/gaps.test.ts`:

- every `GAP <id>` comment has an open row, and every open row's files carry it;
- every file in `src/lib/standins/` has an open row;
- a closed row's files no longer exist or no longer carry the comment;
- a file's name starts with its id.

A pull request that adds a row names it in its `## Ledger` section (`pnpm --filter @aurora-examples/shiftbook
ledger:diff`). The lane named in `swapLane` replaces the workaround when the kit part lands, closes the row and
says so in its pull request ("retires G-004"). A `GAP <id>` comment on a line is also the only waiver of the
kit-only guard, for as long as the row is open.
