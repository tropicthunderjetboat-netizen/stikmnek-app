// Shared helpers for the Bislama export/import round-trip tooling.
//
// Bislama text lives in two places in this codebase:
//   1. The central translation table  src/data/translations.ts  ( key -> {en, fr, bi} )
//   2. Inline ternaries in components  ( language === 'en' ? 'A' : language === 'fr' ? 'B' : 'C' )
//
// These helpers use the TypeScript compiler API (already a dev dependency) to
// reliably find every Bislama string + its English/French reference, and to
// write corrected Bislama back into the exact source location.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, '..');
export const SRC_DIR = path.join(REPO_ROOT, 'src');
export const TRANSLATIONS_FILE = path.join(SRC_DIR, 'data', 'translations.ts');
export const OUT_DIR = path.join(REPO_ROOT, 'i18n');
export const CSV_FILE = path.join(OUT_DIR, 'bislama-review.csv');
export const MAP_FILE = path.join(OUT_DIR, 'bislama-map.json');

const LANG_CODES = new Set(['en', 'fr', 'bi']);

function relPath(abs) {
  return path.relative(REPO_ROOT, abs).split(path.sep).join('/');
}

/** Recursively collect .ts/.tsx files under a directory, skipping noise. */
export function collectSourceFiles(dir = SRC_DIR) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      if (/\.d\.ts$/.test(entry.name)) continue;
      if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
      out.push(full);
    }
  }
  return out;
}

function parseFile(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  const sf = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return { sf, text };
}

function isStringLike(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));
}

