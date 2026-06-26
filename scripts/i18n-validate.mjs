// Validate i18n/bislama-review.csv against i18n/bislama-map.json WITHOUT changing
// any source files. Reports structure, id matching, encoding and what changed.
//
// Usage:  node scripts/i18n-validate.mjs

import fs from 'node:fs';
import { parseCsv, CSV_FILE, MAP_FILE } from './i18n-lib.mjs';

function fail(msg) { console.error(`\n❌ ${msg}`); process.exit(1); }

if (!fs.existsSync(CSV_FILE)) fail(`Missing ${CSV_FILE}`);
if (!fs.existsSync(MAP_FILE)) fail(`Missing ${MAP_FILE} (re-run npm run i18n:export if needed)`);

const raw = fs.readFileSync(CSV_FILE, 'utf8');
const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
const mapById = new Map(map.map((m) => [m.id, m]));

const issues = [];
const warnings = [];

// --- Encoding sanity -------------------------------------------------------
const hadBom = raw.charCodeAt(0) === 0xfeff;
const rows = parseCsv(raw);

// Corruption in the bislama column is a blocker (it gets imported); in the
// english/french reference columns it's harmless (never imported).
let biCorrupt = 0;
let refCorrupt = 0;
for (const r of rows) {
  biCorrupt += ((r.bislama || '').match(/\uFFFD/g) || []).length;
  refCorrupt += ((r.english || '').match(/\uFFFD/g) || []).length;
  refCorrupt += ((r.french || '').match(/\uFFFD/g) || []).length;
}
if (biCorrupt > 0) {
  issues.push(`${biCorrupt} corrupted character(s) (\uFFFD) in the bislama column — these would be imported. Re-save as UTF-8.`);
}
if (refCorrupt > 0) {
  warnings.push(`${refCorrupt} corrupted character(s) in english/french reference columns — harmless (never imported), but indicates a non-UTF-8 save.`);
}

// --- Header ----------------------------------------------------------------
const firstLine = raw.replace(/^\uFEFF/, '').split(/\r?\n/)[0];
const expectedHeader = 'id,english,french,bislama,where';
if (firstLine.trim() !== expectedHeader) {
  issues.push(`Header row is "${firstLine.trim()}" but should be "${expectedHeader}". Do not rename or reorder columns.`);
}

// --- Row-level checks ------------------------------------------------------
const seen = new Set();
let missingId = 0;
let unknownId = 0;
let dupId = 0;
let emptyBislama = 0;
let changed = 0;
let unchanged = 0;
const unknownSamples = [];
const emptySamples = [];

for (const row of rows) {
  const id = (row.id || '').trim();
  if (!id) { missingId++; continue; }
  if (seen.has(id)) { dupId++; continue; }
  seen.add(id);

  const meta = mapById.get(id);
  if (!meta) {
    unknownId++;
    if (unknownSamples.length < 5) unknownSamples.push(id);
    continue;
  }
  const bi = row.bislama ?? '';
  if (bi.trim() === '') {
    emptyBislama++;
    if (emptySamples.length < 5) emptySamples.push(id);
  }
  if (bi === meta.bi) unchanged++; else changed++;
}

const missingFromCsv = map.filter((m) => !seen.has(m.id)).map((m) => m.id);

if (missingId > 0) issues.push(`${missingId} row(s) have a blank id column.`);
if (unknownId > 0) issues.push(`${unknownId} row(s) have an id not present in the map (e.g. ${unknownSamples.join(', ')}). Ids must match the export.`);
if (dupId > 0) issues.push(`${dupId} duplicate id row(s).`);
if (missingFromCsv.length > 0) {
  issues.push(`${missingFromCsv.length} row(s) from the original export are missing in the CSV (e.g. ${missingFromCsv.slice(0, 5).join(', ')}). Don't delete rows.`);
}
if (emptyBislama > 0) warnings.push(`${emptyBislama} row(s) have an empty bislama cell (e.g. ${emptySamples.join(', ')}). These would import as blank text.`);

// --- Report ----------------------------------------------------------------
console.log('Bislama CSV validation');
console.log('======================');
console.log(`File:            ${CSV_FILE}`);
console.log(`Encoding BOM:    ${hadBom ? 'yes (UTF-8 BOM — good)' : 'no BOM'}`);
console.log(`Rows in map:     ${map.length}`);
console.log(`Rows in CSV:     ${rows.length}`);
console.log(`Matched ids:     ${seen.size}`);
console.log(`Changed:         ${changed}`);
console.log(`Unchanged:       ${unchanged}`);

if (warnings.length) {
  console.log(`\n⚠️  Warnings (safe to import, but check):`);
  for (const w of warnings) console.log(`  - ${w}`);
}

if (issues.length) {
  console.log(`\n❌ Problems that must be fixed before importing:`);
  for (const i of issues) console.log(`  - ${i}`);
  console.log(`\nResult: NOT READY to import.`);
  process.exit(2);
}

console.log(`\n✅ Format looks correct. Ready to import (${changed} change(s) will be applied).`);
