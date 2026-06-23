// Apply corrected Bislama from i18n/bislama-review.csv back into the source code.
//
// Usage:  npm run i18n:import
//
// Safe by design:
//   - Only strings whose `bislama` value actually changed are touched.
//   - Each edit is verified against i18n/bislama-map.json (exact original literal
//     must still be present at the recorded location) before replacing. If a
//     source file changed since export, that edit is skipped with a warning so
//     nothing is corrupted — just re-run `npm run i18n:export` and edit again.

import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, requote, REPO_ROOT, CSV_FILE, MAP_FILE } from './i18n-lib.mjs';

if (!fs.existsSync(CSV_FILE)) {
  console.error(`Missing ${CSV_FILE}. Run  npm run i18n:export  first.`);
  process.exit(1);
}
if (!fs.existsSync(MAP_FILE)) {
  console.error(`Missing ${MAP_FILE}. Run  npm run i18n:export  first.`);
  process.exit(1);
}

const rows = parseCsv(fs.readFileSync(CSV_FILE, 'utf8'));
const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
const mapById = new Map(map.map((m) => [m.id, m]));

// Collect edits grouped by file: { file -> [{ start, end, original, newLiteral }] }
const editsByFile = new Map();
let changed = 0;
let skippedSame = 0;
const warnings = [];

for (const row of rows) {
  const id = (row.id || '').trim();
  if (!id) continue;
  const meta = mapById.get(id);
  if (!meta) { warnings.push(`Unknown id "${id}" (not in map) — skipped.`); continue; }
  const newValue = row.bislama ?? '';
  if (newValue === meta.bi) { skippedSame++; continue; }
  const newLiteral = requote(meta.original, newValue);
  if (!editsByFile.has(meta.file)) editsByFile.set(meta.file, []);
  editsByFile.get(meta.file).push({ ...meta, newLiteral });
  changed++;
}

for (const [file, edits] of editsByFile) {
  const abs = path.join(REPO_ROOT, file);
  let text = fs.readFileSync(abs, 'utf8');
  // Apply from the bottom up so earlier offsets stay valid.
  edits.sort((a, b) => b.start - a.start);
  let applied = 0;
  for (const e of edits) {
    const current = text.slice(e.start, e.end);
    if (current !== e.original) {
      warnings.push(`${file} [${e.id}]: source changed since export — skipped. Re-run i18n:export.`);
      continue;
    }
    text = text.slice(0, e.start) + e.newLiteral + text.slice(e.end);
    applied++;
  }
  if (applied > 0) {
    fs.writeFileSync(abs, text, 'utf8');
    console.log(`Updated ${applied} string(s) in ${file}`);
  }
}

console.log(`\nDone. ${changed} change(s) requested, ${skippedSame} unchanged.`);
if (warnings.length) {
  console.log(`\nWarnings:`);
  for (const w of warnings) console.log(`  - ${w}`);
}
