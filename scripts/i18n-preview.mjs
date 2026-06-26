// Dry-run: show exactly what an import would change, without writing anything.
import fs from 'node:fs';
import { parseCsv, readCsvText, CSV_FILE, MAP_FILE } from './i18n-lib.mjs';

const rows = parseCsv(readCsvText(CSV_FILE));
const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
const mapById = new Map(map.map((m) => [m.id, m]));

const perFile = {};
const samples = [];
let total = 0;
for (const r of rows) {
  const meta = mapById.get((r.id || '').trim());
  if (!meta) continue;
  const nv = r.bislama ?? '';
  if (nv === meta.bi) continue;
  total++;
  const f = meta.source === 'translations' ? 'src/data/translations.ts' : meta.file;
  perFile[f] = (perFile[f] || 0) + 1;
  if (samples.length < 12) samples.push({ id: r.id, from: meta.bi, to: nv });
}

console.log(`Import would update ${total} bislama string(s) across ${Object.keys(perFile).length} file(s):\n`);
for (const [f, n] of Object.entries(perFile).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${f}`);
}
console.log(`\nSample changes:`);
for (const s of samples) {
  console.log(`\n  ${s.id}`);
  console.log(`    from: ${s.from}`);
  console.log(`    to:   ${s.to}`);
}
