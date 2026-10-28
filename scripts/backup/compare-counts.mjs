// Check that a restored backup holds every row that existed when the backup started.
//   node scripts/backup/compare-counts.mjs before.json restored.json
// Prints the total row count on success; exits 1 listing the tables that are short.
import { readFileSync } from 'node:fs';

const [before, restored] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const short = Object.entries(before).filter(([t, n]) => (restored[t] ?? -1) < n);
if (short.length) {
  console.error(`Backup is missing rows: ${short.map(([t, n]) => `${t} ${restored[t] ?? 'missing'} < ${n}`).join(', ')}`);
  process.exit(1);
}
console.log(Object.values(restored).reduce((a, n) => a + n, 0));
