import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');
const ASSETS_DIR = path.join(DIST_DIR, 'assets');

function gzipSize(buf) {
  return zlib.gzipSync(buf, { level: 9 }).byteLength;
}

function toKB(bytes) {
  return Math.round((bytes / 1024) * 100) / 100;
}

async function fileExists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function classify(name) {
  if (name.endsWith('.css')) return 'css';
  if (name.endsWith('.js')) return 'js';
  if (name.endsWith('.map')) return 'sourcemap';
  return 'other';
}

async function main() {
  if (!(await fileExists(ASSETS_DIR))) {
    console.error(`[bundle-report] Missing ${ASSETS_DIR}. Run "npm run build" first.`);
    process.exit(1);
  }

  const entries = await fs.readdir(ASSETS_DIR);
  const files = [];

  for (const name of entries) {
    const p = path.join(ASSETS_DIR, name);
    const stat = await fs.stat(p);
    if (!stat.isFile()) continue;
    if (name.endsWith('.map')) continue;
    const buf = await fs.readFile(p);
    files.push({
      name,
      type: classify(name),
      rawBytes: stat.size,
      gzipBytes: gzipSize(buf),
    });
  }

  files.sort((a, b) => b.gzipBytes - a.gzipBytes);

  const totals = files.reduce(
    (acc, f) => {
      acc.rawBytes += f.rawBytes;
      acc.gzipBytes += f.gzipBytes;
      return acc;
    },
    { rawBytes: 0, gzipBytes: 0 },
  );

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      rawKB: toKB(totals.rawBytes),
      gzipKB: toKB(totals.gzipBytes),
    },
    files: files.map((f) => ({
      name: f.name,
      type: f.type,
      rawKB: toKB(f.rawBytes),
      gzipKB: toKB(f.gzipBytes),
    })),
  };

  const outDir = path.join(ROOT, 'artifacts', 'perf');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'bundle-report.json');
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[bundle-report] Wrote ${path.relative(ROOT, outPath)}`);

  // Print top 10 for CI logs.
  console.log('[bundle-report] Top 10 (gzip KB):');
  for (const f of report.files.slice(0, 10)) {
    console.log(`- ${String(f.gzipKB).padStart(7)} KB  ${f.name}`);
  }
}

await main();