/** If `node` is `<x>.language === 'xx'` or `language === 'xx'` (either order), return 'xx'. */
function langCodeFromTest(node) {
  if (!node || !ts.isBinaryExpression(node)) return null;
  if (node.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return null;
  const sides = [node.left, node.right];
  const lit = sides.find((s) => ts.isStringLiteral(s));
  const ref = sides.find((s) => s !== lit);
  if (!lit || !ref) return null;
  if (!LANG_CODES.has(lit.text)) return null;
  const refText = ref.getText();
  if (refText === 'language' || /\blanguage$/.test(refText)) return lit.text;
  return null;
}

/**
 * Walk a conditional chain rooted at `cond` of the shape
 *   language === 'en' ? EN : language === 'fr' ? FR : ELSE
 * Returns { explicit: {en?,fr?,bi?: node}, elseNode } or null if it isn't a language chain.
 */
function parseLangChain(cond) {
  const explicit = {};
  let node = cond;
  let sawLangTest = false;
  while (node && ts.isConditionalExpression(node)) {
    const code = langCodeFromTest(node.condition);
    if (!code) break;
    sawLangTest = true;
    explicit[code] = node.whenTrue;
    node = node.whenFalse;
  }
  if (!sawLangTest) return null;
  return { explicit, elseNode: node };
}

/** Build {en,fr,bi} value nodes from a parsed chain, inferring the untested language from the else branch. */
function resolveTriple(parsed) {
  const { explicit, elseNode } = parsed;
  const triple = { ...explicit };
  const tested = Object.keys(explicit);
  const missing = ['en', 'fr', 'bi'].filter((c) => !tested.includes(c));
  if (missing.length === 1 && elseNode && !ts.isConditionalExpression(elseNode)) {
    triple[missing[0]] = elseNode;
  }
  return triple;
}

function litText(node) {
  return isStringLike(node) ? node.text : '';
}

/** Extract editable Bislama units from inline ternaries in a component file. */
function extractInline(absPath) {
  const { sf } = parseFile(absPath);
  const file = relPath(absPath);
  const units = [];
  const claimed = []; // [start,end] ranges already captured, to skip nested inner chains

  const visit = (node) => {
    if (ts.isConditionalExpression(node)) {
      const start = node.getStart(sf);
      const end = node.getEnd();
      const inside = claimed.some(([s, e]) => start >= s && end <= e);
      if (!inside) {
        const parsed = parseLangChain(node);
        if (parsed) {
          const triple = resolveTriple(parsed);
          // We can only safely round-trip when the Bislama branch is a plain string literal.
          if (isStringLike(triple.bi)) {
            const biNode = triple.bi;
            // Skip locale-code ternaries like `language === 'fr' ? 'fr' : ... : 'en'`
            // (these pass a locale string to date/number formatters, not real copy).
            const vals = [litText(triple.en), litText(triple.fr), biNode.text];
            if (vals.every((v) => LANG_CODES.has(v))) {
              claimed.push([start, end]);
              ts.forEachChild(node, visit);
              return;
            }
            claimed.push([start, end]);
            units.push({
              source: 'inline',
              file,
              start: biNode.getStart(sf),
              end: biNode.getEnd(),
              original: biNode.getText(sf),
              en: litText(triple.en),
              fr: litText(triple.fr),
              bi: biNode.text,
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return units;
}

/** Extract editable Bislama units from the central translations.ts table. */
function extractTranslations() {
  const { sf } = parseFile(TRANSLATIONS_FILE);
  const file = relPath(TRANSLATIONS_FILE);
  const units = [];

  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText() === 'translations' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const prop of node.initializer.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = ts.isStringLiteral(prop.name) ? prop.name.text : prop.name.getText();
        if (!ts.isObjectLiteralExpression(prop.initializer)) continue;
        const byLang = {};
        for (const lp of prop.initializer.properties) {
          if (!ts.isPropertyAssignment(lp)) continue;
          const lname = lp.name.getText().replace(/['"]/g, '');
          if (LANG_CODES.has(lname)) byLang[lname] = lp.initializer;
        }
        if (!isStringLike(byLang.bi)) continue;
        const biNode = byLang.bi;
        units.push({
          source: 'translations',
          file,
          key,
          start: biNode.getStart(sf),
          end: biNode.getEnd(),
          original: biNode.getText(sf),
          en: litText(byLang.en),
          fr: litText(byLang.fr),
          bi: biNode.text,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return units;
}

/** Build the full list of editable Bislama units across the codebase. */
export function buildUnits() {
  const units = [];
  units.push(...extractTranslations());
  for (const abs of collectSourceFiles()) {
    if (path.resolve(abs) === path.resolve(TRANSLATIONS_FILE)) continue;
    units.push(...extractInline(abs));
  }
  // Stable, human-friendly ids.
  units.forEach((u, i) => {
    const prefix = u.source === 'translations' ? 'TR' : 'IN';
    u.id = `${prefix}-${String(i + 1).padStart(4, '0')}`;
  });
  return units;
}

// ---------------------------------------------------------------------------
// CSV helpers (Excel / Google Sheets friendly, UTF-8 with BOM)
// ---------------------------------------------------------------------------

const CSV_COLUMNS = ['id', 'english', 'french', 'bislama', 'where'];

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function writeCsv(units) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const u of units) {
    const where = u.source === 'translations' ? `table: ${u.key}` : u.file;
    lines.push([u.id, u.en, u.fr, u.bi, where].map(csvEscape).join(','));
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(CSV_FILE, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8');
}

export function writeMap(units) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const map = units.map((u) => ({
    id: u.id,
    source: u.source,
    file: u.file,
    key: u.key ?? null,
    start: u.start,
    end: u.end,
    original: u.original,
    bi: u.bi,
  }));
  fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2) + '\n', 'utf8');
}

/**
 * Read a CSV file as text, auto-detecting the encoding so it works whether the
 * spreadsheet was saved as UTF-8 (Google Sheets / "CSV UTF-8") or Windows-1252
 * (default Excel "CSV"). Falls back to Windows-1252 only if strict UTF-8 fails.
 */
export function readCsvText(file) {
  const buf = fs.readFileSync(file);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** Minimal RFC-4180-ish CSV parser (handles quotes, commas, newlines). */
export function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c === '\r') {
      // ignore; handled by \n
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== '')).map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
    return obj;
  });
}

/** Re-quote a Bislama string in the same quote style as the original source literal. */
export function requote(original, value) {
  const quote = original[0];
  if (quote === '`') {
    return '`' + value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
  }
  if (quote === '"') {
    return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n') + '"';
  }
  return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n') + "'";
}
