import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

function parseArgs(argv) {
  const args = { mode: 'fail', warnOnly: false, updateBaseline: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode') args.mode = argv[i + 1] || args.mode;
    if (a === '--warn') args.mode = 'warn';
    if (a === '--fail') args.mode = 'fail';
    if (a === '--update-baseline') args.updateBaseline = true;
  }
  return args;
}

function fmtKB(n) {
  return `${Math.round(n * 100) / 100} KB`;
}

function stableKey(fileName) {
  // Convert `FooBar-ABC12345.js` -> `FooBar.js` for hash-stable tracking.
  return fileName.replace(/-[A-Za-z0-9]{6,}(?=\.(css|js)$)/, '');
}

function pickByStablePrefix(files, stablePrefix, type) {
  const matches = files.filter((f) => {
    const k = stableKey(f.name);
    return k.startsWith(stablePrefix) && (!type || f.type === type);
  });
  return matches;
}

function sumKB(files, field) {
  return files.reduce((s, f) => s + (Number(f[field]) || 0), 0);
}

async function readJson(p) {
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(p, obj) {
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function checkMax(name, actual, max, kind) {
  if (max == null) return null;
  if (actual <= max) return null;
  return {
    name,
    kind,
    actual,
    max,
    overBy: actual - max,
    overPct: max > 0 ? ((actual - max) / max) * 100 : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode === 'warn' ? 'warn' : 'fail';

  const budgetPath = path.join(ROOT, 'perf-budget.json');
  const reportPath = path.join(ROOT, 'artifacts', 'perf', 'bundle-report.json');

  const budget = await readJson(budgetPath);
  const report = await readJson(reportPath);

  const files = Array.isArray(report.files) ? report.files : [];
  const budgets = budget.budgets || {};

  const violations = [];

  // ── Totals ───────────────────────────────────────────────────────────────
  const totals = report.totals || {};
  if (budgets.totals) {
    violations.push(
      checkMax('totals.rawKB', Number(totals.rawKB), budgets.totals.rawKB, 'total'),
      checkMax('totals.gzipKB', Number(totals.gzipKB), budgets.totals.gzipKB, 'total'),
    );
  }

  // ── File budgets by stable prefix ────────────────────────────────────────
  // Back-compat with existing keys like:
  // - "index.css.gz.kb": 25  → stable prefix "index", type css, gzip
  // - "vendor-recharts.gz.kb": 120 → stable prefix "vendor-recharts", type js, gzip
  const handleLegacyBudgetMap = (map, type) => {
    if (!map) return;
    for (const [k, max] of Object.entries(map)) {
      if (typeof max !== 'number') continue;
      const parts = k.split('.');
      const stablePrefix = parts[0]; // "index" or "vendor-recharts"
      const isGz = k.includes('.gz.');
      const field = isGz ? 'gzipKB' : 'rawKB';
      const matches = pickByStablePrefix(files, stablePrefix, type);
      const actual = matches.length === 1 ? Number(matches[0][field]) : sumKB(matches, field);
      violations.push(checkMax(`${stablePrefix}.${type}.${field}`, actual, max, 'file'));
    }
  };
  handleLegacyBudgetMap(budgets.css, 'css');
  handleLegacyBudgetMap(budgets.js, 'js');

  // ── “Initial” heuristic budget (optional) ────────────────────────────────
  // If user provided budgets.js["initial.gz.kb"], treat it as a sum of stable prefixes.
  // Default prefixes for this project (kept small and explicit).
  const initialBudget = budgets.js?.['initial.gz.kb'];
  if (typeof initialBudget === 'number') {
    const initialPrefixes = budget.initial?.stablePrefixes || [
      'index',
      'vendor-react',
      'vendor-radix',
      'vendor-icons',
      'vendor-query',
      'vendor-supabase',
      'utils',
      'AppContext',
    ];
    const initialFiles = initialPrefixes.flatMap((p) => pickByStablePrefix(files, p, 'js'));
    const initialGzip = sumKB(initialFiles, 'gzipKB');
    violations.push(checkMax('initial.js.gzipKB', initialGzip, initialBudget, 'initial'));
  }

  // ── Baseline comparisons (percentage-based) ──────────────────────────────
  // Baseline entries should be stored as stableKey + gzipKB/rawKB.
  const baselineCfg = budget.baseline || {};
  const maxIncreasePct =
    typeof baselineCfg.maxIncreasePct === 'number' ? baselineCfg.maxIncreasePct : null;

  if (maxIncreasePct != null && Array.isArray(baselineCfg.top) && baselineCfg.top.length > 0) {
    const currentByStable = new Map();
    for (const f of files) currentByStable.set(stableKey(f.name), f);

    for (const b of baselineCfg.top) {
      if (!b || typeof b.stable !== 'string') continue;
      const cur = currentByStable.get(b.stable);
      if (!cur) continue;
      const baseGz = Number(b.gzipKB);
      const curGz = Number(cur.gzipKB);
      if (!Number.isFinite(baseGz) || baseGz <= 0) continue;
      const pct = ((curGz - baseGz) / baseGz) * 100;
      if (pct > maxIncreasePct) {
        violations.push({
          name: `baseline.gzipKB increase: ${b.stable}`,
          kind: 'baseline',
          actual: curGz,
          max: baseGz * (1 + maxIncreasePct / 100),
          overBy: curGz - baseGz,
          overPct: pct,
        });
      }
    }
  }

  const cleanViolations = violations.filter(Boolean);

  // ── Output ───────────────────────────────────────────────────────────────
  console.log(`[perf-budget] Report: ${path.relative(ROOT, reportPath)}`);
  console.log(`[perf-budget] Budget: ${path.relative(ROOT, budgetPath)}`);
  console.log(`[perf-budget] Mode: ${mode}`);

  if (cleanViolations.length === 0) {
    console.log('[perf-budget] OK: all budgets satisfied.');
  } else {
    const level = mode === 'warn' ? 'WARN' : 'FAIL';
    console.log(`[perf-budget] ${level}: ${cleanViolations.length} budget issue(s)`);
    for (const v of cleanViolations) {
      const pct = v.overPct == null ? '' : ` (${Math.round(v.overPct * 10) / 10}%)`;
      console.log(
        `- ${v.name}: ${fmtKB(v.actual)} > ${fmtKB(v.max)} by ${fmtKB(v.overBy)}${pct}`,
      );
    }
    console.log('');
    console.log('[perf-budget] Actionable tips:');
    console.log('- Confirm heavy libs stay behind React.lazy() and import barriers (`src/lib/heavyChunks.ts`).');
    console.log('- Use `npm run perf:analyze` to generate `artifacts/perf/bundle-visualizer.html`.');
    console.log('- If changes are intentional, update baseline with `npm run perf:budget:update-baseline`.');
  }

  // ── Baseline update mode ────────────────────────────────────────────────
  if (args.updateBaseline) {
    const top = files
      .slice()
      .sort((a, b) => Number(b.gzipKB) - Number(a.gzipKB))
      .slice(0, 15)
      .map((f) => ({ stable: stableKey(f.name), gzipKB: f.gzipKB, rawKB: f.rawKB }));

    budget.baseline = {
      ...baselineCfg,
      generatedAt: report.generatedAt || new Date().toISOString(),
      top,
    };
    await writeJson(budgetPath, budget);
    console.log(`[perf-budget] Updated baseline in ${path.relative(ROOT, budgetPath)}`);
  }

  if (cleanViolations.length > 0 && mode === 'fail') process.exit(2);
}

await main();

