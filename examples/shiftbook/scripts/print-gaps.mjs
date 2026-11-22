#!/usr/bin/env node
/**
 * Prints the gap ledger (`pnpm gaps`): open rows by the kit lane expected to
 * land the part, then closed rows. Exits 1 when the ledger breaks a rule, so
 * the table never hides a broken row. Nothing is written: the folder is the
 * only copy.
 */
import {
  ledgerProblems,
  ledgerTable,
  readLedger,
  readSources,
} from "./ledger.mjs";

const rows = readLedger();
console.log(ledgerTable(rows.map((f) => f.row)));
const problems = ledgerProblems({ rows, ...readSources() });
if (problems.length) {
  console.error(`\nThe ledger breaks ${problems.length} rule(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
}
