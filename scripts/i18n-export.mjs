// Export every Bislama string (from the translation table AND inline component
// ternaries) into i18n/bislama-review.csv for manual correction.
//
// Usage:  npm run i18n:export
//
// Then open i18n/bislama-review.csv in Excel / Google Sheets, fix the `bislama`
// column (English + French are there for reference), save as CSV, and run
// `npm run i18n:import` to write the corrections back into the source.

import { buildUnits, writeCsv, writeMap, CSV_FILE, MAP_FILE } from './i18n-lib.mjs';

const units = buildUnits();
writeCsv(units);
writeMap(units);

const tr = units.filter((u) => u.source === 'translations').length;
const inline = units.length - tr;

console.log(`Exported ${units.length} Bislama strings (${tr} from the translation table, ${inline} inline in components).`);
console.log(`  Edit:   ${CSV_FILE}`);
console.log(`  Map:    ${MAP_FILE}  (do not edit — used by import)`);
console.log(`\nNext: correct the "bislama" column, save the CSV, then run  npm run i18n:import`);
